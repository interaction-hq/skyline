import type { Message } from "../types.js";
import { resolveContents } from "./resolve.js";
import type { BaseContent, ContentBuilder, ContentInput } from "./types.js";

export interface Edit {
  content: BaseContent;
  target: Message;
  type: "edit";
}

const REJECT = new Set([
  "edit",
  "reply",
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

export function edit(
  content: ContentInput,
  target: Message | undefined
): ContentBuilder {
  return {
    build: async () => {
      if (!target) {
        throw new Error(
          "edit() target is undefined — the targeted message was never sent"
        );
      }
      if (target.direction !== "outbound") {
        throw new Error(
          `edit() target must be an outbound message (got direction "${target.direction}", message id "${target.guid}")`
        );
      }
      const [resolved] = await resolveContents([content]);
      if (!resolved) {
        throw new Error("edit() requires content");
      }
      if (REJECT.has(resolved.type)) {
        throw new Error(`edit() cannot wrap "${resolved.type}" content`);
      }
      return {
        content: resolved as BaseContent,
        target,
        type: "edit",
      };
    },
  };
}
