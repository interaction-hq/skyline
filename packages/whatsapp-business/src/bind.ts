import type {
  AttachmentSend,
  ContentInput,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { resolveContent } from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  contentSugar,
  messageFromSend,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import {
  WhatsappBusinessClient,
} from "./rest/client.js";
import {
  whatsappBusinessDedicatedLines,
  type WhatsappBusinessConfig,
  type WhatsappBusinessDedicatedConfig,
} from "./config.js";

function isImageMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

function isAudioMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("audio/"));
}

function mediaKindFromMime(
  mimeType?: string
): "image" | "audio" | "document" {
  if (isAudioMime(mimeType)) {
    return "audio";
  }
  if (isImageMime(mimeType)) {
    return "image";
  }
  return "document";
}

function createBinder(host: SkylineHost) {
  const wbFor = (_to: string): WhatsappBusinessClient => {
    const line = host.lineForPlatform("whatsapp_business");
    if (!line.wb) {
      throw new Error("whatsapp_business client not ready");
    }
    return line.wb as WhatsappBusinessClient;
  };

  const sendWaBusiness = async (
    channel: Channel,
    to: string,
    input: ContentInput,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const wb = wbFor(to);
    const content = await resolveContent(input);
    const replyTo = sendOpts?.replyTo;
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const res = await wb.sendText(to, body, {
          previewUrl: sendOpts?.richLink,
          replyTo,
        });
        guid = res.messageId;
        break;
      }
      case "attachment": {
        if (!content.url) {
          host.unsupported(
            "whatsapp_business",
            "attachment without a public https link (use wa.image/wa.document with link or media id)"
          );
        }
        const kind = mediaKindFromMime(content.mimeType);
        const res = await wb.sendMedia(
          to,
          kind,
          {
            caption: content.name,
            filename: content.name,
            link: content.url,
          },
          { replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "voice": {
        if (!content.url) {
          host.unsupported(
            "whatsapp_business",
            "voice without a public https link (use wa.audio with link or media id)"
          );
        }
        const res = await wb.sendMedia(
          to,
          "audio",
          { link: content.url },
          { replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "wa_media": {
        const res = await wb.sendMedia(
          to,
          content.kind,
          {
            caption: content.caption,
            filename: content.filename,
            id: content.id,
            link: content.link,
          },
          { replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "wa_template": {
        const res = await wb.sendTemplate(
          to,
          {
            components: content.components,
            language: { code: content.language },
            name: content.name,
          },
          { replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "wa_interactive": {
        const res = await wb.sendInteractive(to, content.interactive, { replyTo });
        guid = res.messageId;
        break;
      }
      case "wa_location": {
        const res = await wb.sendLocation(
          to,
          {
            address: content.address,
            latitude: content.latitude,
            longitude: content.longitude,
            name: content.name,
          },
          { replyTo }
        );
        guid = res.messageId;
        break;
      }
      case "wa_contacts": {
        const res = await wb.sendContacts(to, content.contacts, { replyTo });
        guid = res.messageId;
        break;
      }
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendWaBusiness(channel, to, content.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "reaction": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reaction: target message has no guid");
        }
        const res = await wb.sendReaction(to, targetGuid, content.emoji);
        guid = res.messageId;
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
      case "group":
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
        host.unsupported("whatsapp_business", `sending ${content.type} content`);
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
        (resolved) => sendWaBusiness(channel, to, resolved, sendOpts),
        content,
        "whatsapp_business"
      );
    const sugar = contentSugar(send);
    channel = {
    ...sugar,
    ...unsupportedChatExtras((verb) =>
      host.unsupported("whatsapp_business", verb)
    ),
    background: async () => host.unsupported("whatsapp_business", "background"),
    contact: async () => null,
    edit: () => host.unsupported("whatsapp_business", "edit"),
    focusStatus: async () => null,
    getAttachment: async () => null,
    getDisplayName: async () => null,
    getMessage: async () => null,
    group: {
      ...unsupportedGroupExtras((verb) => host.unsupported("whatsapp_business", verb)),
      add: (handle) => sugar.add(handle),
      getIcon: async () => null,
      getName: async () => null,
      leave: () => sugar.leave(),
      participants: async () =>
        host.unsupported("whatsapp_business", "group.participants"),
      remove: (handle) => sugar.remove(handle),
      setBackground: async () =>
        host.unsupported("whatsapp_business", "group.setBackground"),
      setIcon: async () => host.unsupported("whatsapp_business", "group.setIcon"),
      setName: (name) => sugar.rename(name),
    },
    listMessages: async () => [],
    platform: "whatsapp_business",
    poll: unsupportedPollOps((verb) =>
      host.unsupported("whatsapp_business", verb)
    ),
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      await wbFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      );
    },
    read: async () => {},
    readReceipt: async () => host.unsupported("whatsapp_business", "readReceipt"),
    responding: (fn) => withResponding(channel, fn),
    reply: (messageGuid, content, sendOpts) =>
      send(content, { ...sendOpts, replyTo: messageGuid }),
    send,
    sendFile: async (file: AttachmentSend, sendOpts) => {
      if (!(file.path || file.data)) {
        throw new Error(
          "whatsapp_business sendFile needs a hosted link via wa.document/image"
        );
      }
      host.unsupported(
        "whatsapp_business",
        "sendFile with raw bytes (use wa.image/wa.document with a hosted link or media id)"
      );
      void sendOpts;
    },
    sendFiles: async () => host.unsupported("whatsapp_business", "sendFiles"),
    pin: async () => host.unsupported("whatsapp_business", "pin"),
    shareContactCard: async () =>
      host.unsupported("whatsapp_business", "shareContactCard"),
    shareLocation: async () =>
      host.unsupported("whatsapp_business", "shareLocation"),
    stopLocation: async () =>
      host.unsupported("whatsapp_business", "stopLocation"),
    updateLocation: async () =>
      host.unsupported("whatsapp_business", "updateLocation"),
    to,
    typing: async () => {},
    unpin: async () => host.unsupported("whatsapp_business", "unpin"),
    unsend: () => host.unsupported("whatsapp_business", "unsend"),
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!(line.phone && line.business)) {
      return;
    }
    const wb = new WhatsappBusinessClient({
      accessToken: line.business.accessToken,
      apiVersion: line.business.apiVersion,
      phoneNumberId: line.business.phoneNumberId,
    });
    host.live.set(line.phone, { platform: "whatsapp_business", streams: [], wb });
    host.ready.add(line.phone);
  };

  return {
    platform: "whatsapp_business" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      whatsappBusinessDedicatedLines(config as WhatsappBusinessDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: WhatsappBusinessConfig): void {
  host.register(createBinder(host));
}
