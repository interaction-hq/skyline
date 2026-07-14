import type {
  AttachmentContent,
  AttachmentSend,
  Content,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Message, Platform, ResolvedLine, SendReceipt } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
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
  if (file.data) {
    return file.data instanceof Uint8Array
      ? file.data
      : new Uint8Array(file.data);
  }
  if (file.path) {
    const buf = await Bun.file(file.path).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error("sendFile requires file.data or file.path");
}

async function readAttachmentContent(
  content: AttachmentContent
): Promise<Uint8Array> {
  if (content.data) {
    return content.data;
  }
  if (content.path) {
    const buf = await Bun.file(content.path).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (content.url) {
    const res = await fetch(content.url);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("attachment needs data, path, or url");
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
    to: string,
    teamId: string | undefined,
    file: AttachmentSend,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const bytes = await readAttachmentBytes(file);
    const res = await slackFor(teamId).uploadFile(
      to,
      {
        data: bytes,
        name: file.name ?? "attachment",
      },
      { replyTo: sendOpts?.replyTo }
    );
    return { guid: res.messageId, sentAt: new Date() };
  };

  const sendContent = async (
    to: string,
    teamId: string | undefined,
    input: string | Content,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const content = toContent(input);
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const res = await slackFor(teamId).sendText(to, body, {
          replyTo: sendOpts?.replyTo,
        });
        return { guid: res.messageId, sentAt: new Date() };
      }
      case "attachment": {
        const bytes = await readAttachmentContent(content);
        const res = await slackFor(teamId).uploadFile(
          to,
          {
            data: bytes,
            name: content.name ?? "attachment",
          },
          { replyTo: sendOpts?.replyTo }
        );
        return { guid: res.messageId, sentAt: new Date() };
      }
      case "group": {
        const first = content.items[0];
        if (first?.type === "attachment") {
          let last: SendReceipt | undefined;
          for (const item of content.items) {
            if (item.type !== "attachment") {
              host.unsupported("slack", "sending group content with mixed types");
            }
            last = await sendContent(to, teamId, item, sendOpts);
          }
          return last as SendReceipt;
        }
        host.unsupported("slack", "sending group content");
        break;
      }
      case "app":
      case "flow":
      case "voice":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "wa_contacts":
        host.unsupported("slack", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    throw new Error("unreachable");
  };

  const inboundSlackMessage = (
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
  ): Message => ({
    content: { text: event.text, type: "text" },
    ...(event.files?.length
      ? {
          attachments: event.files.map((f) => ({
            guid: f.id,
            mimeType: f.mimetype,
            name: f.name,
            size: f.size,
          })),
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

  const makeChannel = (to: string, teamId?: string): Channel => ({
    background: async () => host.unsupported("slack", "background"),
    contact: async () => null,
    edit: async (messageGuid, newText) => {
      await slackFor(teamId).editText(to, messageGuid, newText);
    },
    focusStatus: async () => null,
    getMessage: async () => null,
    group: {
      add: () => host.unsupported("slack", "group.add"),
      getIcon: async () => null,
      leave: async () => host.unsupported("slack", "group.leave"),
      participants: async () => host.unsupported("slack", "group.participants"),
      remove: () => host.unsupported("slack", "group.remove"),
      setBackground: async () => host.unsupported("slack", "group.setBackground"),
      setIcon: async () => host.unsupported("slack", "group.setIcon"),
      setName: () => host.unsupported("slack", "group.setName"),
    },
    listMessages: async () => [],
    get phone() {
      return to;
    },
    platform: "slack",
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
    reply: (messageGuid, content, sendOpts) =>
      sendContent(to, teamId, content, { ...sendOpts, replyTo: messageGuid }),
    send: (content, sendOpts) => sendContent(to, teamId, content, sendOpts),
    sendFile: (file, sendOpts) => uploadFile(to, teamId, file, sendOpts),
    sendFiles: async (files, sendOpts) => {
      if (files.length === 0) {
        throw new Error("sendFiles: needs at least one file");
      }
      let last: SendReceipt | undefined;
      for (const file of files) {
        last = await uploadFile(to, teamId, file, sendOpts);
      }
      return last as SendReceipt;
    },
    shareContactCard: async () => host.unsupported("slack", "shareContactCard"),
    shareLocation: async () => host.unsupported("slack", "shareLocation"),
    stopLocation: async () => host.unsupported("slack", "stopLocation"),
    to,
    typing: async () => {},
    unsend: async (messageGuid) => {
      await slackFor(teamId).deleteMessage(to, messageGuid);
    },
  });

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

    if (useGrpc && accessToken) {
      const client = new SlackGrpcClient(
        slackGrpcTarget(line.slack.endpoint || line.address),
        teamId,
        accessToken
      );
      const sub = client.subscribe({
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
          const channel = makeChannel(event.channelId, teamId);
          host.queue.push([
            channel,
            inboundSlackMessage(
              {
                files: event.files,
                isFromMe: event.isFromMe,
                messageId: event.messageId,
                subtype: event.subtype,
                text: event.text,
                threadTs: event.threadTs,
                userId: event.userId,
              },
              teamId
            ),
          ]);
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
            const channel = makeChannel(event.channelId, teamId);
            host.queue.push([
              channel,
              inboundSlackMessage(
                {
                  files: event.files,
                  isFromMe,
                  messageId: event.messageId,
                  subtype: event.subtype,
                  text: event.text,
                  threadTs: event.threadTs,
                  userId: event.userId,
                },
                teamId
              ),
            ]);
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
