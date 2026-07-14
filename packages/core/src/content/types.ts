import type { Avatar } from "./avatar.js";
import type {
  AppMessage,
  AttachmentContent,
  ContactContent,
  CustomContent,
  DigitalTouchContent,
  FlowMessage,
  GroupContent,
  MarkdownContent,
  PayloadContent,
  PollContent,
  RichlinkContent,
  StreamTextContent,
  TextMessage,
  VoiceContent,
  WaContent,
} from "./builders.js";
import type { Edit } from "./edit.js";
import type { AddMember, LeaveChannel, RemoveMember } from "./membership.js";
import type { ReactionContent } from "./reaction.js";
import type { Read } from "./read.js";
import type { Rename } from "./rename.js";
import type { Reply } from "./reply.js";
import type { Typing } from "./typing.js";
import type { Unsend } from "./unsend.js";

export type BaseContent =
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
  | ReactionContent
  | Typing
  | Rename
  | Avatar
  | AddMember
  | RemoveMember
  | LeaveChannel;

export type Content = BaseContent | Reply | Edit | Unsend | Read;

export type { PayloadContent };

export interface ContentBuilder {
  build(): Promise<Content>;
}

export type ContentInput = string | Content | ContentBuilder;

export const FIRE_AND_FORGET_TYPES: ReadonlySet<string> = new Set([
  "typing",
  "edit",
  "rename",
  "avatar",
  "addMember",
  "removeMember",
  "leaveChannel",
  "unsend",
  "read",
]);

export function isContentBuilder(value: unknown): value is ContentBuilder {
  return (
    typeof value === "object" &&
    value !== null &&
    "build" in value &&
    typeof (value as ContentBuilder).build === "function" &&
    !("type" in value)
  );
}

export function isFireAndForget(content: Content): boolean {
  return FIRE_AND_FORGET_TYPES.has(content.type);
}
