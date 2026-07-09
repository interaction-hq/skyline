// Webhook contract for consumers. A webhook is the durable, server-to-server
// counterpart of the live `app.incoming` / `app.on(...)` feed: register a URL in
// the dashboard and Skyline POSTs a signed `SkylineEvent` for every inbound
// event, with retries. The payload shape matches `incoming`/signals, so backend
// (webhook) and UI (live) handlers can share one code path.
//
// This module is types + a signature verifier only — no network, no platform
// coupling — so it is safe to import in any runtime that receives the POSTs.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Platform } from "./types";

/** Stable, dot-namespaced event type delivered to a webhook. */
export type SkylineEventType =
  | "message.received"
  | "message.sent"
  | "message.updated"
  | "message.failed"
  | "reaction.added"
  | "reaction.removed"
  | "typing.started"
  | "typing.stopped"
  | "read"
  | "group.updated";

/** How a message was carried, when the platform distinguishes fallbacks. */
export type SkylineService = "imessage" | "sms" | "whatsapp";

export interface SkylineAttachment {
  /** Opaque id — use it to fetch the bytes on demand (they are not in the payload). */
  id: string;
  name: string | null;
  mimeType: string | null;
  /** Size in bytes when known, else null. */
  size: number | null;
}

export interface SkylineMessageEvent {
  /** Stable message id — use for idempotency / dedup. */
  id: string;
  /** Conversation id (the `channel` this belongs to). */
  channelId: string;
  /** Sender handle (phone/email), or null for your own outbound. */
  from: string | null;
  /** Plain text body ("" when the message is media-only). */
  text: string;
  attachments: SkylineAttachment[];
  /** True when the message came from your own line. */
  fromMe: boolean;
  service: SkylineService;
  isGroup: boolean;
  /** Message id this replies to, when threaded. */
  replyTo: string | null;
  timestamp: string;
}

export interface SkylineReactionEvent {
  messageId: string;
  channelId: string;
  from: string | null;
  /** Friendly name (love, like, laugh, …) or an emoji. */
  reaction: string;
  timestamp: string;
}

export interface SkylineTypingEvent {
  channelId: string;
  from: string | null;
}

export interface SkylineReadEvent {
  channelId: string;
}

export interface SkylineGroupUpdateEvent {
  channelId: string;
  /** name | participant_added | participant_removed | icon | background. */
  change: string;
  value: string | null;
}

export interface SkylineFailedEvent {
  channelId: string;
  code: number | null;
  message: string | null;
}

/** Map an event type to its `data` payload, for exhaustive handling. */
export interface SkylineEventDataMap {
  "message.received": SkylineMessageEvent;
  "message.sent": SkylineMessageEvent;
  "message.updated": SkylineMessageEvent;
  "message.failed": SkylineFailedEvent;
  "reaction.added": SkylineReactionEvent;
  "reaction.removed": SkylineReactionEvent;
  "typing.started": SkylineTypingEvent;
  "typing.stopped": SkylineTypingEvent;
  read: SkylineReadEvent;
  "group.updated": SkylineGroupUpdateEvent;
}

/** The full envelope POSTed to your webhook URL. */
export interface SkylineEvent<
  T extends SkylineEventType = SkylineEventType,
> {
  /** Unique delivery id — dedupe on this (also sent as a header). */
  eventId: string;
  type: T;
  platform: Platform;
  projectId: string;
  /** ISO-8601 time Skyline observed the event. */
  receivedAt: string;
  data: SkylineEventDataMap[T];
}

const SIG_VERSION = "v0";
/** Reject deliveries whose timestamp is older than this (replay protection). */
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export interface VerifyOptions {
  /** Max age of a delivery, in seconds (default 300). */
  toleranceSeconds?: number;
  /** Override "now" (seconds since epoch) — for tests. */
  nowSeconds?: number;
}

/**
 * Verify a webhook delivery. Pass the raw request body (as received, unparsed),
 * the `x-interactions-signature` and `x-interactions-timestamp` headers, and the
 * endpoint's signing secret (`whsec_…`). Returns true only when the signature
 * matches and the timestamp is fresh.
 *
 *   const ok = verifyWebhook(rawBody, sig, ts, process.env.SKYLINE_WEBHOOK_SECRET);
 *   if (!ok) return res.status(401).end();
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string | number,
  signingSecret: string,
  opts: VerifyOptions = {}
): boolean {
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }
  const mac = createHmac("sha256", signingSecret);
  mac.update(`${SIG_VERSION}:${timestamp}:${rawBody}`);
  const expected = `${SIG_VERSION}=${mac.digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Parse + verify in one step. Returns the typed event on success, or null when
 * the signature/timestamp is invalid or the body is not JSON.
 */
export function parseWebhook(
  rawBody: string,
  headers: {
    signature: string;
    timestamp: string | number;
  },
  signingSecret: string,
  opts?: VerifyOptions
): SkylineEvent | null {
  if (
    !verifyWebhook(
      rawBody,
      headers.signature,
      headers.timestamp,
      signingSecret,
      opts
    )
  ) {
    return null;
  }
  try {
    return JSON.parse(rawBody) as SkylineEvent;
  } catch {
    return null;
  }
}

/** Header names Skyline sends on every webhook delivery. */
export const WEBHOOK_HEADERS = {
  signature: "x-interactions-signature",
  timestamp: "x-interactions-timestamp",
  /** Per-delivery id — matches `event.eventId`; use for dedupe/replay. */
  webhookId: "x-interactions-webhook-id",
} as const;
