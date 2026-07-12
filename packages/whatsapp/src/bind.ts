import type { Content, Reaction, SendOptions } from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Platform, ResolvedLine } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import { grpcTarget, WhatsappGrpcClient } from "./grpc.js";
import {
  whatsappDedicatedLines,
  type WhatsappConfig,
  type WhatsappDedicatedConfig,
} from "./config.js";

function createBinder(host: SkylineHost, projectId: string) {
  const waFor = (to: string): WhatsappGrpcClient => {
    const line = host.lineFor(to);
    if (!line.wa) {
      throw new Error(`line ${to} is not a WhatsApp line`);
    }
    return line.wa as WhatsappGrpcClient;
  };

  const makeChannel = (to: string): Channel => ({
    contact: async () => null,
    edit: () => host.unsupported("whatsapp", "edit"),
    group: {
      add: () => host.unsupported("whatsapp", "group.add"),
      participants: async () => host.unsupported("whatsapp", "group.participants"),
      remove: () => host.unsupported("whatsapp", "group.remove"),
      setName: () => host.unsupported("whatsapp", "group.setName"),
    },
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
    reply: async (messageGuid, content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        host.unsupported("whatsapp", `replying with ${c.type} content`);
      }
      const res = await waFor(to).sendText(to, c.text, host.newId(), messageGuid);
      void sendOpts;
      return { guid: res.messageId, sentAt: new Date() };
    },
    send: async (content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        host.unsupported("whatsapp", `sending ${c.type} content`);
      }
      const res = await waFor(to).sendText(
        to,
        c.text,
        host.newId(),
        sendOpts?.replyTo
      );
      return { guid: res.messageId, sentAt: new Date() };
    },
    sendFile: async () => host.unsupported("whatsapp", "sendFile"),
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
      onText(msg, date) {
        host.queue.push([
          channel,
          {
            content: { text: msg.text, type: "text" },
            guid: msg.messageId,
            isFromMe: false,
            platform: "whatsapp",
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
