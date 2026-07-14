import type { User } from "../types.js";
import type { ContentBuilder } from "./types.js";

export interface AddMember {
  members: string[];
  type: "addMember";
}

export interface RemoveMember {
  members: string[];
  type: "removeMember";
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
    build: async () => ({ type: "addMember", members }),
  };
}

export function removeMember(users: MemberInput): ContentBuilder {
  const members = toMemberIds(users);
  if (members.length === 0) {
    throw new Error("removeMember() requires at least one member");
  }
  return {
    build: async () => ({ type: "removeMember", members }),
  };
}

export function leaveChannel(): ContentBuilder {
  return {
    build: async () => ({ type: "leaveChannel" }),
  };
}
