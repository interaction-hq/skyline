import type { ContentBuilder } from "./types.js";

export interface Typing {
  state: "start" | "stop";
  type: "typing";
}

export function typing(state: "start" | "stop" = "start"): ContentBuilder {
  return {
    build: async () => ({ type: "typing", state }),
  };
}
