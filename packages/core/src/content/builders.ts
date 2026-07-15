import type { Flow, PaymentProvider } from "../miniapp/experience.js";
import type { InteractiveContent } from "./interactive.js";
import type { MediaAlbumContent } from "./media-album.js";

export type { Flow };

export interface TextMessage {
  text: string;
  type: "text";
}

export interface AppMessage {
  appId?: string;
  appStoreId?: number;
  bundleId?: string;
  caption?: string;
  data?: Record<string, string>;
  effect?: string;
  image?: string;
  imageSubtitle?: string;
  imageTitle?: string;
  interactive?: boolean;
  subcaption?: string;
  summary?: string;
  teamId?: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
  type: "app";
  url: string;
}

export interface FlowMessage {
  appId?: string;
  appStoreId?: number;
  bundleId?: string;
  caption?: string;
  data?: Record<string, string>;
  flow?: Flow;
  image?: string;
  screen?: string;
  session?: string;
  subcaption?: string;
  summary?: string;
  teamId?: string;
  type: "flow";
}

export interface WaMediaContent {
  caption?: string;
  filename?: string;
  id?: string;
  kind: "image" | "video" | "audio" | "document" | "sticker";
  link?: string;
  type: "wa_media";
}

export interface WaTemplateContent {
  components?: Record<string, unknown>[];
  language: string;
  name: string;
  type: "wa_template";
}

export interface WaInteractiveContent {
  interactive: Record<string, unknown>;
  type: "wa_interactive";
}

export interface WaLocationContent {
  address?: string;
  latitude: number | string;
  longitude: number | string;
  name?: string;
  type: "wa_location";
}

export interface WaContactsContent {
  contacts: Record<string, unknown>[];
  type: "wa_contacts";
}

export type WaContent =
  | WaMediaContent
  | WaTemplateContent
  | WaInteractiveContent
  | WaLocationContent
  | WaContactsContent;

export interface AttachmentInput {
  data?: Uint8Array;
  isAudioMessage?: boolean;
  isSticker?: boolean;
  /** GIF / MPEG-4 animation (Telegram `sendAnimation` and similar). */
  isAnimation?: boolean;
  /** Round video note (Telegram `sendVideoNote` and similar). */
  isVideoNote?: boolean;
  mimeType?: string;
  name?: string;
  path?: string;
  url?: string;
}

export interface AttachmentContent extends AttachmentInput {
  caption?: string;
  type: "attachment";
}

export interface MarkdownContent {
  body: string;
  type: "markdown";
}

export interface VoiceContent {
  data?: Uint8Array;
  mimeType?: string;
  name?: string;
  path?: string;
  type: "voice";
  url?: string;
}

export interface ContactContent {
  emails?: string[];
  firstName?: string;
  lastName?: string;
  phones?: string[];
  type: "contact";
  vcard?: string;
}

export interface RichlinkContent {
  type: "richlink";
  url: string;
}

export interface PollContent {
  allowsMultipleAnswers?: boolean;
  closeDate?: number;
  correctOptionId?: number;
  explanation?: string;
  isAnonymous?: boolean;
  isClosed?: boolean;
  openPeriod?: number;
  options: string[];
  /** `quiz` enables correctOptionId / explanation. */
  pollType?: "regular" | "quiz";
  title: string;
  type: "poll";
}

export type DigitalTouchKind =
  | "tap"
  | "heartbeat"
  | "sketch"
  | "kiss"
  | "anger"
  | "video";

export interface DigitalTouchContent {
  bpm?: number;
  color?: string;
  kind: DigitalTouchKind;
  mediaPath?: string;
  stillPath?: string;
  tapCount?: number;
  type: "digital_touch";
}

export interface CustomContent {
  raw: unknown;
  type: "custom";
}

export interface StreamTextContent {
  format?: "plain" | "markdown";
  stream: () => AsyncIterable<string>;
  type: "stream_text";
}

export interface GroupContent {
  items: PayloadContent[];
  type: "group";
}

export type PayloadContent =
  | TextMessage
  | AppMessage
  | FlowMessage
  | AttachmentContent
  | MarkdownContent
  | VoiceContent
  | ContactContent
  | RichlinkContent
  | PollContent
  | DigitalTouchContent
  | StreamTextContent
  | CustomContent
  | GroupContent
  | WaContent
  | InteractiveContent
  | MediaAlbumContent;

export type Tapback =
  | "love"
  | "like"
  | "laugh"
  | "emphasize"
  | "question"
  | "dislike";

export type Reaction = Tapback | (string & {});

export const EFFECTS = {
  balloons: "com.apple.messages.effect.CKHappyBirthdayEffect",
  confetti: "com.apple.messages.effect.CKConfettiEffect",
  echo: "com.apple.messages.effect.CKEchoEffect",
  fireworks: "com.apple.messages.effect.CKFireworksEffect",
  gentle: "com.apple.MobileSMS.expressivesend.gentle",
  invisible: "com.apple.MobileSMS.expressivesend.invisibleink",
  lasers: "com.apple.messages.effect.CKLasersEffect",
  loud: "com.apple.MobileSMS.expressivesend.loud",
  love: "com.apple.messages.effect.CKHeartEffect",
  slam: "com.apple.MobileSMS.expressivesend.impact",
  spotlight: "com.apple.messages.effect.CKSpotlightEffect",
} as const;

export type Effect = keyof typeof EFFECTS | (string & {});

export function resolveEffect(effect: Effect | undefined): string | undefined {
  if (!effect) {
    return;
  }
  return (EFFECTS as Record<string, string>)[effect] ?? effect;
}

export interface InlineKeyboardButton {
  callbackData?: string;
  switchInlineQuery?: string;
  switchInlineQueryCurrentChat?: string;
  text: string;
  url?: string;
  webApp?: { url: string };
}

export type ReplyMarkup =
  | {
      inlineKeyboard: InlineKeyboardButton[][];
      type: "inline";
    }
  | {
      keyboard: { text: string }[][];
      oneTime?: boolean;
      placeholder?: string;
      resize?: boolean;
      type: "reply";
    }
  | { type: "remove"; selective?: boolean }
  | { type: "force_reply"; placeholder?: string; selective?: boolean };

export interface SendOptions {
  caption?: string;
  effect?: Effect;
  entities?: MessageEntity[];
  linkPreview?: boolean;
  parseMode?: "HTML" | "MarkdownV2";
  protect?: boolean;
  replyMarkup?: ReplyMarkup;
  replyTo?: string;
  richLink?: boolean;
  scan?: boolean;
  silent?: boolean;
  subject?: string;
  threadId?: number | string;
}

export interface MessageEntity {
  customEmojiId?: string;
  language?: string;
  length: number;
  offset: number;
  type: string;
  url?: string;
  user?: { id: string };
}

export interface AttachmentSend {
  audio?: boolean;
  data?: Uint8Array | ArrayBuffer;
  mimeType?: string;
  name?: string;
  path?: string;
  sticker?: boolean;
  url?: string;
}

export function text(body: string): TextMessage {
  return { text: body, type: "text" };
}

export function attachment(input: AttachmentInput): AttachmentContent {
  return { type: "attachment", ...input };
}

export function sticker(input: AttachmentInput): AttachmentContent {
  return { type: "attachment", isSticker: true, ...input };
}

export function animation(input: AttachmentInput): AttachmentContent {
  return { type: "attachment", isAnimation: true, ...input };
}

export function videoNote(input: AttachmentInput): AttachmentContent {
  return { type: "attachment", isVideoNote: true, ...input };
}

export function markdown(body: string): MarkdownContent {
  return { body, type: "markdown" };
}

export function voice(input: Omit<VoiceContent, "type">): VoiceContent {
  return { type: "voice", ...input };
}

export function contactCard(
  input: Omit<ContactContent, "type">
): ContactContent {
  return { type: "contact", ...input };
}

export function richlink(url: string): RichlinkContent {
  return { type: "richlink", url };
}

export function poll(
  title: string,
  options: string[],
  opts?: {
    allowsMultipleAnswers?: boolean;
    isAnonymous?: boolean;
    openPeriod?: number;
  }
): PollContent {
  return { options, title, type: "poll", ...opts };
}

export function digitalTouch(
  input: Omit<DigitalTouchContent, "type">
): DigitalTouchContent {
  return { type: "digital_touch", ...input };
}

export function custom(raw: unknown): CustomContent {
  return { raw, type: "custom" };
}

type StreamTextSource =
  | AsyncIterable<string>
  | ReadableStream<string>
  | (() => AsyncIterable<string> | Promise<AsyncIterable<string>>)
  | { textStream: AsyncIterable<string> };

async function* iterateStreamSource(
  source: StreamTextSource
): AsyncIterable<string> {
  if (typeof source === "function") {
    yield* await source();
    return;
  }
  if (typeof source === "object" && source !== null && "textStream" in source) {
    yield* source.textStream;
    return;
  }
  if (
    typeof ReadableStream !== "undefined" &&
    source instanceof ReadableStream
  ) {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        if (value != null && value !== "") {
          yield value;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  yield* source as AsyncIterable<string>;
}

/** Platforms without live streaming drain to one text/markdown send. */
export function streamText(
  source: StreamTextSource,
  opts?: { format?: "plain" | "markdown" }
): StreamTextContent {
  return {
    format: opts?.format ?? "plain",
    stream: () => iterateStreamSource(source),
    type: "stream_text",
  };
}

export function customizedMiniApp(input: {
  appName?: string;
  appStoreId?: number;
  bundleId: string;
  caption?: string;
  data?: Record<string, string>;
  image?: string;
  imageSubtitle?: string;
  imageTitle?: string;
  interactive?: boolean;
  subcaption?: string;
  summary?: string;
  teamId: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
  url: string;
}): AppMessage {
  return app({
    appId: input.appName,
    appStoreId: input.appStoreId,
    bundleId: input.bundleId,
    caption: input.caption,
    data: input.data,
    image: input.image,
    imageSubtitle: input.imageSubtitle,
    imageTitle: input.imageTitle,
    interactive: input.interactive ?? true,
    subcaption: input.subcaption,
    summary: input.summary ?? input.appName,
    teamId: input.teamId,
    trailingCaption: input.trailingCaption,
    trailingSubcaption: input.trailingSubcaption,
    url: input.url,
  });
}

export function group(...items: PayloadContent[]): GroupContent {
  if (items.length < 2) {
    throw new Error("group: needs at least two items");
  }
  return { items, type: "group" };
}

export function app(input: Omit<AppMessage, "type">): AppMessage {
  if (!input.url.startsWith("https://")) {
    throw new Error("app: url must be https");
  }
  return { interactive: input.interactive ?? true, type: "app", ...input };
}

export function flow(input: Omit<FlowMessage, "type">): FlowMessage {
  if (!(input.appId || input.flow)) {
    throw new Error("flow: pass an inline `flow` or a registered `appId`");
  }
  if (input.flow && !input.flow.screens?.length) {
    throw new Error("flow: inline flow needs at least one screen");
  }
  return { type: "flow", ...input };
}

export interface PaymentRequest {
  amount: string;
  caption?: string;
  currency?: string;
  note?: string;
  payeeLabel?: string;
  provider?: PaymentProvider;
  url?: string;
}

export function payment(input: PaymentRequest): FlowMessage {
  const provider = input.provider ?? "appleCash";
  if (provider === "link" && !input.url) {
    throw new Error("payment: provider 'link' requires a checkout url");
  }
  return flow({
    caption: input.caption ?? input.note ?? "Payment request",
    flow: {
      screens: [
        {
          components: [
            {
              amount: input.amount,
              currency: input.currency,
              note: input.note,
              payeeLabel: input.payeeLabel,
              provider,
              type: "payment",
              url: input.url,
            },
          ],
          id: "pay",
        },
      ],
    },
  });
}

export const wa = {
  audio(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { kind: "audio", type: "wa_media", ...input };
  },
  contacts(contacts: Record<string, unknown>[]): WaContactsContent {
    return { contacts, type: "wa_contacts" };
  },
  document(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { kind: "document", type: "wa_media", ...input };
  },
  image(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { kind: "image", type: "wa_media", ...input };
  },
  interactive(interactive: Record<string, unknown>): WaInteractiveContent {
    return { interactive, type: "wa_interactive" };
  },
  location(input: Omit<WaLocationContent, "type">): WaLocationContent {
    return { type: "wa_location", ...input };
  },
  sticker(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { kind: "sticker", type: "wa_media", ...input };
  },
  template(input: Omit<WaTemplateContent, "type">): WaTemplateContent {
    return { type: "wa_template", ...input };
  },
  video(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { kind: "video", type: "wa_media", ...input };
  },
};

export function isWaContent(content: PayloadContent): content is WaContent {
  return (
    content.type === "wa_media" ||
    content.type === "wa_template" ||
    content.type === "wa_interactive" ||
    content.type === "wa_location" ||
    content.type === "wa_contacts"
  );
}

export function isGroupContent(
  content: PayloadContent
): content is GroupContent {
  return content.type === "group";
}
