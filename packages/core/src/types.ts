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

export interface AppContent {
  appId?: string;
  caption?: string;
  data: Record<string, string>;
  summary?: string;
  type: "app";
}

export interface PaymentReceipt {
  amount: string;
  currency: string;
  paid: boolean;
  provider: string;
}

export interface FlowContent {
  appId?: string;
  done: boolean;
  payment?: PaymentReceipt;
  screen?: string;
  state: Record<string, string>;
  type: "flow";
}

export type MessageContent = Content | AppContent | FlowContent;

export interface User {
  displayName?: string;
  id: string;
}

export interface GroupContext {
  chatId: string;
  isGroup: boolean;
  participant: User;
  participants?: User[];
}

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
  read(): Promise<Uint8Array>;
  size?: number;
  stream(): Promise<ReadableStream<Uint8Array>>;
  transferName?: string;
}

export interface Message {
  attachments?: MessageAttachment[];
  channel: Channel;
  content: MessageContent;
  direction: "inbound" | "outbound";
  edit(content: ContentInput): Promise<void>;
  group?: GroupContext;
  guid?: string;
  isFromMe: boolean;
  platform: Platform;
  react(reaction: Reaction, opts?: { remove?: boolean }): Promise<void>;
  read(): Promise<void>;
  reply(content: ContentInput, opts?: SendOptions): Promise<SendReceipt>;
  replyTo?: { messageGuid: string; partIndex?: number };
  sender: User;
  service?: string;
  slack?: SlackMessageMeta;
  timestamp: Date;
  unsend(): Promise<void>;
}

export interface ReactionSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  reaction: string;
  removed: boolean;
  sender: User;
  timestamp: Date;
}

export interface TypingSignal {
  group?: GroupContext;
  platform: Platform;
  sender: User;
  timestamp: Date;
  typing: boolean;
}

export interface ReadSignal {
  group?: GroupContext;
  platform: Platform;
  sender: User;
  timestamp: Date;
}

export interface EditSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  sender: User;
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

export interface SendReceipt {
  guid?: string;
  sentAt: Date;
}

export type VisualAssetInput =
  | { data?: Uint8Array; mimeType?: string; path?: string }
  | "clear";

export interface Channel {
  add(users: MemberInput): Promise<void>;
  avatar(input: AvatarInput, options?: { mimeType?: string }): Promise<void>;
  background(input: VisualAssetInput): Promise<void>;
  contact(): Promise<Contact | null>;
  edit(messageGuid: string, newText: string): Promise<void>;
  focusStatus(): Promise<FocusStatus | null>;
  getAttachment(attachmentGuid: string): Promise<MessageAttachment | null>;
  getDisplayName(): Promise<string | null>;
  getMessage(messageGuid: string): Promise<Message | null>;
  readonly group: GroupOps;
  leave(): Promise<void>;
  listMessages(opts?: ListMessagesOptions): Promise<Message[]>;
  /** @deprecated use `to` */
  readonly phone: string;
  readonly platform: Platform;
  readonly poll: PollOps;
  reachable(): Promise<boolean>;
  react(
    messageGuid: string,
    reaction: Reaction,
    opts?: { remove?: boolean }
  ): Promise<void>;
  read(): Promise<void>;
  readReceipt(): Promise<void>;
  remove(users: MemberInput): Promise<void>;
  rename(displayName: string): Promise<void>;
  reply(
    messageGuid: string,
    content: ContentInput,
    opts?: SendOptions
  ): Promise<SendReceipt>;
  responding<T>(fn: () => T | Promise<T>): Promise<T>;
  send(content: ContentInput, opts?: SendOptions): Promise<SendReceipt>;
  sendFile(file: AttachmentSend, opts?: SendOptions): Promise<SendReceipt>;
  sendFiles(files: AttachmentSend[], opts?: SendOptions): Promise<SendReceipt>;
  shareContactCard(): Promise<void>;
  /** iMessage only supports current / live location — not arbitrary coordinates. */
  shareLocation(opts?: { durationSeconds?: number }): Promise<void>;
  stopLocation(): Promise<void>;
  readonly to: string;
  typing(on?: boolean): Promise<void>;
  unsend(messageGuid: string): Promise<void>;
}

export interface ListMessagesOptions {
  after?: Date;
  before?: Date;
  limit?: number;
  searchText?: string;
}

export interface FocusStatus {
  silenced: boolean;
}

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

export interface GroupOps {
  add(handle: string): Promise<void>;
  getIcon(): Promise<Uint8Array | null>;
  getName(): Promise<string | null>;
  leave(): Promise<void>;
  participants(): Promise<User[]>;
  remove(handle: string): Promise<void>;
  setBackground(input: VisualAssetInput): Promise<void>;
  setIcon(input: VisualAssetInput): Promise<void>;
  setName(name: string): Promise<void>;
}

export interface PollOps {
  addOption(pollMessageGuid: string, optionText: string): Promise<void>;
  get(pollMessageGuid: string): Promise<PollInfo | null>;
  unvote(pollMessageGuid: string): Promise<void>;
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
  channel(target: string | ChannelTarget): Channel;
  close(): Promise<void>;
  createChat(
    participants: string[],
    opts?: { platform?: Platform }
  ): Promise<Channel>;
  createFaceTimeLink(opts?: {
    handles?: string[];
    platform?: Platform;
  }): Promise<{ url: string }>;
  incoming: AsyncIterable<[Channel, Message]>;
  /** @deprecated use `incoming` */
  messages: AsyncIterable<[Channel, Message]>;
  on<K extends SignalName>(
    event: K,
    handler: (signal: SignalMap[K], channel: Channel) => void
  ): () => void;
  ready: Set<string>;
  /** @deprecated use `ready` */
  readyPhones: Set<string>;
  /** @deprecated use `channel(...)` */
  space(handle: string): Channel;
}

export interface ChannelTarget {
  platform?: Platform;
  teamId?: string;
  to: string;
}

export interface ResolvedLine {
  address: string;
  business?: {
    phoneNumberId: string;
    accessToken: string;
    apiVersion?: string;
  };
  phone: string;
  slack?: {
    accessToken?: string;
    appToken?: string;
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

/** @deprecated use `Channel` */
export type Space = Channel;

export type ProviderConfig = {
  platform: Platform;
  mode?: "cloud" | "dedicated" | "local";
  [key: string]: unknown;
};
