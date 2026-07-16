import type {
  AttachmentSend,
  Content,
  ContentInput,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  bindMessage,
  contentSugar,
  messageFromSend,
  mimeToMediaName,
  readMediaBytes,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import {
  type DiscordCreateMessage,
  type DiscordMessage,
  DiscordRestClient,
} from "./rest.js";
import { connectDiscordGateway } from "./gateway.js";
import {
  type DiscordConfig,
  type DiscordDedicatedConfig,
  DEFAULT_INTENTS,
  discordDedicatedLines,
} from "./config.js";

function replyRef(replyTo?: string): Pick<DiscordCreateMessage, "message_reference"> {
  return replyTo
    ? { message_reference: { fail_if_not_exists: false, message_id: replyTo } }
    : {};
}

function createBinder(host: SkylineHost) {
  const clients = new Map<string, DiscordRestClient>();
  const botIds = new Map<string, string>();

  const restFor = (scopeId?: string): DiscordRestClient => {
    const line = host.lineForPlatform("discord", scopeId);
    const client = line.discord as DiscordRestClient | undefined;
    if (!client) {
      throw new Error("discord client not ready");
    }
    return client;
  };

  const attachmentDownload = (
    scopeId: string | undefined,
    url: string
  ): {
    read: () => Promise<Uint8Array>;
    stream: () => Promise<ReadableStream<Uint8Array>>;
  } => ({
    read: () => restFor(scopeId).downloadAttachment(url),
    stream: async () => {
      const bytes = await restFor(scopeId).downloadAttachment(url);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  });

  const uploadFile = async (
    to: string,
    scopeId: string | undefined,
    file: AttachmentSend,
    sendOpts?: SendOptions,
    caption?: string
  ): Promise<string> => {
    const bytes = await readMediaBytes({
      data: file.data,
      path: file.path,
      url: file.url,
    });
    const res = await restFor(scopeId).uploadFile(
      to,
      { data: bytes, mimeType: file.mimeType, name: file.name ?? "attachment" },
      { ...(caption ? { content: caption } : {}), ...replyRef(sendOpts?.replyTo) }
    );
    return res.id;
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    scopeId: string | undefined,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const rest = restFor(scopeId);
    let guid: string | undefined;
    switch (content.type) {
      case "text": {
        const res = await rest.createMessage(to, {
          content: content.text,
          ...replyRef(sendOpts?.replyTo),
        });
        guid = res.id;
        break;
      }
      case "markdown": {
        const res = await rest.createMessage(to, {
          content: content.body,
          ...replyRef(sendOpts?.replyTo),
        });
        guid = res.id;
        break;
      }
      case "rich_message": {
        const body = content.markdown ?? content.text ?? "";
        const res = await rest.createMessage(to, {
          content: body,
          ...replyRef(sendOpts?.replyTo),
        });
        guid = res.id;
        break;
      }
      case "attachment": {
        guid = await uploadFile(
          to,
          scopeId,
          {
            data: content.data,
            mimeType: content.mimeType,
            name: content.name ?? mimeToMediaName(content.mimeType, "file"),
            path: content.path,
            url: content.url,
          },
          sendOpts,
          content.caption
        );
        break;
      }
      case "voice": {
        guid = await uploadFile(
          to,
          scopeId,
          {
            data: content.data,
            mimeType: content.mimeType,
            name: content.name ?? mimeToMediaName(content.mimeType, "voice"),
            path: content.path,
            url: content.url,
          },
          sendOpts
        );
        break;
      }
      case "app": {
        const body = [content.caption, content.url].filter(Boolean).join("\n");
        const res = await rest.createMessage(to, {
          content: body || content.url,
          ...replyRef(sendOpts?.replyTo),
        });
        guid = res.id;
        break;
      }
      case "flow": {
        const body = content.caption ?? content.summary ?? content.appId ?? "[Flow]";
        const res = await rest.createMessage(to, {
          content: body,
          ...replyRef(sendOpts?.replyTo),
        });
        guid = res.id;
        break;
      }
      case "group": {
        let last: string | undefined;
        for (const item of content.items) {
          if (item.type !== "attachment") {
            host.unsupported("discord", "sending non-attachment group items");
          }
          last = await uploadFile(
            to,
            scopeId,
            {
              data: item.data,
              mimeType: item.mimeType,
              name: item.name ?? mimeToMediaName(item.mimeType, "file"),
              path: item.path,
              url: item.url,
            },
            sendOpts,
            item.caption
          );
        }
        guid = last;
        break;
      }
      case "media_album": {
        let last: string | undefined;
        for (const item of content.items) {
          last = await uploadFile(
            to,
            scopeId,
            {
              data: item.data,
              mimeType: item.mimeType,
              name: item.name ?? mimeToMediaName(item.mimeType, "file"),
              path: item.path,
              url: item.url,
            },
            sendOpts
          );
        }
        guid = last;
        break;
      }
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendResolved(channel, to, scopeId, content.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "edit": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("edit: target message has no guid");
        }
        const inner = content.content;
        const newText =
          inner.type === "text"
            ? inner.text
            : inner.type === "markdown"
              ? inner.body
              : undefined;
        if (newText === undefined) {
          host.unsupported("discord", `editing ${inner.type} content`);
        }
        await rest.editMessage(to, targetGuid, { content: newText });
        break;
      }
      case "unsend": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("unsend: target message has no guid");
        }
        await rest.deleteMessage(to, targetGuid);
        break;
      }
      case "reaction": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reaction: target message has no guid");
        }
        await rest.addReaction(to, targetGuid, content.emoji);
        break;
      }
      case "read":
      case "typing":
        break;
      case "rename":
      case "avatar":
      case "addMember":
      case "removeMember":
      case "leaveChannel":
      case "custom":
      case "stream_text":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "keyboard":
      case "location":
      case "dice":
      case "forward":
      case "forward_many":
      case "copy":
      case "copy_many":
      case "invoice":
      case "game":
      case "checklist":
      case "paid_media":
      case "gift":
      case "story":
      case "giveaway":
      case "giveaway_winners":
      case "live_photo":
      case "wa_contacts":
        host.unsupported("discord", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, {
      discord: { channelId: to },
      replyTo: sendOpts?.replyTo ? { messageGuid: sendOpts.replyTo } : undefined,
      senderId: to,
    });
  };

  const inboundMessage = (
    channel: Channel,
    msg: DiscordMessage,
    scopeId: string | undefined,
    botId?: string
  ): Message =>
    bindMessage(channel, {
      content: { text: msg.content ?? "", type: "text" },
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) =>
              attachmentWithDownload(
                {
                  guid: a.id,
                  mimeType: a.content_type,
                  name: a.filename,
                  size: a.size,
                },
                attachmentDownload(scopeId, a.url)
              )
            ),
          }
        : {}),
      discord: {
        channelId: msg.channel_id,
        guildId: msg.guild_id,
        isBot: msg.author?.bot,
        messageType: msg.type,
        webhookId: msg.webhook_id,
      },
      guid: msg.id,
      isFromMe: botId
        ? msg.author?.id === botId
        : Boolean(msg.author?.bot),
      platform: "discord",
      ...(msg.message_reference?.message_id
        ? { replyTo: { messageGuid: msg.message_reference.message_id } }
        : {}),
      sender: {
        displayName: msg.author?.global_name,
        handle: msg.author?.username,
        id: msg.author?.id ?? "unknown",
      },
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    });

  const makeChannel = (to: string, scopeId?: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, scopeId, resolved, sendOpts),
        content,
        "discord"
      );
    const sugar = contentSugar(send);
    channel = {
      ...sugar,
      ...unsupportedChatExtras((verb) => host.unsupported("discord", verb)),
      background: async () => host.unsupported("discord", "background"),
      contact: async () => null,
      edit: async (messageGuid, update) => {
        const text = typeof update === "string" ? update : update.text;
        if (text == null) {
          host.unsupported("discord", "edit without text");
        }
        await restFor(scopeId).editMessage(to, messageGuid, { content: text });
      },
      focusStatus: async () => null,
      getAttachment: async (guid) => {
        const message = await restFor(scopeId).getMessage(to, guid);
        const file = message.attachments?.[0];
        if (!file) {
          return null;
        }
        return attachmentWithDownload(
          {
            guid: file.id,
            mimeType: file.content_type,
            name: file.filename,
            size: file.size,
          },
          attachmentDownload(scopeId, file.url)
        );
      },
      getDisplayName: async () => null,
      getMessage: async (guid) => {
        const message = await restFor(scopeId).getMessage(to, guid);
        return inboundMessage(channel, message, scopeId, botIds.get(scopeId ?? ""));
      },
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("discord", verb)),
        add: () => host.unsupported("discord", "group.add"),
        getIcon: async () => null,
        getName: async () => null,
        leave: () => host.unsupported("discord", "group.leave"),
        participants: async () => host.unsupported("discord", "group.participants"),
        remove: async (handle) => {
          const line = host.lineForPlatform("discord", scopeId);
          const guildId = (line.discord as { guildId?: string } | undefined)
            ?.guildId;
          if (!guildId) {
            host.unsupported("discord", "group.remove without guildId");
          }
          await restFor(scopeId).removeMember(guildId, handle);
        },
        setBackground: async () => host.unsupported("discord", "group.setBackground"),
        setIcon: async () => host.unsupported("discord", "group.setIcon"),
        setName: (name) => sugar.rename(name),
      },
      listMessages: async () => {
        const rows = await restFor(scopeId).listMessages(to, 50);
        return rows.map((m) =>
          inboundMessage(channel, m, scopeId, botIds.get(scopeId ?? ""))
        );
      },
      platform: "discord",
      poll: unsupportedPollOps((verb) => host.unsupported("discord", verb)),
      reachable: async () => true,
      react: async (messageGuid, reaction: Reaction, reactOpts) => {
        const rest = restFor(scopeId);
        if (reactOpts?.remove) {
          await rest.removeReaction(to, messageGuid, reaction);
        } else {
          await rest.addReaction(to, messageGuid, reaction);
        }
      },
      read: async () => {},
      readReceipt: async () => {},
      rename: async (name) => {
        await restFor(scopeId).renameChannel(to, name);
      },
      responding: (fn) => withResponding(channel, fn),
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async (file, sendOpts) => {
        const id = await uploadFile(to, scopeId, file, sendOpts);
        return messageFromSend(
          channel,
          { data: new Uint8Array(), name: file.name, type: "attachment" },
          id,
          { discord: { channelId: to }, senderId: to }
        );
      },
      sendFiles: async (files, sendOpts) => {
        if (files.length === 0) {
          throw new Error("sendFiles: needs at least one file");
        }
        let last: string | undefined;
        for (const file of files) {
          last = await uploadFile(to, scopeId, file, sendOpts);
        }
        return messageFromSend(
          channel,
          { data: new Uint8Array(), type: "attachment" },
          last,
          { discord: { channelId: to }, senderId: to }
        );
      },
      shareContactCard: async () => host.unsupported("discord", "shareContactCard"),
      shareLocation: async () => host.unsupported("discord", "shareLocation"),
      stopLocation: async () => host.unsupported("discord", "stopLocation"),
      updateLocation: async () => host.unsupported("discord", "updateLocation"),
      pin: async (messageGuid) => {
        if (!messageGuid) {
          host.unsupported("discord", "pin without messageGuid");
        }
        await restFor(scopeId).pinMessage(to, messageGuid);
      },
      unpin: async (messageGuid) => {
        if (!messageGuid) {
          host.unsupported("discord", "unpin without messageGuid");
        }
        await restFor(scopeId).unpinMessage(to, messageGuid);
      },
      to,
      typing: async () => {
        await restFor(scopeId).triggerTyping(to);
      },
      unsend: async (messageGuid) => {
        await restFor(scopeId).deleteMessage(to, messageGuid);
      },
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.discord) {
      return;
    }
    const { botToken, intents } = line.discord;
    const scopeId = line.discord.applicationId ?? line.phone ?? "discord";
    const rest = new DiscordRestClient({
      baseUrl: line.discord.baseUrl,
      botToken,
    });
    clients.set(scopeId, rest);

    const streams: { cancel: () => void }[] = [];
    const gateway = connectDiscordGateway({
      handlers: {
        onDelete(event) {
          const channel = makeChannel(event.channelId, scopeId);
          host.emit(
            "unsent",
            {
              messageGuid: event.messageId,
              platform: "discord",
              sender: { id: "unknown" },
              timestamp: new Date(),
            },
            channel
          );
        },
        onMessage(msg) {
          const channel = makeChannel(msg.channel_id, scopeId);
          host.queue.push([
            channel,
            inboundMessage(channel, msg, scopeId, botIds.get(scopeId)),
          ]);
        },
        onMessageUpdate(msg) {
          const channel = makeChannel(msg.channel_id, scopeId);
          host.emit(
            "edited",
            {
              messageGuid: msg.id,
              platform: "discord",
              sender: { id: msg.author?.id ?? "unknown" },
              text: msg.content ?? "",
              timestamp: new Date(),
            },
            channel
          );
        },
        onReaction(event) {
          const channel = makeChannel(event.channelId, scopeId);
          host.emit(
            "reaction",
            {
              messageGuid: event.messageId,
              platform: "discord",
              reaction: event.emoji,
              removed: event.removed,
              sender: { id: event.userId },
              timestamp: new Date(),
            },
            channel
          );
        },
        onReady(bot) {
          botIds.set(scopeId, bot.id);
        },
        onTyping(event) {
          const channel = makeChannel(event.channelId, scopeId);
          host.emit(
            "typing",
            {
              platform: "discord",
              sender: { id: event.userId },
              timestamp: new Date(),
              typing: true,
            },
            channel
          );
        },
      },
      intents: intents ?? DEFAULT_INTENTS,
      token: botToken,
    });
    streams.push(gateway);

    host.live.set(scopeId, {
      discord: rest,
      platform: "discord",
      streams,
    });
    host.ready.add(scopeId);
  };

  return {
    connectLine,
    dedicatedLines: (config: unknown) =>
      discordDedicatedLines(config as DiscordDedicatedConfig),
    makeChannel,
    platform: "discord" as Platform,
  };
}

export function bind(host: SkylineHost, _config: DiscordConfig): void {
  host.register(createBinder(host));
}
