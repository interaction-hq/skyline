// The unified cross-platform contract. Every platform an app talks to — iMessage,
// WhatsApp — is normalized to the same `Channel` + `Message` shape, so a developer
// writes once and reaches anyone. A `Channel` is one open conversation you act on
// (`send`, `react`, `typing`, …); `app.incoming` is the merged inbound feed; the
// non-message signals (reactions, typing, read receipts, …) arrive via `app.on`.

import type {
  AttachmentSend,
  AvatarInput,
  Content,
  ContentInput,
  MemberInput,
  Reaction,
  SendOptions,
} from "./content/index.js";

export type Platform =
  | "imessage"
  | "slack"
  | "whatsapp"
  | "whatsapp_business"
  | "terminal";

export type ContentType = "text" | "app" | "flow";

export interface TextContent {
  text: string;
  type: "text";
}

/**
 * An inbound app bubble: the recipient tapped "Send to chat" in an app and the
 * state they produced rode back in the bubble. `appId` names the app; `data` is
 * the state the app staged (the bridge's `sendMessage({ data })`, minus transport
 * keys). `caption`/`summary` are the human-readable bubble text.
 */
export interface AppContent {
  appId?: string;
  caption?: string;
  data: Record<string, string>;
  summary?: string;
  type: "app";
}

/**
 * A confirmed payment from a `payment` component. `paid` is true once the user
 * confirmed the request; `provider`/`amount`/`currency` echo what they approved.
 * On Apple Cash the actual transfer completes in the system sheet — this records
 * the in-flow intent so the agent can advance (e.g. mark an order paid).
 */
export interface PaymentReceipt {
  amount: string;
  currency: string;
  paid: boolean;
  provider: string;
}

/**
 * An inbound flow submission — one step of a declarative flow the recipient
 * completed. `state` is every input value they entered (keyed by each input's
 * `key`). `screen` (when set) means the flow continues and the agent should send
 * the next screen; `done` means it finished. The server-driven loop: read
 * `state`, decide, `channel.send(flow(...))` the next screen.
 */
export interface FlowContent {
  appId?: string;
  done: boolean;
  /** Present when the flow included a confirmed `payment` step. */
  payment?: PaymentReceipt;
  screen?: string;
  state: Record<string, string>;
  type: "flow";
}

export type MessageContent = Content | AppContent | FlowContent;

export interface User {
  /** Display name when the platform exposes one. */
  displayName?: string;
  /** Platform handle — phone number or email. */
  id: string;
}

/**
 * Group attribution for an inbound message. Present when the conversation has
 * more than one other participant. `chatId` is the stable group identifier and
 * `participant` is the resolved sender within it — this is how an app knows
 * who in a group submitted a flow or tapped a card.
 */
export interface GroupContext {
  chatId: string;
  isGroup: boolean;
  participant: User;
  /** Every known participant handle in the group, when the platform reports it. */
  participants?: User[];
}

/** Slack-specific fields surfaced on inbound `message.platform === "slack"`. */
export interface SlackMessageMeta {
  subtype?: string;
  teamId: string;
  threadTs?: string;
  ts?: string;
}

export interface MessageAttachment {
  guid: string;
  mimeType?: string;
  name?: string;
  size?: number;
  transferName?: string;
  /** Download the attachment bytes (issues a fresh fetch each call). */
  read(): Promise<Uint8Array>;
  /** Stream the attachment bytes (issues a fresh fetch each call). */
  stream(): Promise<ReadableStream<Uint8Array>>;
}

export interface Message {
  attachments?: MessageAttachment[];
  /** The open conversation this message belongs to. */
  channel: Channel;
  content: MessageContent;
  direction: "inbound" | "outbound";
  /** Set for group conversations; identifies the group and the submitting member. */
  group?: GroupContext;
  /** The message's own guid, when the platform assigns one (iMessage does). */
  guid?: string;
  /** Platforms echo your own sends; guard replies on this. */
  isFromMe: boolean;
  /** Rewrite this outbound message's content. */
  edit(content: ContentInput): Promise<void>;
  platform: Platform;
  /** Tapback or emoji-react to this message. */
  react(reaction: Reaction, opts?: { remove?: boolean }): Promise<void>;
  /** Mark the conversation read up to this inbound message. */
  read(): Promise<void>;
  replyTo?: { messageGuid: string; partIndex?: number };
  /** Reply in-thread to this message. */
  reply(content: ContentInput, opts?: SendOptions): Promise<SendReceipt>;
  sender: User;
  /** Delivery service when known — "iMessage", "SMS", etc. */
  service?: string;
  slack?: SlackMessageMeta;
  timestamp: Date;
  /** Retract this outbound message. */
  unsend(): Promise<void>;
}

/**
 * A non-message signal on a channel — a reaction, typing indicator, read
 * receipt, edit, unsend, or send error. These ride the same live connection as
 * `Message`s but are delivered through `app.on(event, …)` rather than the
 * `app.incoming` message feed, so an app can opt into the richness it wants.
 */
export interface ReactionSignal {
  group?: GroupContext;
  /** The message the reaction targets. */
  messageGuid: string;
  platform: Platform;
  /** The reaction applied (love/like/laugh/emphasize/question/dislike, or an emoji). */
  reaction: string;
  /** True when the reaction was removed rather than added. */
  removed: boolean;
  sender: User;
  timestamp: Date;
}

export interface TypingSignal {
  group?: GroupContext;
  platform: Platform;
  sender: User;
  timestamp: Date;
  /** True when they started typing, false when they stopped. */
  typing: boolean;
}

export interface ReadSignal {
  group?: GroupContext;
  platform: Platform;
  /** The handle whose read state changed. */
  sender: User;
  timestamp: Date;
}

export interface EditSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  sender: User;
  /** The new text after the edit. */
  text: string;
  timestamp: Date;
}

export interface UnsendSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  sender: User;
  timestamp: Date;
}

export interface SendErrorSignal {
  code?: string;
  message?: string;
  platform: Platform;
  timestamp: Date;
  /** The channel the failed send targeted. */
  to: string;
}

export interface GroupChangeSignal {
  backgroundChanged?: boolean;
  backgroundRemoved?: boolean;
  chatId: string;
  iconChanged?: boolean;
  iconRemoved?: boolean;
  participantAdded?: string;
  participantRemoved?: string;
  platform: Platform;
  renamedTo?: string;
  timestamp: Date;
}

export interface PollChangeSignal {
  action: string;
  chatId: string;
  platform: Platform;
  pollMessageGuid: string;
  timestamp: Date;
}

/** The event name → payload map for `app.on(...)`. */
export interface SignalMap {
  edited: EditSignal;
  error: SendErrorSignal;
  group: GroupChangeSignal;
  poll: PollChangeSignal;
  reaction: ReactionSignal;
  read: ReadSignal;
  typing: TypingSignal;
  unsent: UnsendSignal;
}

export type SignalName = keyof SignalMap;

/** A confirmed send: the platform guid (when assigned) plus the send time. */
export interface SendReceipt {
  guid?: string;
  sentAt: Date;
}

export type VisualAssetInput =
  | { data?: Uint8Array; mimeType?: string; path?: string }
  | "clear";

/**
 * A `Channel` is one open conversation, addressed by a single handle (`to`).
 * Common actions are flat (`send`, `react`, `reply`, `edit`, `unsend`, `typing`,
 * `read`); richer, less-common surfaces are namespaced (`attachments`, `group`).
 * Actions talk to the provider data plane for that line — no extra control-plane hop.
 */
export interface Channel {
  /** Add participants — sugar for `send(addMember(...))`. */
  add(users: MemberInput): Promise<void>;

  /** Set or clear the conversation avatar — sugar for `send(avatar(...))`. */
  avatar(input: AvatarInput, options?: { mimeType?: string }): Promise<void>;

  /** Set or clear the conversation background (group or chat wallpaper). */
  background(input: VisualAssetInput): Promise<void>;

  /** The other party's contact card, when the line can resolve it. */
  contact(): Promise<Contact | null>;

  /** Edit a message you sent (by guid). Prefer `message.edit(...)`. */
  edit(messageGuid: string, newText: string): Promise<void>;

  /** Group operations (only meaningful once the conversation is a group). */
  readonly group: GroupOps;

  /** Focus / Do Not Disturb state for the other party, when the line reports it. */
  focusStatus(): Promise<FocusStatus | null>;

  /** Fetch attachment bytes by guid when the line supports downloads. */
  getAttachment(attachmentGuid: string): Promise<MessageAttachment | null>;

  /** Read the conversation display name (group title), when set. */
  getDisplayName(): Promise<string | null>;

  /** Fetch a message by guid when the line supports history lookup. */
  getMessage(messageGuid: string): Promise<Message | null>;

  /** Leave this group — sugar for `send(leaveChannel())`. */
  leave(): Promise<void>;

  /** List recent messages in this conversation. */
  listMessages(opts?: ListMessagesOptions): Promise<Message[]>;

  /** @deprecated use `to`. Kept as an alias so older callers keep working. */
  readonly phone: string;
  /** Poll helpers (iMessage and platforms that support interactive polls). */
  readonly poll: PollOps;
  /** The platform this channel speaks. */
  readonly platform: Platform;

  /** Is this handle reachable on iMessage? (SMS fallback otherwise.) */
  reachable(): Promise<boolean>;

  /** Tapback or emoji-react to a message. Pass `{ remove: true }` to undo. */
  react(
    messageGuid: string,
    reaction: Reaction,
    opts?: { remove?: boolean }
  ): Promise<void>;

  /** Mark the conversation read (clears your unread badge on their device). */
  read(): Promise<void>;

  /** Send a read receipt for the conversation. */
  readReceipt(): Promise<void>;

  /** Remove participants — sugar for `send(removeMember(...))`. */
  remove(users: MemberInput): Promise<void>;

  /** Rename the conversation — sugar for `send(rename(...))`. */
  rename(displayName: string): Promise<void>;

  /**
   * Reply to a specific message (threads off it). Sugar for
   * `send(content, { replyTo: messageGuid })`.
   */
  reply(
    messageGuid: string,
    content: ContentInput,
    opts?: SendOptions
  ): Promise<SendReceipt>;

  /**
   * Run `fn` while showing a typing indicator. Clears typing when `fn`
   * settles (success or throw).
   */
  responding<T>(fn: () => T | Promise<T>): Promise<T>;

  /**
   * Send content: a string, a content value, or a `ContentBuilder`
   * (`text(...)`, `rename(...)`, `reply(...)`, …).
   */
  send(content: ContentInput, opts?: SendOptions): Promise<SendReceipt>;

  /** Send an attachment (image/audio/file). */
  sendFile(file: AttachmentSend, opts?: SendOptions): Promise<SendReceipt>;

  /** Send multiple attachments as an album or multipart message. */
  sendFiles(files: AttachmentSend[], opts?: SendOptions): Promise<SendReceipt>;

  /** Share your contact card in this conversation. */
  shareContactCard(): Promise<void>;

  /**
   * Share the line's current location (or live location when `durationSeconds`
   * is set). Arbitrary coordinates are not supported on iMessage.
   */
  shareLocation(opts?: { durationSeconds?: number }): Promise<void>;

  /** Stop an in-progress live location share. */
  stopLocation(): Promise<void>;

  /** The handle (phone/email) this conversation routes through. */
  readonly to: string;

  /** Show or clear the typing indicator. */
  typing(on?: boolean): Promise<void>;

  /** Unsend (retract) a message you sent. */
  unsend(messageGuid: string): Promise<void>;
}

/** Options for `channel.listMessages`. */
export interface ListMessagesOptions {
  after?: Date;
  before?: Date;
  limit?: number;
  searchText?: string;
}

/** Focus / availability extras for a handle. */
export interface FocusStatus {
  silenced: boolean;
}

/** A resolved contact card for a handle. */
export interface Contact {
  address?: string;
  emails: string[];
  firstName?: string;
  fullName?: string;
  isContact: boolean;
  lastName?: string;
  organization?: string;
  phones: string[];
}

/** Group-management operations on a channel. */
export interface GroupOps {
  /** Add a participant by handle. */
  add(handle: string): Promise<void>;

  /** Fetch the group icon bytes, or null when unset. */
  getIcon(): Promise<Uint8Array | null>;

  /** Read the group display name, or null when unset. */
  getName(): Promise<string | null>;

  /** Leave the group conversation. */
  leave(): Promise<void>;

  /** List current participants. */
  participants(): Promise<User[]>;

  /** Remove a participant by handle. */
  remove(handle: string): Promise<void>;

  /** Set or clear the group background image. */
  setBackground(input: VisualAssetInput): Promise<void>;

  /** Set or clear the group icon. */
  setIcon(input: VisualAssetInput): Promise<void>;

  /** Rename the group. */
  setName(name: string): Promise<void>;
}

/** Interactive poll helpers on a channel. */
export interface PollOps {
  /** Add an option to an existing poll. */
  addOption(pollMessageGuid: string, optionText: string): Promise<void>;

  /** Fetch poll state by the poll's message guid. */
  get(pollMessageGuid: string): Promise<PollInfo | null>;

  /** Remove the agent's vote from a poll. */
  unvote(pollMessageGuid: string): Promise<void>;

  /** Cast a vote for an option identifier. */
  vote(pollMessageGuid: string, optionIdentifier: string): Promise<void>;
}

export interface PollInfo {
  chatId: string;
  options: { creatorHandle?: string; id?: string; text: string }[];
  pollMessageGuid: string;
  title: string;
  votes: { optionId: string; participant?: string }[];
}

export interface SkylineApp {
  /**
   * Open a conversation. Pass a handle directly (`app.channel("+1555…")`) or an
   * object (`app.channel({ to: "name@example.com", platform: "imessage" })`).
   */
  channel(target: string | ChannelTarget): Channel;

  close(): Promise<void>;

  /**
   * Create a new chat (DM or group) from participant handles and return its
   * channel. Requires a ready line that supports chat creation.
   */
  createChat(
    participants: string[],
    opts?: { platform?: Platform }
  ): Promise<Channel>;

  /** Mint a shareable FaceTime link (optional pre-invite handles). */
  createFaceTimeLink(
    opts?: { handles?: string[]; platform?: Platform }
  ): Promise<{ url: string }>;

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
  /** @deprecated use `channel(...)`. Alias kept for older callers. */
  space(handle: string): Channel;
}

/** How to address a channel: a bare handle or an explicit target. */
export interface ChannelTarget {
  /** Which platform/line to route through. Defaults to the first ready line. */
  platform?: Platform;
  /** Slack workspace team id — required when multiple workspaces are configured. */
  teamId?: string;
  to: string;
}

/** A resolved data-plane line: where to connect + which handle it serves. */
export interface ResolvedLine {
  address: string;
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
  phone: string;
  slack?: {
    /** Runtime JWT for the hosted Slack gateway. */
    accessToken?: string;
    appToken?: string;
    /** Bot token for direct Slack Web API (bring-your-own credentials). */
    botToken?: string;
    endpoint?: string;
    signingSecret?: string;
    team?: {
      appId: string;
      botUserId: string;
      grantedScopes: string[];
      teamName: string;
    };
    teamId?: string;
  };
  token: string;
}

/** @deprecated transitional alias — `Space` is now `Channel`. */
export type Space = Channel;

export type ProviderConfig = {
  platform: Platform;
  mode?: "cloud" | "dedicated" | "local";
  [key: string]: unknown;
};
