import { createHmac, timingSafeEqual } from "node:crypto";

export interface LineSource {
  groupId?: string;
  roomId?: string;
  type?: string;
  userId?: string;
}

export interface LineEventMessage {
  contentProvider?: { type?: string };
  duration?: number;
  fileName?: string;
  fileSize?: number;
  id: string;
  packageId?: string;
  stickerId?: string;
  text?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  type: string;
}

export interface LineEvent {
  message?: LineEventMessage;
  postback?: { data?: string };
  replyToken?: string;
  source?: LineSource;
  timestamp?: number;
  type: string;
  unsend?: { messageId: string };
}

export function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string
): boolean {
  const expected = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createLineWebhookHandler(opts: {
  channelSecret?: string;
  onEvent: (event: LineEvent) => void;
}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      const raw = await request.text();
      if (opts.channelSecret) {
        const signature = request.headers.get("x-line-signature") ?? "";
        if (!verifyLineSignature(raw, signature, opts.channelSecret)) {
          return new Response("invalid signature", { status: 401 });
        }
      }
      const body = JSON.parse(raw) as { events?: LineEvent[] };
      for (const event of body.events ?? []) {
        opts.onEvent(event);
      }
      return new Response("ok", { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad request";
      return new Response(message, { status: 400 });
    }
  };
}

/** Source id used as the Skyline channel target (user / group / room). */
export function lineSourceId(source?: LineSource): string {
  return source?.groupId ?? source?.roomId ?? source?.userId ?? "";
}
