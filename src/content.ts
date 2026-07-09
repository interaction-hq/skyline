// Skyline outbound content builders.
//
// `channel.send()` accepts either a plain string (a text message) or a content
// object produced by one of these builders. This is the backend-send surface:
// compose a rich bubble from a server, an agent, or an automation — no human in
// the Messages UI. Mirrors the launcher-side send, so a card looks the same
// however it originates.

import type { Flow, PaymentProvider } from "./miniapp/experience";

export type { Flow };

/** A plain text message. `channel.send("hi")` is sugar for `text("hi")`. */
export interface TextMessage {
  type: "text";
  text: string;
}

/**
 * A server-composed app card. Tapping it opens the app at `url` — in the
 * Interactions shell for hosted apps, or the client's own extension when
 * `teamId` + `bundleId` name a dedicated app the recipient has installed.
 */
export interface AppMessage {
  type: "app";
  /** Registry id (hosted apps); round-trips to the opened app. */
  appId?: string;
  /** HTTPS deep link the card opens to. Required. */
  url: string;
  caption?: string;
  subcaption?: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
  imageTitle?: string;
  imageSubtitle?: string;
  image?: string;
  /** Notification / lock-screen fallback text. Defaults to the caption. */
  summary?: string;
  /** App data round-tripped in the card URL to the opened app. */
  data?: Record<string, string>;
  /** Dedicated mode: the client's own extension identity. */
  teamId?: string;
  bundleId?: string;
  /** App Store id → "Get the app" affordance for recipients without it. */
  appStoreId?: number;
  /** When false, always show the static card (never open the live view). */
  interactive?: boolean;
  effect?: string;
}

/**
 * A server-composed flow card (the declarative screen-graph runtime). Tapping it
 * opens the shell's interpreter, which renders an inline `flow` or resumes a
 * registered one by `appId`. The agent path: compose a screen at runtime, send
 * it, and drive the flow server-side by reading each submission and sending the
 * next screen.
 */
export interface FlowMessage {
  type: "flow";
  /** Registry id of a hosted flow (optional when `flow` is inline). */
  appId?: string;
  /** An inline screen graph the shell interprets directly — no registry entry. */
  flow?: Flow;
  /** Seed state (key -> value) the opened flow resumes from. */
  data?: Record<string, string>;
  /** Which screen to open on (defaults to the flow's start). */
  screen?: string;
  /**
   * Shared live-session id. Every participant opened with the same id sees a
   * merged, live-updating view (a group music queue, a live-updating deck).
   */
  session?: string;
  caption?: string;
  subcaption?: string;
  image?: string;
  summary?: string;
  teamId?: string;
  bundleId?: string;
  appStoreId?: number;
}

/**
 * A WhatsApp Business rich message. These map to the Meta Cloud API message
 * types that have no iMessage analogue (media by id/link, approved templates,
 * interactive button/list/product menus, location pins, contact cards). They
 * are only meaningful on a `whatsapp_business` channel; sending one on another
 * platform raises a clear "not supported" error.
 */
export interface WaMediaContent {
  type: "wa_media";
  kind: "image" | "video" | "audio" | "document" | "sticker";
  /** Uploaded media object id (Media Upload API). Provide this or `link`. */
  id?: string;
  /** Public https URL Meta fetches the media from. */
  link?: string;
  caption?: string;
  /** Document display filename. */
  filename?: string;
}

export interface WaTemplateContent {
  type: "wa_template";
  /** Approved template name. */
  name: string;
  /** BCP-47 language code, e.g. "en_US". */
  language: string;
  /** Template components (header/body/button parameters) when the template has variables. */
  components?: Record<string, unknown>[];
}

export interface WaInteractiveContent {
  type: "wa_interactive";
  /** A fully-formed Cloud API `interactive` object (button/list/product/flow/…). */
  interactive: Record<string, unknown>;
}

export interface WaLocationContent {
  type: "wa_location";
  latitude: number | string;
  longitude: number | string;
  name?: string;
  address?: string;
}

export interface WaContactsContent {
  type: "wa_contacts";
  /** One or more Cloud API contact objects. */
  contacts: Record<string, unknown>[];
}

export type WaContent =
  | WaMediaContent
  | WaTemplateContent
  | WaInteractiveContent
  | WaLocationContent
  | WaContactsContent;

/** Everything `channel.send()` accepts (besides a bare string). */
export type Content = TextMessage | AppMessage | FlowMessage | WaContent;

/** Tapback reactions every platform understands, plus free-form emoji. */
export type Tapback =
  | "love"
  | "like"
  | "laugh"
  | "emphasize"
  | "question"
  | "dislike";

/** A reaction is a named tapback or any emoji string. */
export type Reaction = Tapback | (string & {});

/** Named screen/bubble effects an iMessage send can carry. */
export const EFFECTS = {
  slam: "com.apple.MobileSMS.expressivesend.impact",
  loud: "com.apple.MobileSMS.expressivesend.loud",
  gentle: "com.apple.MobileSMS.expressivesend.gentle",
  invisible: "com.apple.MobileSMS.expressivesend.invisibleink",
  confetti: "com.apple.messages.effect.CKConfettiEffect",
  fireworks: "com.apple.messages.effect.CKFireworksEffect",
  balloons: "com.apple.messages.effect.CKHappyBirthdayEffect",
  lasers: "com.apple.messages.effect.CKLasersEffect",
  love: "com.apple.messages.effect.CKHeartEffect",
  spotlight: "com.apple.messages.effect.CKSpotlightEffect",
  echo: "com.apple.messages.effect.CKEchoEffect",
} as const;

/** A named effect (resolved to its identifier) or a raw effect id. */
export type Effect = keyof typeof EFFECTS | (string & {});

/** Resolve a named effect to its wire identifier (passes raw ids through). */
export function resolveEffect(effect: Effect | undefined): string | undefined {
  if (!effect) {
    return undefined;
  }
  return (EFFECTS as Record<string, string>)[effect] ?? effect;
}

/** Per-send options that apply on top of any content type. */
export interface SendOptions {
  /** Thread this send as a reply to an existing message (its guid). */
  replyTo?: string;
  /** A named effect ("confetti", "slam", …) or a raw effect id. */
  effect?: Effect;
  /** iMessage subject line (bolded lead-in above the body). */
  subject?: string;
  /** Render URLs in the body as rich link previews. Default true. */
  richLink?: boolean;
  /** Run data-detector scanning (links/dates/addresses). Default true. */
  scan?: boolean;
}

/** An attachment to send: raw bytes or a local file path the line can read. */
export interface AttachmentSend {
  /** File bytes. Provide this or `path`. */
  data?: Uint8Array | ArrayBuffer;
  /** A path the sending line can read (dedicated/self-host). */
  path?: string;
  /** File name shown to the recipient (e.g. "receipt.pdf"). */
  name?: string;
  /** Send as a voice memo (audio message) rather than a file. */
  audio?: boolean;
  /** Send as a sticker. */
  sticker?: boolean;
}

/** Build a text message. */
export function text(body: string): TextMessage {
  return { type: "text", text: body };
}

/**
 * Build an app card for backend-send. At minimum pass a `url`; add caption slots,
 * artwork, and `data` for a richer bubble.
 *
 * ```ts
 * await channel.send(app({
 *   appId: "lunch-poll",
 *   url: "https://apps.interactions.co.in/lunch-poll?session=abc",
 *   caption: "lunch friday?",
 *   subcaption: "tap to vote",
 *   image: "https://apps…/card.png",
 *   data: { session: "abc" },
 * }));
 * ```
 */
export function app(input: Omit<AppMessage, "type">): AppMessage {
  if (!input.url.startsWith("https://")) {
    throw new Error("app: url must be https");
  }
  return { type: "app", interactive: input.interactive ?? true, ...input };
}

/**
 * Build a flow card for backend-send. Pass an inline `flow` (an agent composing a
 * screen on the fly) or reference a registered one by `appId`.
 *
 * ```ts
 * await channel.send(flow({
 *   caption: "quick question",
 *   flow: {
 *     screens: [{
 *       id: "q", title: "Pick a time",
 *       components: [
 *         { type: "options", key: "time", options: [
 *           { id: "am", label: "Morning" }, { id: "pm", label: "Afternoon" },
 *         ], onSelect: "submit" },
 *       ],
 *     }],
 *   },
 * }));
 * ```
 *
 * On each submission the SDK surfaces the collected state inbound; the agent
 * reads it and sends the next screen — a server-driven, Apple-compliant flow.
 */
export function flow(input: Omit<FlowMessage, "type">): FlowMessage {
  if (!input.appId && !input.flow) {
    throw new Error("flow: pass an inline `flow` or a registered `appId`");
  }
  if (input.flow && !input.flow.screens?.length) {
    throw new Error("flow: inline flow needs at least one screen");
  }
  return { type: "flow", ...input };
}

/** A payment request: amount plus optional note, payee, and provider. */
export interface PaymentRequest {
  provider?: PaymentProvider;
  amount: string;
  currency?: string;
  note?: string;
  payeeLabel?: string;
  /** Hosted-checkout URL for `link` providers. */
  url?: string;
  caption?: string;
}

/**
 * Build a payment request card as a one-screen flow. Defaults to Apple Cash.
 *
 * ```ts
 * await channel.send(payment({
 *   amount: "166.89", currency: "USD",
 *   note: "Dinner at Nobu", payeeLabel: "Interactions",
 * }));
 * ```
 *
 * On confirm the flow submits inbound with a `payment` receipt the agent reads
 * to advance the order.
 */
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
          id: "pay",
          components: [
            {
              type: "payment",
              provider,
              amount: input.amount,
              currency: input.currency,
              note: input.note,
              payeeLabel: input.payeeLabel,
              url: input.url,
            },
          ],
        },
      ],
    },
  });
}

/**
 * WhatsApp Business content builders. These compose the Meta Cloud API message
 * types with no iMessage analogue. Send them on a `whatsapp_business` channel:
 *
 * ```ts
 * await channel.send(waImage({ link: "https://…/receipt.png", caption: "Your receipt" }));
 * await channel.send(waTemplate({ name: "order_confirmation", language: "en_US" }));
 * ```
 */
export const wa = {
  /** An image message (by uploaded id or public https link). */
  image(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { type: "wa_media", kind: "image", ...input };
  },
  /** A video message. */
  video(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { type: "wa_media", kind: "video", ...input };
  },
  /** A voice/audio message. */
  audio(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { type: "wa_media", kind: "audio", ...input };
  },
  /** A document (PDF, etc.), with an optional display `filename`. */
  document(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { type: "wa_media", kind: "document", ...input };
  },
  /** A sticker message. */
  sticker(input: Omit<WaMediaContent, "type" | "kind">): WaMediaContent {
    return { type: "wa_media", kind: "sticker", ...input };
  },
  /** An approved template message (required to open a conversation cold). */
  template(input: Omit<WaTemplateContent, "type">): WaTemplateContent {
    return { type: "wa_template", ...input };
  },
  /** An interactive message — pass the Cloud API `interactive` object. */
  interactive(interactive: Record<string, unknown>): WaInteractiveContent {
    return { type: "wa_interactive", interactive };
  },
  /** A location pin. */
  location(input: Omit<WaLocationContent, "type">): WaLocationContent {
    return { type: "wa_location", ...input };
  },
  /** One or more contact cards. */
  contacts(contacts: Record<string, unknown>[]): WaContactsContent {
    return { type: "wa_contacts", contacts };
  },
};

/** True when a content object is a WhatsApp Business rich type. */
export function isWaContent(content: Content): content is WaContent {
  return (
    content.type === "wa_media" ||
    content.type === "wa_template" ||
    content.type === "wa_interactive" ||
    content.type === "wa_location" ||
    content.type === "wa_contacts"
  );
}

/** Normalize the `send()` argument to a `Content`. */
export function toContent(input: string | Content): Content {
  return typeof input === "string" ? text(input) : input;
}
