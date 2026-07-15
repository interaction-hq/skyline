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
  bindOutboundMessage,
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
  SlackGrpcClient,
  slackGrpcTarget,
} from "./grpc.js";
import { SlackClient } from "./rest.js";
import { connectSlackSocket } from "./socket.js";
import {
  slackDedicatedLines,
  type SlackConfig,
  type SlackDedicatedConfig,
} from "./config.js";

async function readAttachmentBytes(file: AttachmentSend): Promise<Uint8Array> {
  return readMediaBytes({
    data: file.data,
    path: file.path,
    url: file.url,
  });
}

function createBinder(host: SkylineHost) {
  const slackFor = (teamId?: string): SlackClient | SlackGrpcClient => {
    const line = host.lineForPlatform("slack", teamId);
    if (!line.slack) {
      throw new Error("slack client not ready");
    }
    return line.slack as SlackClient | SlackGrpcClient;
  };

  const uploadFile = async (
    channel: Channel,
    to: string,
    teamId: string | undefined,
    file: AttachmentSend,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const bytes = await readAttachmentBytes(file);
    const res = await slackFor(teamId).uploadFile(
      to,
      {
        data: bytes,
        name: file.name ?? "attachment",
      },
      { replyTo: sendOpts?.replyTo }
    );
    return bindOutboundMessage(channel, {
      content: {
        type: "attachment",
        data: bytes,
        name: file.name,
      },
      guid: res.messageId,
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: to,
    });
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    teamId: string | undefined,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const res = await slackFor(teamId).sendText(to, body, {
          replyTo: sendOpts?.replyTo,
        });
        guid = res.messageId;
        break;
      }
      case "attachment": {
        const bytes = await readMediaBytes(content);
        const res = await slackFor(teamId).uploadFile(
          to,
          {
            data: bytes,
            mimeType: content.mimeType,
            name: content.name ?? "attachment",
          },
          { replyTo: sendOpts?.replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "voice": {
        const bytes = await readMediaBytes(content);
        const res = await slackFor(teamId).uploadFile(
          to,
          {
            data: bytes,
            mimeType: content.mimeType,
            name:
              content.name ??
              mimeToMediaName(content.mimeType, "voice"),
          },
          { replyTo: sendOpts?.replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "app": {
        const body = [content.caption, content.url].filter(Boolean).join("\n");
        const res = await slackFor(teamId).sendText(to, body || content.url, {
          replyTo: sendOpts?.replyTo,
        });
        guid = res.messageId;
        break;
      }
      case "flow": {
        const body =
          content.caption ??
          content.summary ??
          content.appId ??
          "[Flow]";
        const res = await slackFor(teamId).sendText(to, body, {
          replyTo: sendOpts?.replyTo,
        });
        guid = res.messageId;
        break;
      }
      case "group": {
        const first = content.items[0];
        if (first?.type === "attachment") {
          let last: Message | undefined;
          for (const item of content.items) {
            if (item.type !== "attachment") {
              host.unsupported("slack", "sending group content with mixed types");
            }
            last = await sendResolved(channel, to, teamId, item, sendOpts);
          }
          return last;
        }
        host.unsupported("slack", "sending group content");
        break;
      }
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendResolved(channel, to, teamId, content.content, {
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
          host.unsupported("slack", `editing ${inner.type} content`);
        }
        await slackFor(teamId).editText(to, targetGuid, newText);
        break;
      }
      case "unsend": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("unsend: target message has no guid");
        }
        await slackFor(teamId).deleteMessage(to, targetGuid);
        break;
      }
      case "reaction": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reaction: target message has no guid");
        }
        await slackFor(teamId).addReaction(to, targetGuid, content.emoji);
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
      case "rich_message":
      case "story":
      case "giveaway":
      case "giveaway_winners":
      case "live_photo":
      case "media_album":
      case "wa_contacts":
        host.unsupported("slack", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, {
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: to,
    });
  };

  const fileDownload = (
    teamId: string | undefined,
    fileId: string
  ): {
    read: () => Promise<Uint8Array>;
    stream: () => Promise<ReadableStream<Uint8Array>>;
  } => ({
    read: () => slackFor(teamId).downloadFile(fileId),
    stream: async () => {
      const bytes = await slackFor(teamId).downloadFile(fileId);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  });

  const inboundSlackMessage = (
    channel: Channel,
    event: {
      files?: {
        id: string;
        mimetype?: string;
        name?: string;
        size?: number;
      }[];
      isFromMe: boolean;
      messageId: string;
      subtype?: string;
      text: string;
      threadTs?: string;
      userId: string;
    },
    teamId: string
  ): Message =>
    bindMessage(channel, {
      content: { text: event.text, type: "text" },
      ...(event.files?.length
        ? {
            attachments: event.files.map((f) =>
              attachmentWithDownload(
                {
                  guid: f.id,
                  mimeType: f.mimetype,
                  name: f.name,
                  size: f.size,
                },
                fileDownload(teamId, f.id)
              )
            ),
          }
        : {}),
      guid: event.messageId,
      isFromMe: event.isFromMe,
      platform: "slack",
      ...(event.threadTs ? { replyTo: { messageGuid: event.threadTs } } : {}),
      sender: { id: event.userId },
      slack: {
        subtype: event.subtype,
        teamId,
        threadTs: event.threadTs,
        ts: event.messageId,
      },
      timestamp: new Date(),
    });

  const makeChannel = (to: string, teamId?: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, teamId, resolved, sendOpts),
        content,
        "slack"
      );
    const sugar = contentSugar(send);
    channel = {
    ...sugar,
    ...unsupportedChatExtras((verb) => host.unsupported("slack", verb)),
    background: async () => host.unsupported("slack", "background"),
    contact: async () => null,
    edit: async (messageGuid, update) => {
      const text = typeof update === "string" ? update : update.text;
      if (text == null) {
        host.unsupported("slack", "edit without text");
      }
      await slackFor(teamId).editText(to, messageGuid, text);
    },
    focusStatus: async () => null,
    getAttachment: async (guid) => {
      const bytes = await slackFor(teamId).downloadFile(guid);
      return attachmentWithDownload(
        { guid },
        {
          read: async () => bytes,
          stream: async () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
        }
      );
    },
    getDisplayName: async () => null,
    getMessage: async () => null,
    group: {
      ...unsupportedGroupExtras((verb) => host.unsupported("slack", verb)),
      add: (handle) => sugar.add(handle),
      getIcon: async () => null,
      getName: async () => null,
      leave: () => sugar.leave(),
      participants: async () => host.unsupported("slack", "group.participants"),
      remove: (handle) => sugar.remove(handle),
      setBackground: async () => host.unsupported("slack", "group.setBackground"),
      setIcon: async () => host.unsupported("slack", "group.setIcon"),
      setName: (name) => sugar.rename(name),
    },
    listMessages: async () => [],
    platform: "slack",
    poll: unsupportedPollOps((verb) => host.unsupported("slack", verb)),
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      const client = slackFor(teamId);
      if (reactOpts?.remove) {
        await client.removeReaction(to, messageGuid, reaction);
      } else {
        await client.addReaction(to, messageGuid, reaction);
      }
    },
    read: async () => {},
    readReceipt: async () => {},
    responding: (fn) => withResponding(channel, fn),
    reply: (messageGuid, content, sendOpts) =>
      send(content, { ...sendOpts, replyTo: messageGuid }),
    send,
    sendFile: (file, sendOpts) =>
      uploadFile(channel, to, teamId, file, sendOpts),
    sendFiles: async (files, sendOpts) => {
      if (files.length === 0) {
        throw new Error("sendFiles: needs at least one file");
      }
      let last: Message | undefined;
      for (const file of files) {
        last = await uploadFile(channel, to, teamId, file, sendOpts);
      }
      return last;
    },
    shareContactCard: async () => host.unsupported("slack", "shareContactCard"),
    pin: async () => host.unsupported("slack", "pin"),
    shareLocation: async () => host.unsupported("slack", "shareLocation"),
    stopLocation: async () => host.unsupported("slack", "stopLocation"),
    unpin: async () => host.unsupported("slack", "unpin"),
    to,
    typing: async () => {},
    unsend: async (messageGuid) => {
      await slackFor(teamId).deleteMessage(to, messageGuid);
    },
  };
  return channel;
};

  const connectLine = (line: ResolvedLine): void => {
    if (!line.slack) {
      return;
    }
    const teamId = line.slack.teamId ?? line.phone ?? "slack";
    const botUserId = line.slack.team?.botUserId;
    const key = line.phone || teamId;
    const streams: { cancel: () => void }[] = [];

    const accessToken = line.slack.accessToken ?? line.token;
    const useGrpc =
      Boolean(line.slack.accessToken) ||
      Boolean(line.address && !line.slack.botToken?.startsWith("xoxb-"));

    const pushInbound = (
      channelId: string,
      event: {
        files?: {
          id: string;
          mimetype?: string;
          name?: string;
          size?: number;
        }[];
        isFromMe: boolean;
        messageId: string;
        subtype?: string;
        text: string;
        threadTs?: string;
        userId: string;
      }
    ) => {
      const channel = makeChannel(channelId, teamId);
      host.queue.push([
        channel,
        inboundSlackMessage(channel, event, teamId),
      ]);
    };

    if (useGrpc && accessToken) {
      const client = new SlackGrpcClient(
        slackGrpcTarget(line.slack.endpoint || line.address),
        teamId,
        accessToken
      );
      const sub = client.subscribe({
        onMention(event) {
          pushInbound(event.channelId, {
            isFromMe: event.isFromMe,
            messageId: event.messageId,
            text: event.text,
            userId: event.userId,
          });
        },
        onReaction(event) {
          const channel = makeChannel(event.channelId, teamId);
          host.emit(
            "reaction",
            {
              messageGuid: event.messageId,
              platform: "slack",
              reaction: event.emoji,
              removed: event.removed,
              sender: { id: event.userId },
              timestamp: new Date(),
            },
            channel
          );
        },
        onText(event) {
          pushInbound(event.channelId, {
            files: event.files,
            isFromMe: event.isFromMe,
            messageId: event.messageId,
            subtype: event.subtype,
            text: event.text,
            threadTs: event.threadTs,
            userId: event.userId,
          });
        },
      });
      streams.push(sub);
      host.live.set(key, {
        platform: "slack",
        slack: client,
        slackBotUserId: botUserId,
        slackTeamId: teamId,
        streams,
      });
      host.ready.add(key);
      return;
    }

    if (!line.slack.botToken) {
      return;
    }
    const client = new SlackClient({
      baseUrl: line.slack.endpoint,
      botToken: line.slack.botToken,
    });

    if (line.slack.appToken) {
      const socket = connectSlackSocket({
        appToken: line.slack.appToken,
        handlers: {
          onEdited(event) {
            if (!event.channelId) {
              return;
            }
            const channel = makeChannel(event.channelId, teamId);
            host.emit(
              "edited",
              {
                messageGuid: event.messageId,
                platform: "slack",
                sender: { id: event.userId },
                text: event.text,
                timestamp: new Date(),
              },
              channel
            );
          },
          onMention(event) {
            const isFromMe = Boolean(
              botUserId && event.userId === botUserId
            );
            pushInbound(event.channelId, {
              isFromMe,
              messageId: event.messageId,
              text: event.text,
              userId: event.userId,
            });
          },
          onReaction(event) {
            const channel = makeChannel(event.channelId, teamId);
            host.emit(
              "reaction",
              {
                messageGuid: event.messageId,
                platform: "slack",
                reaction: event.emoji,
                removed: event.removed,
                sender: { id: event.userId },
                timestamp: new Date(),
              },
              channel
            );
          },
          onText(event) {
            const isFromMe =
              Boolean(botUserId && event.userId === botUserId) ||
              Boolean(event.isBot);
            pushInbound(event.channelId, {
              files: event.files,
              isFromMe,
              messageId: event.messageId,
              subtype: event.subtype,
              text: event.text,
              threadTs: event.threadTs,
              userId: event.userId,
            });
          },
        },
      });
      streams.push(socket);
    }

    host.live.set(key, {
      platform: "slack",
      slack: client,
      slackBotUserId: botUserId,
      slackTeamId: teamId,
      streams,
    });
    host.ready.add(key);
  };

  return {
    platform: "slack" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      slackDedicatedLines(config as SlackDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: SlackConfig): void {
  host.register(createBinder(host));
}
