import type {
  AttachmentSend,
  ContentInput,
  GroupContent,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { resolveContent } from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  bindMessage,
  bindOutboundMessage,
  contentSugar,
  messageFromSend,
  readMediaBytes,
  sendWithFallbacks,
  stubAttachmentDownload,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { grpcTarget, WhatsappGrpcClient } from "./grpc.js";
import {
  whatsappDedicatedLines,
  type WhatsappConfig,
  type WhatsappDedicatedConfig,
} from "./config.js";

async function readBytes(input: {
  data?: Uint8Array | ArrayBuffer;
  path?: string;
  url?: string;
}): Promise<Uint8Array> {
  return readMediaBytes(input);
}

function isImageMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

function isVideoMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("video/"));
}

function isAudioMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("audio/"));
}

function albumItem(
  content: { caption?: string; data: Uint8Array; mimeType?: string; name?: string }
): { caption?: string; data: Uint8Array; kind: "MEDIA_KIND_IMAGE" | "MEDIA_KIND_VIDEO" } | null {
  if (isVideoMime(content.mimeType)) {
    return { caption: content.name, data: content.data, kind: "MEDIA_KIND_VIDEO" };
  }
  if (isImageMime(content.mimeType) || !content.mimeType) {
    return { caption: content.name, data: content.data, kind: "MEDIA_KIND_IMAGE" };
  }
  return null;
}

function createBinder(host: SkylineHost, projectId: string) {
  const waFor = (to: string): WhatsappGrpcClient => {
    const line = host.lineFor(to);
    if (!line.wa) {
      throw new Error(`line ${to} is not a WhatsApp line`);
    }
    return line.wa as WhatsappGrpcClient;
  };

  const sendAttachment = async (
    channel: Channel,
    to: string,
    content: {
      data?: Uint8Array;
      isAudioMessage?: boolean;
      mimeType?: string;
      name?: string;
      path?: string;
      type: "attachment";
      url?: string;
    },
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const grpc = waFor(to);
    const id = host.newId();
    const data = await readBytes(content);
    if (content.isAudioMessage || isAudioMime(content.mimeType)) {
      const res = await grpc.sendAudio(to, data, content.mimeType, id);
      void sendOpts;
      return bindOutboundMessage(channel, {
        content: {
          type: "attachment",
          data,
          isAudioMessage: true,
          mimeType: content.mimeType,
          name: content.name,
          path: content.path,
        },
        guid: res.messageId,
        senderId: to,
      });
    }
    if (isImageMime(content.mimeType) || isVideoMime(content.mimeType)) {
      const res = await grpc.sendMediaMessage(
        to,
        {
          caption: content.name,
          data,
          kind: isVideoMime(content.mimeType)
            ? "MEDIA_KIND_VIDEO"
            : "MEDIA_KIND_IMAGE",
        },
        id
      );
      void sendOpts;
      return bindOutboundMessage(channel, {
        content: {
          type: "attachment",
          data,
          mimeType: content.mimeType,
          name: content.name,
          path: content.path,
        },
        guid: res.messageId,
        senderId: to,
      });
    }
    const res = await grpc.sendDocument(
      to,
      data,
      {
        caption: content.name,
        fileName: content.name,
        mimeType: content.mimeType,
      },
      id
    );
    void sendOpts;
    return bindOutboundMessage(channel, {
      content: {
        type: "attachment",
        data,
        mimeType: content.mimeType,
        name: content.name,
        path: content.path,
      },
      guid: res.messageId,
      senderId: to,
    });
  };

  const sendGroupAlbum = async (
    channel: Channel,
    to: string,
    content: GroupContent,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const items = [];
    const groupItems = [];
    for (const item of content.items) {
      if (item.type !== "attachment") {
        host.unsupported("whatsapp", "sending group content with mixed types");
      }
      const bytes = await readBytes(item);
      const album = albumItem({ ...item, data: bytes });
      if (!album) {
        host.unsupported("whatsapp", "sending group content with non-album items");
      }
      items.push(album);
      groupItems.push({ ...item, data: bytes });
    }
    if (items.length < 2) {
      host.unsupported("whatsapp", "sending group content");
    }
    const res = await waFor(to).sendAlbum(to, items, host.newId());
    void sendOpts;
    return bindOutboundMessage(channel, {
      content: {
        type: "group",
        items: groupItems,
      },
      guid: res.messageIds[0],
      senderId: to,
    });
  };

  const sendContent = async (
    channel: Channel,
    to: string,
    input: ContentInput,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const content = await resolveContent(input);
    const grpc = waFor(to);
    const id = host.newId();
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const res = await grpc.sendText(to, body, id, sendOpts?.replyTo);
        guid = res.messageId;
        break;
      }
      case "attachment":
        return sendAttachment(channel, to, content, sendOpts);
      case "voice": {
        const data = await readBytes(content);
        const res = await grpc.sendAudio(to, data, content.mimeType, id);
        void sendOpts;
        return bindOutboundMessage(channel, {
          content: {
            type: "voice",
            data,
            mimeType: content.mimeType,
            name: content.name,
            path: content.path,
          },
          guid: res.messageId,
          senderId: to,
        });
      }
      case "group":
        return sendGroupAlbum(channel, to, content, sendOpts);
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendContent(channel, to, content.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "reaction": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reaction: target message has no guid");
        }
        await grpc.sendReaction(to, targetGuid, content.emoji);
        break;
      }
      case "read":
      case "typing":
        break;
      case "edit":
      case "unsend":
      case "rename":
      case "avatar":
      case "addMember":
      case "removeMember":
      case "leaveChannel":
      case "app":
      case "custom":
      case "flow":
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
        host.unsupported("whatsapp", `sending ${content.type} content`);
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

  const makeChannel = (to: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendContent(channel, to, resolved, sendOpts),
        content,
        "whatsapp"
      );
    const sugar = contentSugar(send);
    channel = {
    ...sugar,
    ...unsupportedChatExtras((verb) => host.unsupported("whatsapp", verb)),
    background: async () => host.unsupported("whatsapp", "background"),
    contact: async () => null,
    edit: () => host.unsupported("whatsapp", "edit"),
    focusStatus: async () => null,
    getAttachment: async () => null,
    getDisplayName: async () => null,
    getMessage: async () => null,
    group: {
      ...unsupportedGroupExtras((verb) => host.unsupported("whatsapp", verb)),
      add: (handle) => sugar.add(handle),
      getIcon: async () => null,
      getName: async () => null,
      leave: () => sugar.leave(),
      participants: async () => host.unsupported("whatsapp", "group.participants"),
      remove: (handle) => sugar.remove(handle),
      setBackground: async () => host.unsupported("whatsapp", "group.setBackground"),
      setIcon: async () => host.unsupported("whatsapp", "group.setIcon"),
      setName: (name) => sugar.rename(name),
    },
    listMessages: async () => [],
    platform: "whatsapp",
    poll: unsupportedPollOps((verb) => host.unsupported("whatsapp", verb)),
    reachable: async () => true,
    react: (messageGuid, reaction: Reaction, reactOpts) =>
      waFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      ),
    read: async () => {},
    readReceipt: async () => host.unsupported("whatsapp", "readReceipt"),
    responding: (fn) => withResponding(channel, fn),
    reply: (messageGuid, content, sendOpts) =>
      send(content, { ...sendOpts, replyTo: messageGuid }),
    send,
    sendFile: async (file: AttachmentSend, sendOpts) =>
      sendAttachment(
        channel,
        to,
        {
          data:
            file.data instanceof Uint8Array
              ? file.data
              : file.data
                ? new Uint8Array(file.data)
                : undefined,
          isAudioMessage: file.audio,
          name: file.name,
          path: file.path,
          type: "attachment",
        },
        sendOpts
      ),
    sendFiles: async (files, sendOpts) => {
      if (files.length === 0) {
        throw new Error("sendFiles: needs at least one file");
      }
      if (files.length === 1) {
        return sendAttachment(
          channel,
          to,
          {
            data:
              files[0].data instanceof Uint8Array
                ? files[0].data
                : files[0].data
                  ? new Uint8Array(files[0].data)
                  : undefined,
            isAudioMessage: files[0].audio,
            name: files[0].name,
            path: files[0].path,
            type: "attachment",
          },
          sendOpts
        );
      }
      const items = [];
      const groupItems = [];
      for (const file of files) {
        const data = await readBytes({
          data:
            file.data instanceof Uint8Array
              ? file.data
              : file.data
                ? new Uint8Array(file.data)
                : undefined,
          path: file.path,
        });
        const album = albumItem({
          data,
          mimeType: undefined,
          name: file.name,
        });
        if (!album) {
          host.unsupported("whatsapp", "sendFiles with non-album items");
        }
        items.push(album);
        groupItems.push({
          type: "attachment" as const,
          data,
          name: file.name,
          path: file.path,
          isAudioMessage: file.audio,
        });
      }
      const res = await waFor(to).sendAlbum(to, items, host.newId());
      void sendOpts;
      return bindOutboundMessage(channel, {
        content: {
          type: "group",
          items: groupItems,
        },
        guid: res.messageIds[0],
        senderId: to,
      });
    },
    shareContactCard: async () => host.unsupported("whatsapp", "shareContactCard"),
    pin: async () => host.unsupported("whatsapp", "pin"),
    shareLocation: async () => host.unsupported("whatsapp", "shareLocation"),
    stopLocation: async () => host.unsupported("whatsapp", "stopLocation"),
    updateLocation: async () => host.unsupported("whatsapp", "updateLocation"),
    unpin: async () => host.unsupported("whatsapp", "unpin"),
    to,
    typing: async () => host.unsupported("whatsapp", "typing"),
    unsend: () => host.unsupported("whatsapp", "unsend"),
    };
    return channel;
  };

  const connectLine = async (line: ResolvedLine): Promise<void> => {
    if (!line.phone) {
      return;
    }
    const wa = new WhatsappGrpcClient(
      grpcTarget(line.address),
      line.token || "",
      projectId
    );
    try {
      await wa.waitForReady();
    } catch {
      wa.close();
      return;
    }
    const to = line.phone;
    const channel = makeChannel(to);
    const stream = wa.subscribeEvents({
      onAttachment(msg, date) {
        host.queue.push([
          channel,
          bindMessage(channel, {
            attachments: [
              stubAttachmentDownload({
                guid: msg.messageId,
                mimeType: msg.kind,
                name: msg.name ?? msg.caption,
                size: msg.fileSize,
              }),
            ],
            content: {
              text: msg.caption ?? `[${msg.kind}]`,
              type: "text",
            },
            guid: msg.messageId,
            isFromMe: false,
            platform: "whatsapp",
            ...(msg.replyToMessageId
              ? { replyTo: { messageGuid: msg.replyToMessageId } }
              : {}),
            sender: { id: msg.senderId },
            timestamp: date,
          }),
        ]);
      },
      onReaction(msg, date) {
        host.emit(
          "reaction",
          {
            messageGuid: msg.messageId,
            platform: "whatsapp",
            reaction: msg.emoji,
            removed: msg.removed,
            sender: { id: msg.senderId },
            timestamp: date,
          },
          channel
        );
      },
      onText(msg, date) {
        host.queue.push([
          channel,
          bindMessage(channel, {
            content: { text: msg.text, type: "text" },
            guid: msg.messageId,
            isFromMe: false,
            platform: "whatsapp",
            ...(msg.replyToMessageId
              ? { replyTo: { messageGuid: msg.replyToMessageId } }
              : {}),
            sender: { id: msg.senderId },
            timestamp: date,
          }),
        ]);
      },
    });
    host.live.set(to, { platform: "whatsapp", streams: [stream], wa });
    host.ready.add(to);
  };

  return {
    platform: "whatsapp" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      whatsappDedicatedLines(config as WhatsappDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: WhatsappConfig): void {
  host.register(createBinder(host, host.projectId ?? "local"));
}
