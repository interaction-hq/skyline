import {
  type ContentInput,
  edit as editContent,
  type Reaction,
  reaction as reactionContent,
  read as readContent,
  reply as replyContent,
  type SendOptions,
  unsend as unsendContent,
} from "./content/index.js";
import type {
  Channel,
  Message,
  MessageAttachment,
  SendReceipt,
} from "./types.js";

export type MessageData = Omit<
  Message,
  "channel" | "direction" | "edit" | "react" | "read" | "reply" | "unsend"
> & {
  direction?: "inbound" | "outbound";
};

export function bindMessage(channel: Channel, data: MessageData): Message {
  const guid = data.guid;
  const direction = data.direction ?? (data.isFromMe ? "outbound" : "inbound");

  let self: Message | undefined;

  const requireSelf = (action: string): Message => {
    if (!self) {
      throw new Error(
        `${action}() called before message construction completed`
      );
    }
    return self;
  };

  self = {
    ...data,
    channel,
    direction,
    edit: async (content: ContentInput) => {
      await channel.send(editContent(content, requireSelf("edit")));
    },
    react: async (reaction: Reaction, opts?: { remove?: boolean }) => {
      if (!guid) {
        throw new Error("react: message has no guid");
      }
      if (opts?.remove) {
        await channel.react(guid, reaction, opts);
        return;
      }
      await channel.send(reactionContent(reaction, requireSelf("react")));
    },
    read: async () => {
      await channel.send(readContent(requireSelf("read")));
    },
    reply: (content: ContentInput, opts?: SendOptions) =>
      channel.send(replyContent(content, requireSelf("reply")), opts),
    unsend: async () => {
      await channel.send(unsendContent(requireSelf("unsend")));
    },
  };
  return self;
}

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

export function asReceipt(guid: string | undefined): SendReceipt {
  return { guid, sentAt: new Date() };
}
