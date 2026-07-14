import type {
  AttachmentSend,
  Content,
  GroupContent,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Platform, ResolvedLine, SendReceipt } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
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
  if (input.data) {
    return input.data instanceof Uint8Array
      ? input.data
      : new Uint8Array(input.data);
  }
  if (input.path) {
    const buf = await Bun.file(input.path).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (input.url) {
    const res = await fetch(input.url);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("attachment needs data, path, or url");
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
  ): Promise<SendReceipt> => {
    const grpc = waFor(to);
    const id = host.newId();
    const data = await readBytes(content);
    if (content.isAudioMessage || isAudioMime(content.mimeType)) {
      const res = await grpc.sendAudio(to, data, content.mimeType, id);
      void sendOpts;
      return { guid: res.messageId, sentAt: new Date() };
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
      return { guid: res.messageId, sentAt: new Date() };
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
    return { guid: res.messageId, sentAt: new Date() };
  };

  const sendGroupAlbum = async (
    to: string,
    content: GroupContent,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const items = [];
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
    }
    if (items.length < 2) {
      host.unsupported("whatsapp", "sending group content");
    }
    const res = await waFor(to).sendAlbum(to, items, host.newId());
    void sendOpts;
    return { guid: res.messageIds[0], sentAt: new Date() };
  };

  const sendContent = async (
    to: string,
    input: string | Content,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const content = toContent(input);
    const grpc = waFor(to);
    const id = host.newId();
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const res = await grpc.sendText(to, body, id, sendOpts?.replyTo);
        return { guid: res.messageId, sentAt: new Date() };
      }
      case "attachment":
        return sendAttachment(to, content, sendOpts);
      case "voice": {
        const data = await readBytes(content);
        const res = await grpc.sendAudio(to, data, content.mimeType, id);
        void sendOpts;
        return { guid: res.messageId, sentAt: new Date() };
      }
      case "group":
        return sendGroupAlbum(to, content, sendOpts);
      case "app":
      case "flow":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "wa_contacts":
        host.unsupported("whatsapp", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    throw new Error("unreachable");
  };

  const makeChannel = (to: string): Channel => ({
    background: async () => host.unsupported("whatsapp", "background"),
    contact: async () => null,
    edit: () => host.unsupported("whatsapp", "edit"),
    focusStatus: async () => null,
    getMessage: async () => null,
    group: {
      add: () => host.unsupported("whatsapp", "group.add"),
      getIcon: async () => null,
      leave: async () => host.unsupported("whatsapp", "group.leave"),
      participants: async () => host.unsupported("whatsapp", "group.participants"),
      remove: () => host.unsupported("whatsapp", "group.remove"),
      setBackground: async () => host.unsupported("whatsapp", "group.setBackground"),
      setIcon: async () => host.unsupported("whatsapp", "group.setIcon"),
      setName: () => host.unsupported("whatsapp", "group.setName"),
    },
    listMessages: async () => [],
    get phone() {
      return to;
    },
    platform: "whatsapp",
    reachable: async () => true,
    react: (messageGuid, reaction: Reaction, reactOpts) =>
      waFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      ),
    read: async () => host.unsupported("whatsapp", "read"),
    readReceipt: async () => host.unsupported("whatsapp", "readReceipt"),
    reply: (messageGuid, content, sendOpts) =>
      sendContent(to, content, { ...sendOpts, replyTo: messageGuid }),
    send: (content, sendOpts) => sendContent(to, content, sendOpts),
    sendFile: async (file: AttachmentSend, sendOpts) =>
      sendAttachment(
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
      }
      const res = await waFor(to).sendAlbum(to, items, host.newId());
      void sendOpts;
      return { guid: res.messageIds[0], sentAt: new Date() };
    },
    shareContactCard: async () => host.unsupported("whatsapp", "shareContactCard"),
    shareLocation: async () => host.unsupported("whatsapp", "shareLocation"),
    stopLocation: async () => host.unsupported("whatsapp", "stopLocation"),
    to,
    typing: async () => host.unsupported("whatsapp", "typing"),
    unsend: () => host.unsupported("whatsapp", "unsend"),
  });

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
          {
            attachments: [
              {
                guid: msg.messageId,
                mimeType: msg.kind,
                name: msg.name ?? msg.caption,
                size: msg.fileSize,
              },
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
          },
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
          {
            content: { text: msg.text, type: "text" },
            guid: msg.messageId,
            isFromMe: false,
            platform: "whatsapp",
            ...(msg.replyToMessageId
              ? { replyTo: { messageGuid: msg.replyToMessageId } }
              : {}),
            sender: { id: msg.senderId },
            timestamp: date,
          },
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
