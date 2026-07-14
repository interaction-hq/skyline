import type { ContentBuilder } from "./types.js";

export interface Rename {
  displayName: string;
  type: "rename";
}

export function rename(displayName: string): ContentBuilder {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error("rename() displayName must be non-empty");
  }
  return {
    build: async () => ({ type: "rename", displayName: trimmed }),
  };
}
