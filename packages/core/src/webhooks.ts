import { createHmac, timingSafeEqual } from "node:crypto";

import type { Platform } from "./types.js";

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

export type SkylineService = "imessage" | "sms" | "whatsapp";

export interface SkylineAttachment {
  id: string;
  mimeType: string | null;
  name: string | null;
  size: number | null;
}

export interface SkylineMessageEvent {
  attachments: SkylineAttachment[];
  channelId: string;
  from: string | null;
  fromMe: boolean;
  id: string;
  isGroup: boolean;
  replyTo: string | null;
  service: SkylineService;
  text: string;
  timestamp: string;
}

export interface SkylineReactionEvent {
  channelId: string;
  from: string | null;
  messageId: string;
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
  change: string;
  channelId: string;
  value: string | null;
}

export interface SkylineFailedEvent {
  channelId: string;
  code: number | null;
  message: string | null;
}

export interface SkylineEventDataMap {
  "group.updated": SkylineGroupUpdateEvent;
  "message.failed": SkylineFailedEvent;
  "message.received": SkylineMessageEvent;
  "message.sent": SkylineMessageEvent;
  "message.updated": SkylineMessageEvent;
  "reaction.added": SkylineReactionEvent;
  "reaction.removed": SkylineReactionEvent;
  read: SkylineReadEvent;
  "typing.started": SkylineTypingEvent;
  "typing.stopped": SkylineTypingEvent;
}

export interface SkylineEvent<T extends SkylineEventType = SkylineEventType> {
  data: SkylineEventDataMap[T];
  eventId: string;
  platform: Platform;
  projectId: string;
  receivedAt: string;
  type: T;
}

const SIG_VERSION = "v0";
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export interface VerifyOptions {
  nowSeconds?: number;
  toleranceSeconds?: number;
}

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

export const WEBHOOK_HEADERS = {
  signature: "x-interactions-signature",
  timestamp: "x-interactions-timestamp",
  webhookId: "x-interactions-webhook-id",
} as const;
