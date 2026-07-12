import type { AttachmentSend, Content, Reaction, SendOptions } from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Platform, ResolvedLine } from "@skyline-ts/core";
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

function createBinder(host: SkylineHost) {
  const slackFor = (teamId?: string): SlackClient | SlackGrpcClient => {
    const line = host.lineForPlatform("slack", teamId);
    if (!line.slack) {
      throw new Error("slack client not ready");
    }
    return line.slack as SlackClient | SlackGrpcClient;
  };

  const makeChannel = (to: string, teamId?: string): Channel => ({
    contact: async () => null,
    edit: async (messageGuid, newText) => {
      await slackFor(teamId).editText(to, messageGuid, newText);
    },
    group: {
      add: () => host.unsupported("slack", "group.add"),
      participants: async () => host.unsupported("slack", "group.participants"),
      remove: () => host.unsupported("slack", "group.remove"),
      setName: () => host.unsupported("slack", "group.setName"),
    },
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
      makeChannel(to, teamId).send(content, {
        ...sendOpts,
        replyTo: messageGuid,
      }),
    send: async (content, sendOpts) => {
      const parsed = toContent(content);
      if (parsed.type !== "text") {
        host.unsupported("slack", `sending ${parsed.type} content`);
      }
      const res = await slackFor(teamId).sendText(to, parsed.text, {
        replyTo: sendOpts?.replyTo,
      });
      return { guid: res.messageId, sentAt: new Date() };
    },
    sendFile: async (file, sendOpts) => {
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
    },
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
            {
              content: { text: event.text, type: "text" },
              guid: event.messageId,
              isFromMe: event.isFromMe,
              platform: "slack",
              sender: { id: event.userId },
              slack: {
                subtype: event.subtype,
                teamId,
                threadTs: event.threadTs,
                ts: event.messageId,
              },
              timestamp: new Date(),
            },
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
              {
                content: { text: event.text, type: "text" },
                guid: event.messageId,
                isFromMe,
                platform: "slack",
                sender: { id: event.userId },
                slack: {
                  subtype: event.subtype,
                  teamId,
                  threadTs: event.threadTs,
                  ts: event.messageId,
                },
                timestamp: new Date(),
              },
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
