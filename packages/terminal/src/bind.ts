import type { Content, SendOptions } from "@skyline-ts/core/content";
import { toContent } from "@skyline-ts/core/content";
import type { Channel, Platform } from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import { terminal, type TerminalConfig } from "./config.js";
import { startTerminalSession, type TerminalSession } from "./session.js";

function createBinder(host: SkylineHost) {
  const sendContent = async (
    session: TerminalSession,
    content: string | Content,
    sendOpts?: SendOptions
  ) => {
    const parsed = toContent(content);
    switch (parsed.type) {
      case "text":
      case "markdown": {
        const body = parsed.type === "markdown" ? parsed.body : parsed.text;
        const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
        session.write(`${prefix}${body}`);
        return { guid: `term-${Date.now()}`, sentAt: new Date() };
      }
      case "app":
      case "flow":
      case "attachment":
      case "voice":
      case "contact":
      case "richlink":
      case "poll":
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
    getMessage: async () => null,
    sendFiles: async () => host.unsupported("terminal", "sendFiles"),
    shareContactCard: async () => host.unsupported("terminal", "shareContactCard"),
    group: {
      add: () => host.unsupported("terminal", "group.add"),
      getIcon: async () => null,
      leave: async () => host.unsupported("terminal", "group.leave"),
      participants: async () => host.unsupported("terminal", "group.participants"),
      remove: () => host.unsupported("terminal", "group.remove"),
      setBackground: async () => host.unsupported("terminal", "group.setBackground"),
      setIcon: async () => host.unsupported("terminal", "group.setIcon"),
      setName: () => host.unsupported("terminal", "group.setName"),
    },
  };

  const makeChannel = (to: string): Channel => {
    const line = host.lineFor(to);
    const session = line.terminal as TerminalSession | undefined;
    if (!session) {
      throw new Error(`terminal session not ready for ${to}`);
    }

    return {
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session.write(`agent edited ${messageGuid}: ${newText}`);
      },
      ...channelExtras,
      get phone() {
        return to;
      },
      platform: "terminal",
      reachable: async () => true,
      react: async (messageGuid, reaction, reactOpts) => {
        session.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      read: async () => {},
      readReceipt: async () => {},
      reply: (messageGuid, content, sendOpts) =>
        sendContent(session, content, { ...sendOpts, replyTo: messageGuid }),
      send: (content, sendOpts) => sendContent(session, content, sendOpts),
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
  };

  const connectLocal = (config: TerminalConfig): void => {
    const to = "terminal";
    let session: TerminalSession | undefined;

    const channel: Channel = {
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session?.write(`agent edited ${messageGuid}: ${newText}`);
      },
      ...channelExtras,
      get phone() {
        return to;
      },
      platform: "terminal",
      reachable: async () => true,
      react: async (messageGuid, reaction, reactOpts) => {
        session?.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      read: async () => {},
      readReceipt: async () => {},
      reply: (messageGuid, content, sendOpts) =>
        channel.send(content, { ...sendOpts, replyTo: messageGuid }),
      send: (content, sendOpts) => {
        if (!session) {
          throw new Error("terminal session not ready");
        }
        return sendContent(session, content, sendOpts);
      },
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
          {
            content: { text: line, type: "text" },
            guid: `term-in-${Date.now()}`,
            isFromMe: false,
            platform: "terminal",
            sender: { displayName: "You", id: "you" },
            timestamp: new Date(),
          },
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
