import { text } from "./builders.js";
import { type Content, type ContentInput, isContentBuilder } from "./types.js";

export async function resolveContent(input: ContentInput): Promise<Content> {
  if (typeof input === "string") {
    return text(input);
  }
  if (isContentBuilder(input)) {
    return input.build();
  }
  return input;
}

export function resolveContents(
  items: readonly ContentInput[]
): Promise<Content[]> {
  return Promise.all(items.map((item) => resolveContent(item)));
}

export function toContent(input: string | Content): Content {
  return typeof input === "string" ? text(input) : input;
}
