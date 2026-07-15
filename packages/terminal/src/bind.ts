import type {
  AttachmentSend,
  Content,
  ContentInput,
  SendOptions,
} from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  bindMessage,
  contentSugar,
  messageFromSend,
  mimeToMediaName,
  readMediaBytes,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { terminal, type TerminalConfig } from "./config.js";
import { startTerminalSession, type TerminalSession } from "./session.js";

function createBinder(host: SkylineHost) {
  const attachmentStore = new Map<string, Uint8Array>();

  const sendResolved = async (
    channel: Channel,
    session: TerminalSession,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown": {
        const body = content.type === "markdown" ? content.body : content.text;
        const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
        session.write(`${prefix}${body}`);
        guid = `term-${Date.now()}`;
        break;
      }
      case "attachment": {
        const bytes = await readMediaBytes(content);
        guid = `term-file-${Date.now()}`;
        attachmentStore.set(guid, bytes);
        const name =
          content.name ?? mimeToMediaName(content.mimeType, "file");
        session.write(
          `agent: [file] ${name} (${content.mimeType ?? "application/octet-stream"}, ${bytes.length}b)`
        );
        break;
      }
      case "voice": {
        const bytes = await readMediaBytes(content);
        guid = `term-voice-${Date.now()}`;
        attachmentStore.set(guid, bytes);
        const name =
          content.name ?? mimeToMediaName(content.mimeType, "voice");
        session.write(
          `agent: [voice] ${name} (${content.mimeType ?? "audio/mpeg"}, ${bytes.length}b)`
        );
        break;
      }
      case "custom": {
        session.write(`agent: [custom] ${JSON.stringify(content.raw)}`);
        guid = `term-custom-${Date.now()}`;
        break;
      }
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendResolved(channel, session, content.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "edit": {
        const targetGuid = content.target.guid ?? "unknown";
        const inner = content.content;
        const body =
          inner.type === "text"
            ? inner.text
            : inner.type === "markdown"
              ? inner.body
              : JSON.stringify(inner);
        session.write(`agent edited ${targetGuid}: ${body}`);
        break;
      }
      case "unsend": {
        session.write(`agent unsent ${content.target.guid ?? "unknown"}`);
        break;
      }
      case "reaction": {
        session.write(
          `agent reacted ${content.emoji} on ${content.target.guid ?? "unknown"}`
        );
        break;
      }
      case "rename":
        session.write(`agent renamed chat to ${content.displayName}`);
        break;
      case "avatar":
        session.write(
          `agent ${content.action.kind === "clear" ? "cleared" : "set"} avatar`
        );
        break;
      case "addMember":
        session.write(`agent added ${content.members.join(", ")}`);
        break;
      case "removeMember":
        session.write(`agent removed ${content.members.join(", ")}`);
        break;
      case "leaveChannel":
        session.write("agent left channel");
        break;
      case "read":
      case "typing":
        break;
      case "app":
      case "flow":
      case "stream_text":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "group":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      
      case "keyboard":
      case "location":
      case "dice":
      case "forward":
      case "forward_many":
      case "copy":
      case "copy_many":
      case "invoice":
      case "game":
      case "checklist":
      case "paid_media":
      case "gift":
      case "rich_message":
      case "story":
      case "giveaway":
      case "giveaway_winners":
      case "live_photo":
      case "media_album":
      case "wa_contacts":
        host.unsupported("terminal", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, {
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: channel.to,
    });
  };

  const parseInboundLine = async (
    channel: Channel,
    line: string
  ): Promise<void> => {
    const reactMatch = line.match(/^\/react\s+(-)?\s*(\S+)\s+(.+)$/);
    if (reactMatch) {
      const removed = Boolean(reactMatch[1]);
      const messageGuid = reactMatch[2]!;
      const reaction = reactMatch[3]!.trim();
      host.emit(
        "reaction",
        {
          messageGuid,
          platform: "terminal",
          reaction,
          removed,
          sender: { displayName: "You", id: "you" },
          timestamp: new Date(),
        },
        channel
      );
      return;
    }

    const attachMatch = line.match(/^\/attach\s+(.+)$/);
    if (attachMatch) {
      const spec = attachMatch[1]!.trim();
      let bytes: Uint8Array;
      let mimeType = "application/octet-stream";
      let name = "attachment";
      const dataUrl = spec.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrl) {
        mimeType = dataUrl[1]!;
        bytes = Uint8Array.from(Buffer.from(dataUrl[2]!, "base64"));
        name = mimeToMediaName(mimeType, "file");
      } else {
        bytes = await readMediaBytes({ path: spec });
        name = spec.split("/").pop() ?? "attachment";
      }
      const guid = `term-in-file-${Date.now()}`;
      attachmentStore.set(guid, bytes);
      host.queue.push([
        channel,
        bindMessage(channel, {
          attachments: [
            attachmentWithDownload(
              { guid, mimeType, name, size: bytes.length },
              {
                read: async () => bytes,
                stream: async () =>
                  new ReadableStream({
                    start(controller) {
                      controller.enqueue(bytes);
                      controller.close();
                    },
                  }),
              }
            ),
          ],
          content: { text: `[attachment] ${name}`, type: "text" },
          guid,
          isFromMe: false,
          platform: "terminal",
          sender: { displayName: "You", id: "you" },
          timestamp: new Date(),
        }),
      ]);
      return;
    }

    const voiceMatch = line.match(/^\/voice\s+(.+)$/);
    if (voiceMatch) {
      const path = voiceMatch[1]!.trim();
      const bytes = await readMediaBytes({ path });
      const guid = `term-in-voice-${Date.now()}`;
      attachmentStore.set(guid, bytes);
      host.queue.push([
        channel,
        bindMessage(channel, {
          content: {
            mimeType: "audio/mpeg",
            name: path.split("/").pop() ?? "voice",
            path,
            type: "voice",
          },
          guid,
          isFromMe: false,
          platform: "terminal",
          sender: { displayName: "You", id: "you" },
          timestamp: new Date(),
        }),
      ]);
      return;
    }

    const customMatch = line.match(/^\/custom\s+(.+)$/);
    if (customMatch) {
      let raw: unknown;
      try {
        raw = JSON.parse(customMatch[1]!);
      } catch {
        raw = customMatch[1];
      }
      host.queue.push([
        channel,
        bindMessage(channel, {
          content: { raw, type: "custom" },
          guid: `term-in-custom-${Date.now()}`,
          isFromMe: false,
          platform: "terminal",
          sender: { displayName: "You", id: "you" },
          timestamp: new Date(),
        }),
      ]);
      return;
    }

    host.queue.push([
      channel,
      bindMessage(channel, {
        content: { text: line, type: "text" },
        guid: `term-in-${Date.now()}`,
        isFromMe: false,
        platform: "terminal",
        sender: { displayName: "You", id: "you" },
        timestamp: new Date(),
      }),
    ]);
  };

  const channelExtras = {
    ...unsupportedChatExtras((verb) => host.unsupported("terminal", verb)),
    background: async () => host.unsupported("terminal", "background"),
    focusStatus: async () => null,
    getAttachment: async (guid: string) => {
      const bytes = attachmentStore.get(guid);
      if (!bytes) {
        return null;
      }
      return attachmentWithDownload(
        { guid, size: bytes.length },
        {
          read: async () => bytes,
          stream: async () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            }),
        }
      );
    },
    getDisplayName: async () => null,
    getMessage: async () => null,
    listMessages: async () => [],
    shareContactCard: async () => host.unsupported("terminal", "shareContactCard"),
    pin: async () => host.unsupported("terminal", "pin"),
    shareLocation: async () => host.unsupported("terminal", "shareLocation"),
    stopLocation: async () => host.unsupported("terminal", "stopLocation"),
    unpin: async () => host.unsupported("terminal", "unpin"),
  };

  const makeChannel = (to: string): Channel => {
    const line = host.lineFor(to);
    const session = line.terminal as TerminalSession | undefined;
    if (!session) {
      throw new Error(`terminal session not ready for ${to}`);
    }

    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, session, resolved, sendOpts),
        content,
        "terminal"
      );
    const sugar = contentSugar(send);

    channel = {
      ...sugar,
      contact: async () => null,
      edit: async (messageGuid, update) => {
        const text =
          typeof update === "string" ? update : (update.text ?? JSON.stringify(update));
        session.write(`agent edited ${messageGuid}: ${text}`);
      },
      ...channelExtras,
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("terminal", verb)),
        add: (handle) => sugar.add(handle),
        getIcon: async () => null,
        getName: async () => null,
        leave: () => sugar.leave(),
        participants: async () => host.unsupported("terminal", "group.participants"),
        remove: (handle) => sugar.remove(handle),
        setBackground: async () =>
          host.unsupported("terminal", "group.setBackground"),
        setIcon: async () => host.unsupported("terminal", "group.setIcon"),
        setName: (name) => sugar.rename(name),
      },
      platform: "terminal",
      poll: unsupportedPollOps((verb) => host.unsupported("terminal", verb)),
      reachable: async () => true,
      react: async (messageGuid, reaction, reactOpts) => {
        session.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      read: async () => {},
      readReceipt: async () => {},
      responding: (fn) => withResponding(channel, fn),
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async (file: AttachmentSend, sendOpts) =>
        send(
          {
            data:
              file.data instanceof ArrayBuffer
                ? new Uint8Array(file.data)
                : file.data,
            name: file.name,
            path: file.path,
            type: "attachment",
            url: file.url,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
          },
          sendOpts
        ),
      sendFiles: async (files, sendOpts) => {
        let last: Message | undefined;
        for (const file of files) {
          last = await channel.sendFile(file, sendOpts);
        }
        return last;
      },
      to,
      typing: async (on = true) => {
        if (on) {
          session.write("agent is typing…");
        }
      },
      unsend: async (messageGuid) => {
        session.write(`agent unsent ${messageGuid}`);
      },
    };
    return channel;
  };

  const connectLocal = (config: TerminalConfig): void => {
    const to = "terminal";
    let channel!: Channel;
    let session: TerminalSession | undefined;

    const send = (content: ContentInput, sendOpts?: SendOptions) => {
      if (!session) {
        throw new Error("terminal session not ready");
      }
      return sendWithFallbacks(
        (resolved) => sendResolved(channel, session!, resolved, sendOpts),
        content,
        "terminal"
      );
    };
    const sugar = contentSugar(send);

    channel = {
      ...sugar,
      contact: async () => null,
      edit: async (messageGuid, update) => {
        const text =
          typeof update === "string" ? update : (update.text ?? JSON.stringify(update));
        session?.write(`agent edited ${messageGuid}: ${text}`);
      },
      ...channelExtras,
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("terminal", verb)),
        add: (handle) => sugar.add(handle),
        getIcon: async () => null,
        getName: async () => null,
        leave: () => sugar.leave(),
        participants: async () => host.unsupported("terminal", "group.participants"),
        remove: (handle) => sugar.remove(handle),
        setBackground: async () =>
          host.unsupported("terminal", "group.setBackground"),
        setIcon: async () => host.unsupported("terminal", "group.setIcon"),
        setName: (name) => sugar.rename(name),
      },
      platform: "terminal",
      poll: unsupportedPollOps((verb) => host.unsupported("terminal", verb)),
      reachable: async () => true,
      react: async (messageGuid, reaction, reactOpts) => {
        session?.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      read: async () => {},
      readReceipt: async () => {},
      responding: (fn) => withResponding(channel, fn),
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async (file: AttachmentSend, sendOpts) =>
        send(
          {
            data:
              file.data instanceof ArrayBuffer
                ? new Uint8Array(file.data)
                : file.data,
            name: file.name,
            path: file.path,
            type: "attachment",
            url: file.url,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
          },
          sendOpts
        ),
      sendFiles: async (files, sendOpts) => {
        let last: Message | undefined;
        for (const file of files) {
          last = await channel.sendFile(file, sendOpts);
        }
        return last;
      },
      to,
      typing: async (on = true) => {
        if (on) {
          session?.write("agent is typing…");
        }
      },
      unsend: async (messageGuid) => {
        session?.write(`agent unsent ${messageGuid}`);
      },
    };

    session = startTerminalSession({
      onLine: (line) => {
        void parseInboundLine(channel, line);
      },
      prompt: config.prompt ?? "you> ",
    });

    host.live.set(to, { platform: "terminal", streams: [], terminal: session });
    host.ready.add(to);
  };

  return {
    platform: "terminal" as Platform,
    connectLine: () => {},
    makeChannel,
    connectLocal,
  };
}

export function bind(host: SkylineHost, config: TerminalConfig): void {
  const binder = createBinder(host);
  host.register(binder);
  binder.connectLocal?.(config);
}

export { terminal } from "./config.js";
export type { TerminalConfig } from "./config.js";
export { startTerminalSession, type TerminalSession } from "./session.js";
