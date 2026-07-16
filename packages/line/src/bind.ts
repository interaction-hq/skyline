import type {
  Content,
  ContentInput,
  SendOptions,
} from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  bindMessage,
  contentSugar,
  messageFromSend,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { type LineMessage, LineClient } from "./rest.js";
import {
  type LineConfig,
  type LineDedicatedConfig,
  lineDedicatedLines,
} from "./config.js";
import {
  type LineEvent,
  createLineWebhookHandler,
  lineSourceId,
} from "./webhook.js";

const REPLY_TOKEN_TTL_MS = 25_000;

const webhookHandlers = new Map<
  string,
  (request: Request) => Promise<Response>
>();

/** Fetch handler for LINE webhooks; mount on your HTTP server. */
export function lineWebhookFetch(
  request: Request,
  scopeId?: string
): Promise<Response> {
  const handler = scopeId
    ? webhookHandlers.get(scopeId)
    : webhookHandlers.values().next().value;
  if (!handler) {
    return Promise.resolve(
      new Response("line webhook not configured", { status: 503 })
    );
  }
  return handler(request);
}

function textMessage(text: string): LineMessage {
  return { text, type: "text" };
}

function createBinder(host: SkylineHost) {
  const replyTokens = new Map<string, { token: string; ts: number }>();

  const clientFor = (): LineClient => {
    const line = host.lineForPlatform("line");
    const client = line.line as LineClient | undefined;
    if (!client) {
      throw new Error("line client not ready");
    }
    return client;
  };

  const takeReplyToken = (sourceId: string): string | undefined => {
    const entry = replyTokens.get(sourceId);
    if (!entry) {
      return undefined;
    }
    replyTokens.delete(sourceId);
    if (Date.now() - entry.ts > REPLY_TOKEN_TTL_MS) {
      return undefined;
    }
    return entry.token;
  };

  const attachmentMessage = (
    content: {
      duration?: number;
      mimeType?: string;
      type: string;
      url?: string;
    }
  ): LineMessage => {
    const url = content.url;
    if (!url) {
      host.unsupported(
        "line",
        `sending ${content.type} without a hosted https url (LINE has no binary upload)`
      );
    }
    const mime = content.mimeType ?? "";
    if (content.type === "voice" || mime.startsWith("audio/")) {
      return {
        duration: (content.duration ?? 60) * 1000,
        originalContentUrl: url,
        type: "audio",
      };
    }
    if (mime.startsWith("video/")) {
      return { originalContentUrl: url, previewImageUrl: url, type: "video" };
    }
    if (mime.startsWith("image/")) {
      return { originalContentUrl: url, previewImageUrl: url, type: "image" };
    }
    host.unsupported(
      "line",
      "sending non-image/video/audio attachments (LINE supports media urls only)"
    );
  };

  const toMessages = (content: Content): LineMessage[] => {
    switch (content.type) {
      case "text":
        return [textMessage(content.text)];
      case "markdown":
        return [textMessage(content.body)];
      case "rich_message":
        return [textMessage(content.markdown ?? content.text ?? "")];
      case "app":
        return [
          textMessage(
            [content.caption, content.url].filter(Boolean).join("\n") ||
              content.url
          ),
        ];
      case "flow":
        return [
          textMessage(
            content.caption ?? content.summary ?? content.appId ?? "[Flow]"
          ),
        ];
      case "location":
        return [
          {
            address: content.address ?? "",
            latitude: content.latitude,
            longitude: content.longitude,
            title: content.title ?? "Location",
            type: "location",
          },
        ];
      case "attachment":
        return [attachmentMessage(content)];
      case "voice":
        return [attachmentMessage(content)];
      case "group":
        return content.items.flatMap((item) => {
          if (item.type !== "attachment") {
            host.unsupported("line", "sending non-attachment group items");
          }
          return attachmentMessage(item);
        });
      case "media_album":
        return content.items.map((item) => attachmentMessage({ ...item, type: "attachment" }));
      case "reply":
        return toMessages(content.content);
      case "edit":
      case "unsend":
      case "reaction":
      case "rename":
      case "avatar":
      case "addMember":
      case "removeMember":
      case "leaveChannel":
      case "read":
      case "typing":
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
        host.unsupported("line", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return [];
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    if (content.type === "read" || content.type === "typing") {
      return;
    }
    const messages = toMessages(content);
    if (messages.length === 0) {
      return;
    }
    const client = clientFor();
    const token = takeReplyToken(to);
    if (token) {
      await client.reply(token, messages);
    } else {
      await client.push(to, messages);
    }
    return messageFromSend(channel, content, undefined, { senderId: to });
  };

  const inboundMessage = (
    channel: Channel,
    event: LineEvent,
    scopeId: string
  ): Message => {
    const msg = event.message;
    const sourceId = lineSourceId(event.source);
    const isMedia =
      msg?.type === "image" ||
      msg?.type === "video" ||
      msg?.type === "audio" ||
      msg?.type === "file";
    return bindMessage(channel, {
      content: { text: msg?.text ?? "", type: "text" },
      ...(isMedia && msg
        ? {
            attachments: [
              attachmentWithDownload(
                { guid: msg.id, name: msg.fileName, size: msg.fileSize },
                {
                  read: () => clientFor().getContent(msg.id),
                  stream: async () => {
                    const bytes = await clientFor().getContent(msg.id);
                    return new ReadableStream({
                      start(controller) {
                        controller.enqueue(bytes);
                        controller.close();
                      },
                    });
                  },
                }
              ),
            ],
          }
        : {}),
      guid: msg?.id ?? `${scopeId}-${event.timestamp ?? Date.now()}`,
      isFromMe: false,
      line: {
        replyToken: event.replyToken,
        sourceType: event.source?.type,
      },
      platform: "line",
      sender: { id: event.source?.userId ?? sourceId },
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    });
  };

  const makeChannel = (to: string, _scopeId?: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, resolved, sendOpts),
        content,
        "line"
      );
    const sugar = contentSugar(send);
    channel = {
      ...sugar,
      ...unsupportedChatExtras((verb) => host.unsupported("line", verb)),
      background: async () => host.unsupported("line", "background"),
      contact: async () => null,
      edit: async () => host.unsupported("line", "edit (LINE bots cannot edit sent messages)"),
      focusStatus: async () => null,
      getAttachment: async () => null,
      getDisplayName: async () => {
        const profile = await clientFor().getProfile(to);
        return profile.displayName ?? null;
      },
      getMessage: async () => null,
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("line", verb)),
        add: () => host.unsupported("line", "group.add"),
        getIcon: async () => null,
        getName: async () => null,
        leave: async () => {
          const client = clientFor();
          if (to.startsWith("C")) {
            await client.leaveGroup(to);
          } else if (to.startsWith("R")) {
            await client.leaveRoom(to);
          } else {
            host.unsupported("line", "group.leave for a non-group target");
          }
        },
        participants: async () => host.unsupported("line", "group.participants"),
        remove: () => host.unsupported("line", "group.remove"),
        setBackground: async () => host.unsupported("line", "group.setBackground"),
        setIcon: async () => host.unsupported("line", "group.setIcon"),
        setName: () => host.unsupported("line", "group.setName"),
      },
      listMessages: async () => [],
      platform: "line",
      poll: unsupportedPollOps((verb) => host.unsupported("line", verb)),
      reachable: async () => true,
      react: async () => host.unsupported("line", "react (LINE bots cannot react)"),
      read: async () => {},
      readReceipt: async () => {},
      responding: (fn) => withResponding(channel, fn),
      reply: (_messageGuid, content, sendOpts) => send(content, sendOpts),
      send,
      sendFile: async (file, sendOpts) => {
        if (!file.url) {
          host.unsupported("line", "sendFile without a hosted https url");
        }
        return send(
          { mimeType: file.mimeType, name: file.name, type: "attachment", url: file.url },
          sendOpts
        );
      },
      sendFiles: async (files, sendOpts) => {
        let last: Message | undefined;
        for (const file of files) {
          if (!file.url) {
            host.unsupported("line", "sendFiles without hosted https urls");
          }
          last = await send(
            { mimeType: file.mimeType, name: file.name, type: "attachment", url: file.url },
            sendOpts
          );
        }
        return last;
      },
      shareContactCard: async () => host.unsupported("line", "shareContactCard"),
      shareLocation: async () => host.unsupported("line", "shareLocation"),
      stopLocation: async () => host.unsupported("line", "stopLocation"),
      updateLocation: async () => host.unsupported("line", "updateLocation"),
      pin: async () => host.unsupported("line", "pin"),
      unpin: async () => host.unsupported("line", "unpin"),
      to,
      typing: async () => {},
      unsend: async () => host.unsupported("line", "unsend (LINE bots cannot delete messages)"),
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.line) {
      return;
    }
    const scopeId = "line";
    const client = new LineClient({
      baseUrl: line.line.baseUrl,
      channelAccessToken: line.line.channelAccessToken,
      dataBaseUrl: line.line.dataBaseUrl,
    });

    const onEvent = (event: LineEvent) => {
      const sourceId = lineSourceId(event.source);
      if (!sourceId) {
        return;
      }
      if (event.replyToken) {
        replyTokens.set(sourceId, { token: event.replyToken, ts: Date.now() });
      }
      const channel = makeChannel(sourceId, scopeId);
      switch (event.type) {
        case "message":
          host.queue.push([channel, inboundMessage(channel, event, scopeId)]);
          break;
        case "unsend":
          host.emit(
            "unsent",
            {
              messageGuid: event.unsend?.messageId ?? "",
              platform: "line",
              sender: { id: event.source?.userId ?? sourceId },
              timestamp: new Date(),
            },
            channel
          );
          break;
        case "postback":
          host.emit(
            "callback",
            {
              data: event.postback?.data ?? "",
              platform: "line",
              queryId: "",
              sender: { id: event.source?.userId ?? sourceId },
              timestamp: new Date(),
            },
            channel
          );
          break;
        default:
          break;
      }
    };

    webhookHandlers.set(
      scopeId,
      createLineWebhookHandler({
        channelSecret: line.line.channelSecret,
        onEvent,
      })
    );

    host.live.set(scopeId, {
      line: client,
      platform: "line",
      streams: [],
    });
    host.ready.add(scopeId);
  };

  return {
    connectLine,
    dedicatedLines: (config: unknown) =>
      lineDedicatedLines(config as LineDedicatedConfig),
    makeChannel,
    platform: "line" as Platform,
  };
}

export function bind(host: SkylineHost, _config: LineConfig): void {
  host.register(createBinder(host));
}
