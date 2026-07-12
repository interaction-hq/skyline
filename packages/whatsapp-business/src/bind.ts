import type {
  AttachmentSend,
  Content,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Platform, ResolvedLine, SendReceipt } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import {
  WhatsappBusinessClient,
  type WaSendResult,
} from "./rest/client.js";
import {
  whatsappBusinessDedicatedLines,
  type WhatsappBusinessConfig,
  type WhatsappBusinessDedicatedConfig,
} from "./config.js";

function createBinder(host: SkylineHost) {
  const wbFor = (_to: string): WhatsappBusinessClient => {
    const line = host.lineForPlatform("whatsapp_business");
    if (!line.wb) {
      throw new Error("whatsapp_business client not ready");
    }
    return line.wb as WhatsappBusinessClient;
  };

  const sendWaBusiness = async (
    to: string,
    input: string | Content,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const wb = wbFor(to);
    const content = toContent(input);
    const replyTo = sendOpts?.replyTo;
    let res: WaSendResult;
    switch (content.type) {
      case "text":
        res = await wb.sendText(to, content.text, {
          previewUrl: sendOpts?.richLink,
          replyTo,
        });
        break;
      case "wa_media":
        res = await wb.sendMedia(
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
        break;
      case "wa_template":
        res = await wb.sendTemplate(
          to,
          {
            components: content.components,
            language: { code: content.language },
            name: content.name,
          },
          { replyTo }
        );
        break;
      case "wa_interactive":
        res = await wb.sendInteractive(to, content.interactive, { replyTo });
        break;
      case "wa_location":
        res = await wb.sendLocation(
          to,
          {
            address: content.address,
            latitude: content.latitude,
            longitude: content.longitude,
            name: content.name,
          },
          { replyTo }
        );
        break;
      case "wa_contacts":
        res = await wb.sendContacts(to, content.contacts, { replyTo });
        break;
      case "app":
      case "flow":
        host.unsupported("whatsapp_business", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return { guid: res.messageId, sentAt: new Date() };
  };

  const makeChannel = (to: string): Channel => ({
    contact: async () => null,
    edit: () => host.unsupported("whatsapp_business", "edit"),
    group: {
      add: () => host.unsupported("whatsapp_business", "group.add"),
      participants: async () =>
        host.unsupported("whatsapp_business", "group.participants"),
      remove: () => host.unsupported("whatsapp_business", "group.remove"),
      setName: () => host.unsupported("whatsapp_business", "group.setName"),
    },
    get phone() {
      return to;
    },
    platform: "whatsapp_business",
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      await wbFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      );
    },
    read: async () => host.unsupported("whatsapp_business", "read"),
    readReceipt: async () => host.unsupported("whatsapp_business", "readReceipt"),
    reply: (messageGuid, content, sendOpts) =>
      sendWaBusiness(to, content, { ...sendOpts, replyTo: messageGuid }),
    send: (content, sendOpts) => sendWaBusiness(to, content, sendOpts),
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
    to,
    typing: async () => host.unsupported("whatsapp_business", "typing"),
    unsend: () => host.unsupported("whatsapp_business", "unsend"),
  });

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
