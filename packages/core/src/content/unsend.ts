import type { Message } from "../types.js";
import type { ContentBuilder } from "./types.js";

export interface Unsend {
  target: Message;
  type: "unsend";
}

export function unsend(target: Message | undefined): ContentBuilder {
  return {
    build: async () => {
      if (!target) {
        throw new Error(
          "unsend() target is undefined — the targeted message was never sent"
        );
      }
      if (target.direction !== "outbound") {
        throw new Error(
          `unsend() target must be an outbound message (got direction "${target.direction}", message id "${target.guid}")`
        );
      }
      return { type: "unsend", target };
    },
  };
}
