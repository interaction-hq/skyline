import {
  markdown,
  text,
  type StreamTextContent,
  type TextMessage,
} from "./content/builders.js";
import { resolveContent } from "./content/resolve.js";
import type { BaseContent, Content, ContentInput } from "./content/types.js";
import { UnsupportedError } from "./host-types.js";
import { markdownToPlainText } from "./markdown.js";
import type { Message, Platform } from "./types.js";

export async function drainStreamText(
  content: StreamTextContent
): Promise<string> {
  let full = "";
  for await (const delta of content.stream()) {
    full += delta;
  }
  return full;
}

function findStreamText(item: Content): StreamTextContent | undefined {
  if (item.type === "stream_text") {
    return item;
  }
  if (
    (item.type === "reply" || item.type === "edit") &&
    item.content.type === "stream_text"
  ) {
    return item.content;
  }
  return;
}

function replaceStreamText(
  item: Content,
  source: StreamTextContent,
  full: string
): Content {
  const inner: BaseContent =
    source.format === "markdown" ? markdown(full) : text(full);
  if (item.type === "reply" || item.type === "edit") {
    return { ...item, content: inner };
  }
  return inner;
}

function downgradeMarkdown(body: string): TextMessage | undefined {
  const plain = markdownToPlainText(body);
  return plain ? text(plain) : undefined;
}

function replaceMarkdown(item: Content): Content {
  if (item.type === "markdown") {
    return downgradeMarkdown(item.body) ?? item;
  }
  if (
    (item.type === "reply" || item.type === "edit") &&
    item.content.type === "markdown"
  ) {
    const downgraded = downgradeMarkdown(item.content.body);
    return downgraded ? { ...item, content: downgraded } : item;
  }
  if (item.type === "group") {
    let changed = false;
    const items = item.items.map((member) => {
      if (member.type !== "markdown") {
        return member;
      }
      const plain = markdownToPlainText(member.body);
      if (!plain) {
        return member;
      }
      changed = true;
      return { type: "text" as const, text: plain };
    });
    return changed ? { ...item, items } : item;
  }
  return item;
}

type ProviderSend = (content: Content) => Promise<Message | undefined>;

async function resendDrainedStream(
  send: ProviderSend,
  item: Content,
  source: StreamTextContent,
  platform: Platform,
  unsupported: UnsupportedError
): Promise<Message | undefined> {
  let full: string;
  try {
    full = await drainStreamText(source);
  } catch {
    throw unsupported;
  }
  if (!full) {
    throw unsupported;
  }
  return sendWithFallbacks(
    send,
    replaceStreamText(item, source, full),
    platform
  );
}

/**
 * Dispatch content to a provider, downgrading when it rejects with
 * `UnsupportedError`:
 * - `stream_text` → drain the stream and re-send as text/markdown
 * - `markdown` → re-send as plain text
 */
export async function sendWithFallbacks(
  send: ProviderSend,
  input: ContentInput,
  platform: Platform
): Promise<Message | undefined> {
  const item = await resolveContent(input);
  try {
    return await send(item);
  } catch (err) {
    if (!(err instanceof UnsupportedError)) {
      throw err;
    }
    const source = findStreamText(item);
    if (source) {
      return resendDrainedStream(send, item, source, platform, err);
    }
    const downgraded = replaceMarkdown(item);
    if (downgraded === item) {
      throw err;
    }
    return send(downgraded);
  }
}
