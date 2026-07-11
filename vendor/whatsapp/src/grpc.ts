import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PACKAGE = "interactions.whatsapp.v1";

/** A decoded inbound WhatsApp text message. */
export interface WaInboundText {
  messageId: string;
  senderId: string;
  text: string;
}

/**
 * gRPC client for one WhatsApp personal line (`interactions.whatsapp.v1`).
 * Insecure channel (Tailscale secures transport); Bearer runtime token plus
 * `x-project-id` metadata. Recipients are WhatsApp JIDs / E.164 numbers.
 */
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

  subscribeEvents(handlers: {
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
      const text = changed.text?.text ?? changed.text?.body;
      if (typeof text !== "string" || !text) {
        return;
      }
      handlers.onText(
        {
          messageId: changed.text?.message_id ?? "",
          senderId: changed.recipient ?? "",
          text,
        },
        toDate(changed.occurred_at) ?? new Date()
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

/** WhatsApp protos ship under ./proto/whatsapp; allow override via WA_PROTO_DIR. */
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
