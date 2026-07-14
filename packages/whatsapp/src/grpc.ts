import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PACKAGE = "interactions.whatsapp.v1";

export interface WaInboundText {
  messageId: string;
  replyToMessageId?: string;
  senderId: string;
  text: string;
}

export interface WaInboundAttachment {
  caption?: string;
  fileSize?: number;
  kind: string;
  messageId: string;
  name?: string;
  replyToMessageId?: string;
  senderId: string;
}

export interface WaInboundReaction {
  emoji: string;
  messageId: string;
  removed: boolean;
  senderId: string;
}

export class WhatsappGrpcClient {
  private readonly client: grpc.Client;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly service: any;
  private readonly token: string;
  private readonly projectId: string;

  constructor(target: string, token: string, projectId = "local") {
    this.token = token;
    this.projectId = projectId;
    const protoDir = resolveWaProtoDir();
    const protoFiles = readdirSync(protoDir)
      .filter((f) => f.endsWith(".proto"))
      .map((f) => join(protoDir, f));

    const def = protoLoader.loadSync(protoFiles, {
      defaults: true,
      enums: String,
      includeDirs: [protoDir],
      keepCase: true,
      longs: String,
      oneofs: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto package traversal.
    const loaded = grpc.loadPackageDefinition(def) as any;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto package traversal.
    const pkg = PACKAGE.split(".").reduce((o: any, k) => o[k], loaded);
    this.client = new pkg.MessageService(
      target,
      grpc.credentials.createInsecure()
    );
    this.service = this.client;
  }

  private metadata(): grpc.Metadata {
    const md = new grpc.Metadata();
    if (this.token) {
      md.set("authorization", `Bearer ${this.token}`);
    }
    md.set("x-project-id", this.projectId);
    return md;
  }

  waitForReady(deadlineMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.waitForReady(new Date(Date.now() + deadlineMs), (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  sendText(
    recipient: string,
    text: string,
    clientMessageId: string,
    replyTo?: string
  ): Promise<{ messageId: string }> {
    const request = {
      client_message_id: clientMessageId,
      content: [
        {
          text: [{ text }],
          type: "TEXT_BLOCK_TYPE_NORMAL",
        },
      ],
      enable_link_preview: true,
      recipient,
      reply_to: replyTo,
    };
    return new Promise((resolve, reject) => {
      this.service.SendTextMessage(
        request,
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: dynamic proto response.
        (err: grpc.ServiceError | null, res: any) =>
          err
            ? reject(err)
            : resolve({ messageId: res?.message?.message_id ?? "" })
      );
    });
  }

  sendReaction(
    recipient: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.service.SendReaction(
        { emoji, message_id: messageId, recipient },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  sendMediaMessage(
    recipient: string,
    media: {
      caption?: string;
      data: Uint8Array;
      kind: "MEDIA_KIND_IMAGE" | "MEDIA_KIND_VIDEO";
    },
    clientMessageId: string
  ): Promise<{ messageId: string }> {
    return new Promise((resolve, reject) => {
      this.service.SendMediaMessage(
        {
          client_message_id: clientMessageId,
          media: {
            caption: media.caption,
            data: media.data,
            kind: media.kind,
          },
          recipient,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: dynamic proto response.
        (err: grpc.ServiceError | null, res: any) =>
          err
            ? reject(err)
            : resolve({ messageId: res?.message?.message_id ?? "" })
      );
    });
  }

  sendDocument(
    recipient: string,
    data: Uint8Array,
    opts: {
      caption?: string;
      fileName?: string;
      mimeType?: string;
    },
    clientMessageId: string
  ): Promise<{ messageId: string }> {
    return new Promise((resolve, reject) => {
      this.service.SendDocument(
        {
          caption: opts.caption,
          client_message_id: clientMessageId,
          data,
          file_name: opts.fileName,
          mime_type: opts.mimeType,
          recipient,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: dynamic proto response.
        (err: grpc.ServiceError | null, res: any) =>
          err
            ? reject(err)
            : resolve({ messageId: res?.message?.message_id ?? "" })
      );
    });
  }

  sendAudio(
    recipient: string,
    data: Uint8Array,
    mimeType: string | undefined,
    clientMessageId: string
  ): Promise<{ messageId: string }> {
    return new Promise((resolve, reject) => {
      this.service.SendAudio(
        {
          client_message_id: clientMessageId,
          data,
          mime_type: mimeType,
          recipient,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: dynamic proto response.
        (err: grpc.ServiceError | null, res: any) =>
          err
            ? reject(err)
            : resolve({ messageId: res?.message?.message_id ?? "" })
      );
    });
  }

  sendAlbum(
    recipient: string,
    items: {
      caption?: string;
      data: Uint8Array;
      kind: "MEDIA_KIND_IMAGE" | "MEDIA_KIND_VIDEO";
    }[],
    clientMessageId: string
  ): Promise<{ messageIds: string[] }> {
    return new Promise((resolve, reject) => {
      this.service.SendAlbum(
        {
          client_message_id: clientMessageId,
          items: items.map((item) => ({
            caption: item.caption,
            data: item.data,
            kind: item.kind,
          })),
          recipient,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: dynamic proto response.
        (err: grpc.ServiceError | null, res: any) =>
          err
            ? reject(err)
            : resolve({
                messageIds: (res?.messages ?? []).map(
                  (m: { message_id?: string }) => m.message_id ?? ""
                ),
              })
      );
    });
  }

  subscribeEvents(handlers: {
    onAttachment?: (msg: WaInboundAttachment, date: Date) => void;
    onReaction?: (msg: WaInboundReaction, date: Date) => void;
    onText: (msg: WaInboundText, date: Date) => void;
    onError?: (err: grpc.ServiceError) => void;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
  }): grpc.ClientReadableStream<any> {
    const call = this.service.SubscribeMessageEvents(
      {},
      this.metadata()
      // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    ) as grpc.ClientReadableStream<any>;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    call.on("data", (event: any) => {
      const changed = event?.message_changed;
      if (!changed || changed.is_from_me) {
        return;
      }
      const date = toDate(changed.occurred_at) ?? new Date();
      const senderId = changed.recipient ?? "";

      if (changed.reaction) {
        const reaction = changed.reaction;
        handlers.onReaction?.({
          emoji: reaction.emoji ?? "",
          messageId: reaction.message_id ?? "",
          removed: !reaction.emoji,
          senderId: reaction.actor_jid ?? senderId,
        }, date);
        return;
      }

      if (changed.attachment) {
        const attachment = changed.attachment;
        handlers.onAttachment?.({
          caption: attachment.caption,
          fileSize: attachment.file_size,
          kind: attachment.kind ?? "MESSAGE_ATTACHMENT_KIND_UNKNOWN",
          messageId: attachment.message_id ?? "",
          name: attachment.title,
          replyToMessageId: attachment.reply_to_message_id,
          senderId,
        }, date);
        return;
      }

      const text = changed.text?.text ?? changed.text?.body;
      if (typeof text !== "string" || !text) {
        return;
      }
      handlers.onText(
        {
          messageId: changed.text?.message_id ?? "",
          replyToMessageId: changed.text?.reply_to_message_id,
          senderId,
          text,
        },
        date
      );
    });
    call.on("error", (err: grpc.ServiceError) => handlers.onError?.(err));
    return call;
  }

  close(): void {
    this.client.close();
  }
}

function toDate(
  ts: { seconds?: string | number; nanos?: number } | undefined
): Date | null {
  if (!ts || ts.seconds === undefined) {
    return null;
  }
  return new Date(
    Number(ts.seconds) * 1000 + Math.floor(Number(ts.nanos ?? 0) / 1e6)
  );
}

function resolveWaProtoDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.WA_PROTO_DIR,
    join(here, "..", "proto", "whatsapp"),
    join(process.cwd(), "proto", "whatsapp"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  throw new Error(
    "whatsapp proto dir not found — set WA_PROTO_DIR or ship ./proto/whatsapp"
  );
}

export function grpcTarget(address: string): string {
  let a = address
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!/:\d+$/.test(a)) {
    a = `${a}:50051`;
  }
  return a;
}
