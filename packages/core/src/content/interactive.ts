/**
 * Cross-platform interactive / Bot-UX content. Named in Skyline terms;
 * platforms that lack a native mapping throw UnsupportedError.
 */

import type { AttachmentInput } from "./builders.js";

export interface KeyboardButton {
  callbackData?: string;
  text: string;
  url?: string;
  webApp?: { url: string };
}

export interface KeyboardContent {
  buttons: KeyboardButton[][];
  oneTime?: boolean;
  placeholder?: string;
  replyKeyboard?: boolean;
  resize?: boolean;
  type: "keyboard";
}

export interface LocationContent {
  address?: string;
  heading?: number;
  horizontalAccuracy?: number;
  latitude: number;
  livePeriod?: number;
  longitude: number;
  proximityAlertRadius?: number;
  title?: string;
  type: "location";
}

export interface DiceContent {
  emoji?: "🎲" | "🎯" | "🏀" | "⚽" | "🎳" | "🎰";
  type: "dice";
  value?: number;
}

export interface ForwardContent {
  fromChatId: string;
  messageId: string;
  type: "forward";
}

export interface ForwardManyContent {
  fromChatId: string;
  messageIds: string[];
  type: "forward_many";
}

export interface CopyContent {
  caption?: string;
  fromChatId: string;
  messageId: string;
  type: "copy";
}

export interface CopyManyContent {
  fromChatId: string;
  messageIds: string[];
  type: "copy_many";
}

export interface LabeledPrice {
  amount: number;
  label: string;
}

export interface InvoiceContent {
  currency: string;
  description: string;
  maxTipAmount?: number;
  needEmail?: boolean;
  needName?: boolean;
  needPhoneNumber?: boolean;
  needShippingAddress?: boolean;
  payload: string;
  photoHeight?: number;
  photoSize?: number;
  photoUrl?: string;
  photoWidth?: number;
  prices: LabeledPrice[];
  providerData?: string;
  providerToken?: string;
  sendEmailToProvider?: boolean;
  sendPhoneNumberToProvider?: boolean;
  suggestedTipAmounts?: number[];
  title: string;
  type: "invoice";
}

export interface GameContent {
  gameShortName: string;
  type: "game";
}

export interface ChecklistItem {
  id?: string;
  text: string;
}

export interface ChecklistContent {
  items: ChecklistItem[];
  othersCanAddTasks?: boolean;
  othersCanMarkTasksAsDone?: boolean;
  title?: string;
  type: "checklist";
}

export interface PaidMediaContent {
  caption?: string;
  media: AttachmentInput[];
  payload?: string;
  showCaptionAboveMedia?: boolean;
  starCount: number;
  type: "paid_media";
}

export interface GiftContent {
  giftId: string;
  payForUpgrade?: boolean;
  text?: string;
  textParseMode?: "HTML" | "MarkdownV2";
  type: "gift";
  userId?: string;
}

export interface RichMessageContent {
  html?: string;
  isRtl?: boolean;
  markdown?: string;
  skipEntityDetection?: boolean;
  text?: string;
  type: "rich_message";
}

export interface LivePhotoContent {
  caption?: string;
  hasSpoiler?: boolean;
  photo: AttachmentInput;
  showCaptionAboveMedia?: boolean;
  type: "live_photo";
  video: AttachmentInput;
}

export type InteractiveContent =
  | KeyboardContent
  | LocationContent
  | DiceContent
  | ForwardContent
  | ForwardManyContent
  | CopyContent
  | CopyManyContent
  | InvoiceContent
  | GameContent
  | ChecklistContent
  | PaidMediaContent
  | GiftContent
  | RichMessageContent
  | LivePhotoContent;

export function keyboard(input: Omit<KeyboardContent, "type">): KeyboardContent {
  if (!input.buttons?.length) {
    throw new Error("keyboard: needs at least one row");
  }
  return { type: "keyboard", ...input };
}

export function location(input: Omit<LocationContent, "type">): LocationContent {
  return { type: "location", ...input };
}

export function venue(
  input: Omit<LocationContent, "type"> & { address: string; title: string }
): LocationContent {
  return { type: "location", ...input };
}

export function dice(input?: Omit<DiceContent, "type">): DiceContent {
  return { type: "dice", ...input };
}

export function forward(input: Omit<ForwardContent, "type">): ForwardContent {
  return { type: "forward", ...input };
}

export function forwardMany(
  input: Omit<ForwardManyContent, "type">
): ForwardManyContent {
  if (!input.messageIds?.length) {
    throw new Error("forwardMany: needs at least one messageId");
  }
  return { type: "forward_many", ...input };
}

export function copy(input: Omit<CopyContent, "type">): CopyContent {
  return { type: "copy", ...input };
}

export function copyMany(input: Omit<CopyManyContent, "type">): CopyManyContent {
  if (!input.messageIds?.length) {
    throw new Error("copyMany: needs at least one messageId");
  }
  return { type: "copy_many", ...input };
}

export function invoice(input: Omit<InvoiceContent, "type">): InvoiceContent {
  return { type: "invoice", ...input };
}

export function game(input: Omit<GameContent, "type">): GameContent {
  return { type: "game", ...input };
}

export function checklist(
  input: Omit<ChecklistContent, "type">
): ChecklistContent {
  if (!input.items?.length) {
    throw new Error("checklist: needs at least one item");
  }
  return { type: "checklist", ...input };
}

export function paidMedia(
  input: Omit<PaidMediaContent, "type">
): PaidMediaContent {
  if (!input.media?.length) {
    throw new Error("paidMedia: needs at least one media item");
  }
  return { type: "paid_media", ...input };
}

export function gift(input: Omit<GiftContent, "type">): GiftContent {
  return { type: "gift", ...input };
}

export function richMessage(
  input?: Omit<RichMessageContent, "type">
): RichMessageContent {
  return { type: "rich_message", ...(input ?? {}) };
}

export function livePhoto(
  input: Omit<LivePhotoContent, "type">
): LivePhotoContent {
  return { type: "live_photo", ...input };
}

export function isInteractiveContent(content: {
  type: string;
}): content is InteractiveContent {
  switch (content.type) {
    case "keyboard":
    case "location":
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
    case "rich_message":
    case "live_photo":
      return true;
    default:
      return false;
  }
}
