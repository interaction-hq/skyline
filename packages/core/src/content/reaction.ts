import type { Message } from "../types.js";
import type { ContentBuilder } from "./types.js";
import type { Reaction as ReactionEmoji } from "./builders.js";

export interface ReactionContent {
  emoji: string;
  target: Message;
  type: "reaction";
}

export interface ReactionBuilder extends ContentBuilder {
  build(): Promise<ReactionContent>;
}

export function reaction(
  emoji: ReactionEmoji,
  target: Message | undefined
): ReactionBuilder {
  return {
    build: async () => {
      if (!target) {
        throw new Error(
          "reaction() target is undefined — the targeted message was never sent"
        );
      }
      if (target.content.type === "reaction") {
        throw new Error('reaction() cannot target "reaction" content');
      }
      return { type: "reaction", emoji: String(emoji), target };
    },
  };
}
