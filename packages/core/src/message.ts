import {
  type Content,
  type ContentInput,
  edit as editContent,
  isFireAndForget,
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
  MessageContent,
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

export function bindOutboundMessage(
  channel: Channel,
  opts: {
    content: MessageContent;
    guid?: string;
    replyTo?: Message["replyTo"];
    senderId?: string;
    service?: string;
    slack?: Message["slack"];
    threadId?: Message["threadId"];
    timestamp?: Date;
  }
): Message {
  return bindMessage(channel, {
    content: opts.content,
    direction: "outbound",
    guid: opts.guid,
    isFromMe: true,
    platform: channel.platform,
    replyTo: opts.replyTo,
    sender: { id: opts.senderId ?? channel.to },
    service: opts.service,
    slack: opts.slack,
    threadId: opts.threadId,
    timestamp: opts.timestamp ?? new Date(),
  });
}

export function messageFromSend(
  channel: Channel,
  content: Content,
  guid: string | undefined,
  extras?: {
    replyTo?: Message["replyTo"];
    senderId?: string;
    service?: string;
    slack?: Message["slack"];
    threadId?: Message["threadId"];
    timestamp?: Date;
  }
): Message | undefined {
  if (isFireAndForget(content)) {
    return undefined;
  }
  return bindOutboundMessage(channel, {
    content,
    guid,
    replyTo: extras?.replyTo,
    senderId: extras?.senderId,
    service: extras?.service,
    slack: extras?.slack,
    threadId: extras?.threadId,
    timestamp: extras?.timestamp,
  });
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

/** @deprecated Use `messageFromSend` / `bindOutboundMessage`. */
export function asReceipt(guid: string | undefined): SendReceipt {
  return { guid, sentAt: new Date() };
}
