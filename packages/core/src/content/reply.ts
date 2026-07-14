import type { Message } from "../types.js";
import { resolveContents } from "./resolve.js";
import type { BaseContent, ContentBuilder, ContentInput } from "./types.js";

export interface Reply {
  content: BaseContent;
  target: Message;
  type: "reply";
}

const REJECT = new Set([
  "reply",
  "edit",
  "reaction",
  "group",
  "typing",
  "rename",
  "avatar",
  "addMember",
  "removeMember",
  "leaveChannel",
  "unsend",
  "read",
]);

export function reply(
  content: ContentInput,
  target: Message | undefined
): ContentBuilder {
  return {
    build: async () => {
      if (!target) {
        throw new Error(
          "reply() target is undefined — the targeted message was never sent"
        );
      }
      const [resolved] = await resolveContents([content]);
      if (!resolved) {
        throw new Error("reply() requires content");
      }
      if (REJECT.has(resolved.type)) {
        throw new Error(`reply() cannot wrap "${resolved.type}" content`);
      }
      return {
        type: "reply",
        content: resolved as BaseContent,
        target,
      };
    },
  };
}
