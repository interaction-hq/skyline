// Bind Channel actions onto a Message so agents can `message.reply(...)` etc.

import type { Content, Reaction, SendOptions } from "./content.js";
import type { Channel, Message, MessageAttachment, SendReceipt } from "./types.js";

export type MessageData = Omit<
  Message,
  "channel" | "edit" | "react" | "read" | "reply" | "unsend"
>;

/**
 * Attach conversation actions to a message payload. Inbound binders and
 * `getMessage` / `listMessages` use this so agents chain off the message object.
 */
export function bindMessage(channel: Channel, data: MessageData): Message {
  const guid = data.guid;
  return {
    ...data,
    channel,
    edit: async (newText: string) => {
      if (!guid) {
        throw new Error("edit: message has no guid");
      }
      await channel.edit(guid, newText);
    },
    react: async (reaction: Reaction, opts?: { remove?: boolean }) => {
      if (!guid) {
        throw new Error("react: message has no guid");
      }
      await channel.react(guid, reaction, opts);
    },
    read: async () => {
      await channel.read();
    },
    reply: (content: string | Content, opts?: SendOptions) => {
      if (!guid) {
        throw new Error("reply: message has no guid");
      }
      return channel.reply(guid, content, opts);
    },
    unsend: async () => {
      if (!guid) {
        throw new Error("unsend: message has no guid");
      }
      await channel.unsend(guid);
    },
  };
}

/** Attachments that cannot be downloaded on this line. */
export function stubAttachmentDownload(
  meta: Omit<MessageAttachment, "read" | "stream">
): MessageAttachment {
  const unsupported = async (): Promise<never> => {
    throw new Error(
      `attachment download is not supported on ${meta.guid ? "this line" : "this attachment"}`
    );
  };
  return {
    ...meta,
    read: unsupported,
    stream: unsupported,
  };
}

export function attachmentWithDownload(
  meta: Omit<MessageAttachment, "read" | "stream">,
  download: {
    read: () => Promise<Uint8Array>;
    stream: () => Promise<ReadableStream<Uint8Array>>;
  }
): MessageAttachment {
  return {
    ...meta,
    read: download.read,
    stream: download.stream,
  };
}

/** Resolve a SendReceipt into nothing extra — kept for call-site clarity. */
export function asReceipt(guid: string | undefined): SendReceipt {
  return { guid, sentAt: new Date() };
}
