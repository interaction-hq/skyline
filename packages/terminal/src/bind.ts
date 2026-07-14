import type { ContentInput, SendOptions } from "@skyline-ts/core/content";
import { resolveContent } from "@skyline-ts/core/content";
import type { Channel, Platform } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import {
  bindMessage,
  contentSugar,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { terminal, type TerminalConfig } from "./config.js";
import { startTerminalSession, type TerminalSession } from "./session.js";

function createBinder(host: SkylineHost) {
  const sendContent = async (
    session: TerminalSession,
    content: ContentInput,
    sendOpts?: SendOptions
  ) => {
    const parsed = await resolveContent(content);
    switch (parsed.type) {
      case "text":
      case "markdown": {
        const body = parsed.type === "markdown" ? parsed.body : parsed.text;
        const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
        session.write(`${prefix}${body}`);
        return { guid: `term-${Date.now()}`, sentAt: new Date() };
      }
      case "reply": {
        const targetGuid = parsed.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendContent(session, parsed.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "edit": {
        const targetGuid = parsed.target.guid ?? "unknown";
        const inner = parsed.content;
        const body =
          inner.type === "text"
            ? inner.text
            : inner.type === "markdown"
              ? inner.body
              : JSON.stringify(inner);
        session.write(`agent edited ${targetGuid}: ${body}`);
        return { sentAt: new Date() };
      }
      case "unsend": {
        session.write(`agent unsent ${parsed.target.guid ?? "unknown"}`);
        return { sentAt: new Date() };
      }
      case "reaction": {
        session.write(
          `agent reacted ${parsed.emoji} on ${parsed.target.guid ?? "unknown"}`
        );
        return { sentAt: new Date() };
      }
      case "rename":
        session.write(`agent renamed chat to ${parsed.displayName}`);
        return { sentAt: new Date() };
      case "avatar":
        session.write(
          `agent ${parsed.action.kind === "clear" ? "cleared" : "set"} avatar`
        );
        return { sentAt: new Date() };
      case "addMember":
        session.write(`agent added ${parsed.members.join(", ")}`);
        return { sentAt: new Date() };
      case "removeMember":
        session.write(`agent removed ${parsed.members.join(", ")}`);
        return { sentAt: new Date() };
      case "leaveChannel":
        session.write("agent left channel");
        return { sentAt: new Date() };
      case "read":
      case "typing":
        return { sentAt: new Date() };
      case "app":
      case "custom":
      case "flow":
      case "stream_text":
      case "attachment":
      case "voice":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "group":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "wa_contacts":
        host.unsupported("terminal", `sending ${parsed.type} content`);
        break;
      default: {
        const _exhaustive: never = parsed;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    throw new Error("unreachable");
  };

  const channelExtras = {
    background: async () => host.unsupported("terminal", "background"),
    focusStatus: async () => null,
    getAttachment: async () => null,
    getDisplayName: async () => null,
    getMessage: async () => null,
    listMessages: async () => [],
    sendFiles: async () => host.unsupported("terminal", "sendFiles"),
    shareContactCard: async () => host.unsupported("terminal", "shareContactCard"),
    shareLocation: async () => host.unsupported("terminal", "shareLocation"),
    stopLocation: async () => host.unsupported("terminal", "stopLocation"),
  };

  const makeChannel = (to: string): Channel => {
    const line = host.lineFor(to);
    const session = line.terminal as TerminalSession | undefined;
    if (!session) {
      throw new Error(`terminal session not ready for ${to}`);
    }

    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendContent(session, content, sendOpts);
    const sugar = contentSugar(send);

    const channel: Channel = {
      ...sugar,
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session.write(`agent edited ${messageGuid}: ${newText}`);
      },
      ...channelExtras,
      group: {
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
      sendFile: async () => host.unsupported("terminal", "sendFile"),
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
    let session: TerminalSession | undefined;

    const send = (content: ContentInput, sendOpts?: SendOptions) => {
      if (!session) {
        throw new Error("terminal session not ready");
      }
      return sendContent(session, content, sendOpts);
    };
    const sugar = contentSugar(send);

    const channel: Channel = {
      ...sugar,
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session?.write(`agent edited ${messageGuid}: ${newText}`);
      },
      ...channelExtras,
      group: {
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
      sendFile: async () => host.unsupported("terminal", "sendFile"),
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
