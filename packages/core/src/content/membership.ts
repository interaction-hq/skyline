import type { User } from "../types.js";
import type { ContentBuilder } from "./types.js";

export interface AddMember {
  members: string[];
  type: "addMember";
}

export interface RemoveMember {
  members: string[];
  /** Also delete the removed member's recent messages (ban). */
  revokeMessages?: boolean;
  type: "removeMember";
  /** Ban until this Unix time; omitted / 0 bans permanently. */
  untilDate?: number;
}

export interface RemoveMemberOptions {
  revokeMessages?: boolean;
  untilDate?: number;
}

export interface LeaveChannel {
  type: "leaveChannel";
}

export type MemberInput = User | string | (User | string)[];

const toMemberIds = (users: MemberInput): string[] =>
  (Array.isArray(users) ? users : [users]).map((u) =>
    typeof u === "string" ? u : u.id
  );

export function addMember(users: MemberInput): ContentBuilder {
  const members = toMemberIds(users);
  if (members.length === 0) {
    throw new Error("addMember() requires at least one member");
  }
  return {
    build: async () => ({ members, type: "addMember" }),
  };
}

export function removeMember(
  users: MemberInput,
  opts?: RemoveMemberOptions
): ContentBuilder {
  const members = toMemberIds(users);
  if (members.length === 0) {
    throw new Error("removeMember() requires at least one member");
  }
  return {
    build: async () => ({
      members,
      revokeMessages: opts?.revokeMessages,
      type: "removeMember",
      untilDate: opts?.untilDate,
    }),
  };
}

export function leaveChannel(): ContentBuilder {
  return {
    build: async () => ({ type: "leaveChannel" }),
  };
}
