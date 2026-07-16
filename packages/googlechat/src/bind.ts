import type {
  Content,
  ContentInput,
  SendOptions,
} from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  bindMessage,
  contentSugar,
  messageFromSend,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { GoogleChatClient } from "./rest.js";
import {
  type GoogleChatConfig,
  type GoogleChatDedicatedConfig,
  googleChatDedicatedLines,
} from "./config.js";
import {
  type GoogleChatWebhookEvent,
  createGoogleChatWebhookHandler,
} from "./webhook.js";

const webhookHandlers = new Map<
  string,
  (request: Request) => Promise<Response>
>();

/** Fetch handler for Google Chat webhooks; mount on your HTTP server. */
export function googlechatWebhookFetch(
  request: Request,
  scopeId?: string
): Promise<Response> {
  const handler = scopeId
    ? webhookHandlers.get(scopeId)
    : webhookHandlers.values().next().value;
  if (!handler) {
    return Promise.resolve(
      new Response("googlechat webhook not configured", { status: 503 })
    );
  }
  return handler(request);
}

function textOf(content: Content): string {
  switch (content.type) {
    case "text":
      return content.text;
    case "markdown":
      return content.body;
    case "rich_message":
      return content.markdown ?? content.text ?? "";
    case "app":
      return [content.caption, content.url].filter(Boolean).join("\n") || content.url;
    case "flow":
      return content.caption ?? content.summary ?? content.appId ?? "[Flow]";
    default:
      return "";
  }
}

function createBinder(host: SkylineHost) {
  const clientFor = (): GoogleChatClient => {
    const line = host.lineForPlatform("googlechat");
    const client = line.googlechat as GoogleChatClient | undefined;
    if (!client) {
      throw new Error("googlechat client not ready");
    }
    return client;
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const client = clientFor();
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown":
      case "rich_message":
      case "app":
      case "flow": {
        const res = await client.createMessage(to, {
          text: textOf(content),
          threadName: sendOpts?.replyTo,
        });
        guid = res.name;
        break;
      }
      case "reply": {
        const inner = content.content;
        const res = await client.createMessage(to, {
          text: textOf(inner),
          threadName: content.target.guid,
        });
        guid = res.name;
        break;
      }
      case "edit": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("edit: target message has no guid");
        }
        const res = await client.updateMessage(targetGuid, textOf(content.content));
        guid = res.name;
        break;
      }
      case "unsend": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("unsend: target message has no guid");
        }
        await client.deleteMessage(targetGuid);
        break;
      }
      case "read":
      case "typing":
        break;
      case "reaction":
      case "attachment":
      case "voice":
      case "group":
      case "media_album":
      case "location":
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
        host.unsupported("googlechat", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, { senderId: to });
  };

  const inboundMessage = (
    channel: Channel,
    event: GoogleChatWebhookEvent
  ): Message => {
    const msg = event.message;
    const space = msg?.space ?? event.space;
    return bindMessage(channel, {
      content: { text: msg?.text ?? msg?.argumentText ?? "", type: "text" },
      googlechat: {
        spaceName: space?.name,
        spaceType: space?.spaceType ?? space?.type,
        threadName: msg?.thread?.name,
      },
      guid: msg?.name ?? `${space?.name ?? "space"}-${Date.now()}`,
      isFromMe: false,
      platform: "googlechat",
      sender: {
        displayName: msg?.sender?.displayName ?? event.user?.displayName,
        id: msg?.sender?.name ?? event.user?.name ?? "unknown",
      },
      timestamp: new Date(),
    });
  };

  const makeChannel = (to: string, _scopeId?: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, resolved, sendOpts),
        content,
        "googlechat"
      );
    const sugar = contentSugar(send);
    channel = {
      ...sugar,
      ...unsupportedChatExtras((verb) => host.unsupported("googlechat", verb)),
      background: async () => host.unsupported("googlechat", "background"),
      contact: async () => null,
      edit: async (messageGuid, update) => {
        const text = typeof update === "string" ? update : update.text;
        if (text == null) {
          host.unsupported("googlechat", "edit without text");
        }
        await clientFor().updateMessage(messageGuid, text);
      },
      focusStatus: async () => null,
      getAttachment: async () => null,
      getDisplayName: async () => null,
      getMessage: async (guid) => {
        const message = await clientFor().getMessage(guid);
        return inboundMessage(channel, { message, type: "MESSAGE" });
      },
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("googlechat", verb)),
        add: () => host.unsupported("googlechat", "group.add"),
        getIcon: async () => null,
        getName: async () => null,
        leave: () => host.unsupported("googlechat", "group.leave"),
        participants: async () => host.unsupported("googlechat", "group.participants"),
        remove: () => host.unsupported("googlechat", "group.remove"),
        setBackground: async () => host.unsupported("googlechat", "group.setBackground"),
        setIcon: async () => host.unsupported("googlechat", "group.setIcon"),
        setName: () => host.unsupported("googlechat", "group.setName"),
      },
      listMessages: async () => [],
      platform: "googlechat",
      poll: unsupportedPollOps((verb) => host.unsupported("googlechat", verb)),
      reachable: async () => true,
      react: async () => host.unsupported("googlechat", "react"),
      read: async () => {},
      readReceipt: async () => {},
      responding: (fn) => withResponding(channel, fn),
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async () => host.unsupported("googlechat", "sendFile"),
      sendFiles: async () => host.unsupported("googlechat", "sendFiles"),
      shareContactCard: async () => host.unsupported("googlechat", "shareContactCard"),
      shareLocation: async () => host.unsupported("googlechat", "shareLocation"),
      stopLocation: async () => host.unsupported("googlechat", "stopLocation"),
      updateLocation: async () => host.unsupported("googlechat", "updateLocation"),
      pin: async () => host.unsupported("googlechat", "pin"),
      unpin: async () => host.unsupported("googlechat", "unpin"),
      to,
      typing: async () => {},
      unsend: async (messageGuid) => {
        await clientFor().deleteMessage(messageGuid);
      },
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.googlechat) {
      return;
    }
    const scopeId = "googlechat";
    const client = new GoogleChatClient({
      baseUrl: line.googlechat.baseUrl,
      serviceAccountJson: line.googlechat.serviceAccountJson,
    });

    const onEvent = (event: GoogleChatWebhookEvent) => {
      if (event.type !== "MESSAGE") {
        return;
      }
      const spaceName = event.message?.space?.name ?? event.space?.name;
      if (!spaceName) {
        return;
      }
      const channel = makeChannel(spaceName, scopeId);
      host.queue.push([channel, inboundMessage(channel, event)]);
    };

    webhookHandlers.set(
      scopeId,
      createGoogleChatWebhookHandler({
        audience: line.googlechat.audience,
        onEvent,
        verify: Boolean(line.googlechat.audience),
      })
    );

    host.live.set(scopeId, {
      googlechat: client,
      platform: "googlechat",
      streams: [],
    });
    host.ready.add(scopeId);
  };

  return {
    connectLine,
    dedicatedLines: (config: unknown) =>
      googleChatDedicatedLines(config as GoogleChatDedicatedConfig),
    makeChannel,
    platform: "googlechat" as Platform,
  };
}

export function bind(host: SkylineHost, _config: GoogleChatConfig): void {
  host.register(createBinder(host));
}
