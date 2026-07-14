import type { Message } from "../types.js";
import type { ContentBuilder } from "./types.js";

export interface Read {
  target: Message;
  type: "read";
}

export function read(target: Message): ContentBuilder {
  return {
    build: async () => {
      if (target.direction !== "inbound") {
        throw new Error(
          `read() target must be an inbound message (got direction "${target.direction}", message id "${target.guid}")`
        );
      }
      return { target, type: "read" };
    },
  };
}
