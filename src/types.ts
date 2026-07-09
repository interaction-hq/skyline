// The unified cross-platform contract. Every platform an app talks to — iMessage,
// WhatsApp — is normalized to the same `Channel` + `Message` shape, so a developer
// writes once and reaches anyone. A `Channel` is one open conversation you act on
// (`send`, `react`, `typing`, …); `app.incoming` is the merged inbound feed; the
// non-message signals (reactions, typing, read receipts, …) arrive via `app.on`.

import type {
  AttachmentSend,
  Content,
  Reaction,
  SendOptions,
} from "./content";

export type Platform =
  | "imessage"
  | "whatsapp"
  | "whatsapp_business"
  | "terminal";

export type ContentType = "text" | "app" | "flow";

export interface TextContent {
  type: "text";
  text: string;
}

/**
 * An inbound app bubble: the recipient tapped "Send to chat" in an app and the
 * state they produced rode back in the bubble. `appId` names the app; `data` is
 * the state the app staged (the bridge's `sendMessage({ data })`, minus transport
 * keys). `caption`/`summary` are the human-readable bubble text.
 */
export interface AppContent {
  type: "app";
  appId?: string;
  caption?: string;
  summary?: string;
  data: Record<string, string>;
}

/**
 * A confirmed payment from a `payment` component. `paid` is true once the user
 * confirmed the request; `provider`/`amount`/`currency` echo what they approved.
 * On Apple Cash the actual transfer completes in the system sheet — this records
 * the in-flow intent so the agent can advance (e.g. mark an order paid).
 */
export interface PaymentReceipt {
  paid: boolean;
  provider: string;
  amount: string;
  currency: string;
}

/**
 * An inbound flow submission — one step of a declarative flow the recipient
 * completed. `state` is every input value they entered (keyed by each input's
 * `key`). `screen` (when set) means the flow continues and the agent should send
 * the next screen; `done` means it finished. The server-driven loop: read
 * `state`, decide, `channel.send(flow(...))` the next screen.
 */
export interface FlowContent {
  type: "flow";
  appId?: string;
  state: Record<string, string>;
  screen?: string;
  done: boolean;
  /** Present when the flow included a confirmed `payment` step. */
  payment?: PaymentReceipt;
}

export type MessageContent = TextContent | AppContent | FlowContent;

export interface User {
  /** Platform handle — phone number or email. */
  id: string;
  /** Display name when the platform exposes one. */
  displayName?: string;
}

/**
 * Group attribution for an inbound message. Present when the conversation has
 * more than one other participant. `chatId` is the stable group identifier and
 * `participant` is the resolved sender within it — this is how an app knows
 * *who* in a group submitted a flow or tapped a card.
 */
export interface GroupContext {
  chatId: string;
  isGroup: boolean;
  participant: User;
  /** Every known participant handle in the group, when the platform reports it. */
  participants?: User[];
}

export interface Message {
  platform: Platform;
  content: MessageContent;
  sender: User;
  timestamp: Date;
  /** The message's own guid, when the platform assigns one (iMessage does). */
  guid?: string;
  /** Platforms echo your own sends; guard replies on this. */
  isFromMe: boolean;
  /** Set for group conversations; identifies the group and the submitting member. */
  group?: GroupContext;
}

/**
 * A non-message signal on a channel — a reaction, typing indicator, read
 * receipt, edit, unsend, or send error. These ride the same live connection as
 * `Message`s but are delivered through `app.on(event, …)` rather than the
 * `app.incoming` message feed, so an app can opt into the richness it wants.
 */
export interface ReactionSignal {
  platform: Platform;
  /** The message the reaction targets. */
  messageGuid: string;
  /** The reaction applied (love/like/laugh/emphasize/question/dislike, or an emoji). */
  reaction: string;
  /** True when the reaction was removed rather than added. */
  removed: boolean;
  sender: User;
  timestamp: Date;
  group?: GroupContext;
}

export interface TypingSignal {
  platform: Platform;
  /** True when they started typing, false when they stopped. */
  typing: boolean;
  sender: User;
  timestamp: Date;
  group?: GroupContext;
}

export interface ReadSignal {
  platform: Platform;
  /** The handle whose read state changed. */
  sender: User;
  timestamp: Date;
  group?: GroupContext;
}

export interface EditSignal {
  platform: Platform;
  messageGuid: string;
  /** The new text after the edit. */
  text: string;
  sender: User;
  timestamp: Date;
  group?: GroupContext;
}

export interface UnsendSignal {
  platform: Platform;
  messageGuid: string;
  sender: User;
  timestamp: Date;
  group?: GroupContext;
}

export interface SendErrorSignal {
  platform: Platform;
  /** The channel the failed send targeted. */
  to: string;
  code?: string;
  message?: string;
  timestamp: Date;
}

/** The event name → payload map for `app.on(...)`. */
export interface SignalMap {
  reaction: ReactionSignal;
  typing: TypingSignal;
  read: ReadSignal;
  edited: EditSignal;
  unsent: UnsendSignal;
  error: SendErrorSignal;
}

export type SignalName = keyof SignalMap;

/** A confirmed send: the platform guid (when assigned) plus the send time. */
export interface SendReceipt {
  guid?: string;
  sentAt: Date;
}

/**
 * A `Channel` is one open conversation, addressed by a single handle (`to`).
 * Common actions are flat (`send`, `react`, `reply`, `edit`, `unsend`, `typing`,
 * `read`); richer, less-common surfaces are namespaced (`attachments`, `group`).
 * Everything runs over the same fast per-line transport — no gateway hop.
 */
export interface Channel {
  /** The handle (phone/email) this conversation routes through. */
  readonly to: string;
  /** @deprecated use `to`. Kept as an alias so older callers keep working. */
  readonly phone: string;
  /** The platform this channel speaks. */
  readonly platform: Platform;

  /**
   * Send a message: a plain string (text) or a content object from a builder
   * (`app(...)`, `flow(...)`, `payment(...)`). `opts` add reply threading,
   * screen effects, a subject line, and rich-link rendering.
   */
  send(content: string | Content, opts?: SendOptions): Promise<SendReceipt>;

  /**
   * Reply to a specific message (threads off it). Sugar for
   * `send(content, { replyTo: messageGuid })`.
   */
  reply(
    messageGuid: string,
    content: string | Content,
    opts?: SendOptions
  ): Promise<SendReceipt>;

  /** Tapback or emoji-react to a message. Pass `{ remove: true }` to undo. */
  react(
    messageGuid: string,
    reaction: Reaction,
    opts?: { remove?: boolean }
  ): Promise<void>;

  /** Edit a message you sent. */
  edit(messageGuid: string, newText: string): Promise<void>;

  /** Unsend (retract) a message you sent. */
  unsend(messageGuid: string): Promise<void>;

  /** Show or clear the typing indicator. */
  typing(on?: boolean): Promise<void>;

  /** Mark the conversation read (clears your unread badge on their device). */
  read(): Promise<void>;

  /** Send a read receipt for the conversation. */
  readReceipt(): Promise<void>;

  /** Send an attachment (image/audio/file). */
  sendFile(file: AttachmentSend, opts?: SendOptions): Promise<SendReceipt>;

  /** Is this handle reachable on iMessage? (SMS fallback otherwise.) */
  reachable(): Promise<boolean>;

  /** The other party's contact card, when the line can resolve it. */
  contact(): Promise<Contact | null>;

  /** Group operations (only meaningful once the conversation is a group). */
  readonly group: GroupOps;
}

/** A resolved contact card for a handle. */
export interface Contact {
  address?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  organization?: string;
  emails: string[];
  phones: string[];
  isContact: boolean;
}

/** Group-management operations on a channel. */
export interface GroupOps {
  /** Rename the group. */
  setName(name: string): Promise<void>;
  /** Add a participant by handle. */
  add(handle: string): Promise<void>;
  /** Remove a participant by handle. */
  remove(handle: string): Promise<void>;
  /** List current participants. */
  participants(): Promise<User[]>;
}

export interface SkylineApp {
  /**
   * Open a conversation. Pass a handle directly (`app.channel("+1555…")`) or an
   * object (`app.channel({ to: "name@example.com", platform: "imessage" })`).
   */
  channel(target: string | ChannelTarget): Channel;
  /** @deprecated use `channel(...)`. Alias kept for older callers. */
  space(handle: string): Channel;

  /** Merged inbound message feed across every provider/line. */
  incoming: AsyncIterable<[Channel, Message]>;
  /** @deprecated use `incoming`. Alias kept for older callers. */
  messages: AsyncIterable<[Channel, Message]>;

  /** Subscribe to a non-message signal (reactions, typing, read, edits, …). */
  on<K extends SignalName>(
    event: K,
    handler: (signal: SignalMap[K], channel: Channel) => void
  ): () => void;

  /** Handles (phones) whose channel connected successfully. */
  ready: Set<string>;
  /** @deprecated use `ready`. */
  readyPhones: Set<string>;

  close(): Promise<void>;
}

/** How to address a channel: a bare handle or an explicit target. */
export interface ChannelTarget {
  to: string;
  /** Which platform/line to route through. Defaults to the first ready line. */
  platform?: Platform;
}

/** A resolved data-plane line: where to connect + which handle it serves. */
export interface ResolvedLine {
  address: string;
  token: string;
  phone: string;
  /**
   * WhatsApp Business is a cloud line (Meta Graph API), not a gRPC endpoint.
   * When present, these carry the send credentials the SDK uses to POST to
   * `graph.facebook.com` directly. `phone` holds the display number.
   */
  business?: {
    phoneNumberId: string;
    accessToken: string;
    apiVersion?: string;
  };
}

/** @deprecated transitional alias — `Space` is now `Channel`. */
export type Space = Channel;
