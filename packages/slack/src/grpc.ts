import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

type UnaryFn = (
  req: Record<string, unknown>,
  meta: grpc.Metadata,
  cb: (err: Error | null, res: unknown) => void
) => void;

type StreamFn = (
  req: Record<string, unknown>,
  meta: grpc.Metadata
) => {
  cancel: () => void;
  on: (event: string, cb: (frame: unknown) => void) => void;
};

interface MessageClient {
  close?: () => void;
  deleteMessage: UnaryFn;
  editMessage: UnaryFn;
  getChannel: () => { getTarget: () => string };
  sendMessage: UnaryFn;
  subscribeEvents: StreamFn;
}

interface FileClient {
  getContent: StreamFn;
  getUrl: UnaryFn;
  upload: UnaryFn;
}

function findProtoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "proto"),
    join(process.cwd(), "proto"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "interactions", "slack", "v1"))) {
      return c;
    }
  }
  throw new Error("slack proto root not found");
}

export function slackGrpcTarget(endpoint?: string): string {
  const raw =
    endpoint?.trim() ||
    process.env.SKYLINE_SLACK_ENDPOINT?.trim() ||
    "slack-grpc.skyline.interactions.co.in:50051";
  return raw.replace(/^https?:\/\//, "");
}

export interface SlackGrpcHandlers {
  onReaction?: (event: {
    channelId: string;
    emoji: string;
    messageId: string;
    removed: boolean;
    userId: string;
  }) => void;
  onText?: (event: {
    channelId: string;
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
  }) => void;
}

function channelCreds(target: string): grpc.ChannelCredentials {
  return target.includes("localhost") || target.startsWith("127.")
    ? grpc.credentials.createInsecure()
    : grpc.credentials.createSsl();
}

function loadMessageClient(target: string): MessageClient {
  const protoRoot = findProtoRoot();
  const def = protoLoader.loadSync(
    join(protoRoot, "interactions/slack/v1/message_service.proto"),
    {
      defaults: true,
      enums: String,
      includeDirs: [protoRoot],
      keepCase: false,
      longs: String,
      oneofs: true,
    }
  );
  const loaded = grpc.loadPackageDefinition(def) as unknown as {
    interactions: {
      slack: {
        v1: {
          MessageService: new (
            target: string,
            creds: grpc.ChannelCredentials
          ) => MessageClient;
        };
      };
    };
  };
  return new loaded.interactions.slack.v1.MessageService(
    target,
    channelCreds(target)
  );
}

function loadFileClient(target: string): FileClient {
  const protoRoot = findProtoRoot();
  const def = protoLoader.loadSync(
    join(protoRoot, "interactions/slack/v1/file_service.proto"),
    {
      defaults: true,
      enums: String,
      includeDirs: [protoRoot],
      keepCase: false,
      longs: String,
      oneofs: true,
    }
  );
  const loaded = grpc.loadPackageDefinition(def) as unknown as {
    interactions: {
      slack: {
        v1: {
          FileService: new (
            target: string,
            creds: grpc.ChannelCredentials
          ) => FileClient;
        };
      };
    };
  };
  return new loaded.interactions.slack.v1.FileService(
    target,
    channelCreds(target)
  );
}

export class SlackGrpcClient {
  private readonly client: MessageClient;
  private readonly files: FileClient;
  private readonly meta: grpc.Metadata;

  constructor(target: string, teamId: string, accessToken: string) {
    this.client = loadMessageClient(target);
    this.files = loadFileClient(target);
    this.meta = new grpc.Metadata();
    this.meta.set("access_token", accessToken);
    this.meta.set("team_id", teamId);
  }

  private call<T>(
    method: "sendMessage" | "editMessage" | "deleteMessage",
    req: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.client[method](req, this.meta, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res as T);
      });
    });
  }

  sendText(
    channelId: string,
    text: string,
    opts?: { replyTo?: string }
  ): Promise<{ channelId?: string; messageId?: string }> {
    return this.call<{ channel?: string; ts?: string }>("sendMessage", {
      channel: channelId,
      text: { body: text },
      threadTs: opts?.replyTo,
    }).then((res) => ({
      channelId: res.channel ?? channelId,
      messageId: res.ts,
    }));
  }

  addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.call("sendMessage", {
      channel: channelId,
      reaction: {
        emoji: emoji.replace(/^:/, "").replace(/:$/, ""),
        itemChannel: channelId,
        itemTs: messageId,
        removed: false,
      },
    }).then(() => undefined);
  }

  removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.call("sendMessage", {
      channel: channelId,
      reaction: {
        emoji: emoji.replace(/^:/, "").replace(/:$/, ""),
        itemChannel: channelId,
        itemTs: messageId,
        removed: true,
      },
    }).then(() => undefined);
  }

  editText(
    channelId: string,
    messageId: string,
    text: string
  ): Promise<{ channelId?: string; messageId?: string }> {
    return this.call<{ channel?: string; ts?: string }>("editMessage", {
      channel: channelId,
      text,
      ts: messageId,
    }).then((res) => ({
      channelId: res.channel ?? channelId,
      messageId: res.ts ?? messageId,
    }));
  }

  deleteMessage(channelId: string, messageId: string): Promise<void> {
    return this.call("deleteMessage", {
      channel: channelId,
      ts: messageId,
    }).then(() => undefined);
  }

  uploadFile(
    channelId: string,
    file: { data: Uint8Array; name: string },
    opts?: { replyTo?: string }
  ): Promise<{ channelId?: string; messageId?: string }> {
    return new Promise((resolve, reject) => {
      this.files.upload(
        {
          channel: channelId,
          content: file.data,
          filename: file.name,
          mimetype: "application/octet-stream",
          threadTs: opts?.replyTo,
        },
        this.meta,
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          const body = res as {
            shares?: { channel?: string; ts?: string }[];
          };
          const share = body.shares?.find((s) => s.channel === channelId);
          resolve({
            channelId,
            messageId: share?.ts,
          });
        }
      );
    });
  }

  subscribe(handlers: SlackGrpcHandlers): { cancel: () => void } {
    const stream = this.client.subscribeEvents({}, this.meta);
    stream.on("data", (frame) => {
      const f = frame as {
        message?: {
          channel: string;
          files?: {
            id: string;
            mimetype?: string;
            name?: string;
            size?: number;
          }[];
          isFromMe?: boolean;
          subtype?: string;
          text: string;
          threadTs?: string;
          ts: string;
          user: string;
        };
        reaction?: {
          isFromMe?: boolean;
          itemChannel: string;
          itemTs: string;
          name: string;
          removed?: boolean;
          user: string;
        };
      };
      if (f.message) {
        const m = f.message;
        handlers.onText?.({
          channelId: m.channel,
          files: m.files?.map((f) => ({
            id: f.id,
            mimetype: f.mimetype,
            name: f.name,
            size: f.size,
          })),
          isFromMe: Boolean(m.isFromMe),
          messageId: m.ts,
          subtype: m.subtype,
          text: m.text,
          threadTs: m.threadTs,
          userId: m.user,
        });
        return;
      }
      if (f.reaction) {
        const r = f.reaction;
        handlers.onReaction?.({
          channelId: r.itemChannel,
          emoji: r.name,
          messageId: r.itemTs,
          removed: Boolean(r.removed),
          userId: r.user,
        });
      }
    });
    return {
      cancel() {
        try {
          stream.cancel();
        } catch {
          /* ignore */
        }
      },
    };
  }

  close(): void {
    this.client.close?.();
  }
}
