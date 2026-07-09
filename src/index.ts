// Skyline — the unified messaging SDK. One project, one credential pair, every
// platform. `Skyline({ projectId, projectSecret, providers })` resolves lines
// (via the cloud broker by default, or dedicated endpoints you supply), connects
// them, and gives you a merged `app.incoming` feed, `app.on(event)` signals, and
// a `channel()` you send/react/type on — all over one fast per-line transport.

import { Broker } from "./broker";
import {
  type AttachmentSend,
  type Content,
  type Reaction,
  resolveEffect,
  type SendOptions,
  toContent,
} from "./content";
import { dedicatedLines, type ImessageConfig } from "./providers/imessage";
import type { TerminalConfig } from "./providers/terminal";
import {
  type WhatsappBusinessConfig,
  whatsappBusinessDedicatedLines,
  type WhatsappConfig,
  whatsappDedicatedLines,
} from "./providers/whatsapp";
import {
  startTerminalSession,
  type TerminalSession,
} from "./transport/terminal";
import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
  type InboundGroup,
  type SendWireOptions,
} from "./transport/imessage-grpc";
import { WhatsappGrpcClient } from "./transport/whatsapp-grpc";
import {
  WhatsappBusinessClient,
  type WaSendResult,
} from "./transport/whatsapp-business-rest";
import type {
  Channel,
  ChannelTarget,
  GroupContext,
  Message,
  Platform,
  ResolvedLine,
  SendReceipt,
  SignalMap,
  SignalName,
  SkylineApp,
  User,
} from "./types";

const DEFAULT_BASE_URL = "https://api.interactions.co.in";

export type ProviderConfig =
  | ImessageConfig
  | WhatsappConfig
  | WhatsappBusinessConfig
  | TerminalConfig;

export interface SkylineOptions {
  /** Project credentials (cloud mode). Optional if every provider is dedicated. */
  projectId?: string;
  projectSecret?: string;
  /** Skyline control-plane base URL (cloud mode). */
  baseUrl?: string;
  /** Providers to enable. */
  providers: ProviderConfig[];
}

interface InboundQueue {
  push(item: [Channel, Message]): void;
  iterator(): AsyncIterable<[Channel, Message]>;
  done(): void;
}

function createQueue(): InboundQueue {
  const buffer: [Channel, Message][] = [];
  let resolveNext: (() => void) | null = null;
  let finished = false;

  return {
    push(item) {
      buffer.push(item);
      resolveNext?.();
      resolveNext = null;
    },
    done() {
      finished = true;
      resolveNext?.();
      resolveNext = null;
    },
    iterator() {
      return {
        async *[Symbol.asyncIterator]() {
          while (true) {
            if (buffer.length > 0) {
              yield buffer.shift() as [Channel, Message];
              continue;
            }
            if (finished) {
              return;
            }
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
        },
      };
    },
  };
}

/** A tiny typed emitter for the non-message signals (`app.on`). */
function createEmitter() {
  const handlers = new Map<
    SignalName,
    Set<(signal: unknown, channel: Channel) => void>
  >();
  return {
    on<K extends SignalName>(
      event: K,
      handler: (signal: SignalMap[K], channel: Channel) => void
    ): () => void {
      const set =
        handlers.get(event) ??
        (handlers.set(event, new Set()).get(event) as Set<
          (signal: unknown, channel: Channel) => void
        >);
      set.add(handler as (signal: unknown, channel: Channel) => void);
      return () => set.delete(handler as (signal: unknown, channel: Channel) => void);
    },
    emit<K extends SignalName>(
      event: K,
      signal: SignalMap[K],
      channel: Channel
    ): void {
      const set = handlers.get(event);
      if (!set) {
        return;
      }
      for (const handler of set) {
        try {
          handler(signal, channel);
        } catch {
          // A subscriber throwing must not break the stream for others.
        }
      }
    },
  };
}

interface LiveLine {
  platform: Platform;
  grpc?: ImessageGrpcClient;
  wa?: WhatsappGrpcClient;
  wb?: WhatsappBusinessClient;
  terminal?: TerminalSession;
  streams: { cancel: () => void }[];
}

/** A verb this platform does not support raises a clear, catchable error. */
function unsupported(platform: Platform, verb: string): never {
  throw new Error(`${verb} is not supported on ${platform}`);
}

export async function Skyline(opts: SkylineOptions): Promise<SkylineApp> {
  const queue = createQueue();
  const emitter = createEmitter();
  const live = new Map<string, LiveLine>();
  const ready = new Set<string>();
  const broker = new Broker({ baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL });

  const newId = (): string =>
    `sky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lineFor = (to: string): LiveLine => {
    const line = live.get(to);
    if (!line) {
      throw new Error(`no ready line for ${to}`);
    }
    return line;
  };

  /** Get the iMessage transport for a line, or fail clearly. */
  const imFor = (to: string): ImessageGrpcClient => {
    const line = lineFor(to);
    if (!line.grpc) {
      throw new Error(`line ${to} is not an iMessage line`);
    }
    return line.grpc;
  };

  const waFor = (to: string): WhatsappGrpcClient => {
    const line = lineFor(to);
    if (!line.wa) {
      throw new Error(`line ${to} is not a WhatsApp line`);
    }
    return line.wa;
  };

  const wbFor = (to: string): WhatsappBusinessClient => {
    const line = lineFor(to);
    if (!line.wb) {
      throw new Error(`line ${to} is not a WhatsApp Business line`);
    }
    return line.wb;
  };

  const wireOpts = (opts?: SendOptions): SendWireOptions => ({
    replyTo: opts?.replyTo,
    effectId: resolveEffect(opts?.effect),
    subject: opts?.subject,
    richLink: opts?.richLink,
    scan: opts?.scan,
  });

  // A group is addressed by its chat guid directly; a DM by a bare handle we
  // wrap. Detect an already-formed chat guid so groups route unchanged.
  const chatGuidFor = (to: string): string =>
    /;[-+];/.test(to) || to.startsWith("chat") ? to : dmChatGuid(to);

  const sendContent = async (
    to: string,
    input: string | Content,
    opts?: SendOptions
  ): Promise<SendReceipt> => {
    const grpc = imFor(to);
    const id = newId();
    const sentAt = new Date();
    const content = toContent(input);
    const chatGuid = chatGuidFor(to);
    let guid: string | undefined;
    switch (content.type) {
      case "text": {
        const res = await grpc.send(chatGuid, content.text, id, wireOpts(opts));
        guid = res.guid;
        break;
      }
      case "app": {
        const res = await grpc.sendApp(
          chatGuid,
          { ...content, effect: resolveEffect(opts?.effect) ?? content.effect },
          id
        );
        guid = res.guid;
        break;
      }
      case "flow": {
        const state = content.session
          ? { ...(content.data ?? {}), __session: content.session }
          : content.data;
        const res = await grpc.sendFlow(
          chatGuid,
          {
            appId: content.appId,
            spec: content.flow,
            screen: content.screen,
            state,
            caption: content.caption,
            subcaption: content.subcaption,
            image: content.image,
            summary: content.summary,
            teamId: content.teamId,
            bundleId: content.bundleId,
            appStoreId: content.appStoreId,
          },
          id
        );
        guid = res.guid;
        break;
      }
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "wa_contacts":
        unsupported("imessage", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return { guid, sentAt };
  };

  const makeImessageChannel = (to: string): Channel => {
    const chatGuid = chatGuidFor(to);
    return {
      to,
      get phone() {
        return to;
      },
      platform: "imessage",
      send: (content, sendOpts) => sendContent(to, content, sendOpts),
      reply: (messageGuid, content, sendOpts) =>
        sendContent(to, content, { ...sendOpts, replyTo: messageGuid }),
      react: (messageGuid, reaction: Reaction, reactOpts) =>
        imFor(to).sendReaction(chatGuid, messageGuid, reaction, {
          remove: reactOpts?.remove,
        }),
      edit: (messageGuid, newText) =>
        imFor(to).editMessage(chatGuid, messageGuid, newText),
      unsend: (messageGuid) => imFor(to).unsendMessage(chatGuid, messageGuid),
      typing: async (on = true) => {
        const grpc = imFor(to);
        await (on ? grpc.startTyping(chatGuid) : grpc.stopTyping(chatGuid));
      },
      read: () => imFor(to).markRead(chatGuid),
      readReceipt: () => imFor(to).sendReadReceipt(chatGuid),
      sendFile: async (file: AttachmentSend, sendOpts) => {
        const grpc = imFor(to);
        const id = newId();
        const sentAt = new Date();
        let attachmentGuid: string | undefined;
        if (file.data) {
          const bytes =
            file.data instanceof Uint8Array
              ? file.data
              : new Uint8Array(file.data);
          const up = await grpc.uploadAttachment(
            bytes,
            file.name ?? "attachment"
          );
          attachmentGuid = up.attachment_guid;
        }
        const res = await grpc.sendAttachment(
          chatGuid,
          id,
          {
            attachmentGuid,
            attachmentPath: file.path,
            attachmentName: file.name,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
          },
          wireOpts(sendOpts)
        );
        return { guid: res.guid, sentAt };
      },
      reachable: () => imFor(to).checkAvailability(to, "imessage"),
      contact: async () => {
        const card = await imFor(to).getContactCard(to);
        if (!card) {
          return null;
        }
        return {
          address: card.address,
          firstName: card.first_name || undefined,
          lastName: card.last_name || undefined,
          fullName: card.full_name || undefined,
          organization: card.organization || undefined,
          emails: card.emails ?? [],
          phones: card.phones ?? [],
          isContact: Boolean(card.is_contact),
        };
      },
      group: {
        setName: (name) => imFor(to).setGroupName(chatGuid, name),
        add: (handle) => imFor(to).addParticipant(chatGuid, handle),
        remove: (handle) => imFor(to).removeParticipant(chatGuid, handle),
        participants: async () => {
          const rows = await imFor(to).getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
      },
    };
  };

  /**
   * A WhatsApp channel. WhatsApp personal supports text/reply/react over its own
   * gRPC transport; the iMessage-only affordances (effects, typing/read receipts,
   * group admin, contact cards) raise a clear "not supported" error so callers
   * can branch on `channel.platform`.
   */
  const makeWhatsappChannel = (to: string): Channel => ({
    to,
    get phone() {
      return to;
    },
    platform: "whatsapp",
    send: async (content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        unsupported("whatsapp", `sending ${c.type} content`);
      }
      const res = await waFor(to).sendText(to, c.text, newId(), sendOpts?.replyTo);
      return { guid: res.messageId, sentAt: new Date() };
    },
    reply: async (messageGuid, content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        unsupported("whatsapp", `replying with ${c.type} content`);
      }
      const res = await waFor(to).sendText(to, c.text, newId(), messageGuid);
      void sendOpts;
      return { guid: res.messageId, sentAt: new Date() };
    },
    react: (messageGuid, reaction: Reaction, reactOpts) =>
      waFor(to).sendReaction(to, messageGuid, reactOpts?.remove ? "" : reaction),
    edit: () => unsupported("whatsapp", "edit"),
    unsend: () => unsupported("whatsapp", "unsend"),
    typing: async () => unsupported("whatsapp", "typing"),
    read: async () => unsupported("whatsapp", "read"),
    readReceipt: async () => unsupported("whatsapp", "readReceipt"),
    sendFile: async () => unsupported("whatsapp", "sendFile"),
    reachable: async () => true,
    contact: async () => null,
    group: {
      setName: () => unsupported("whatsapp", "group.setName"),
      add: () => unsupported("whatsapp", "group.add"),
      remove: () => unsupported("whatsapp", "group.remove"),
      participants: async () => unsupported("whatsapp", "group.participants"),
    },
  });

  /**
   * Send a piece of `Content` on a WhatsApp Business channel by mapping it to the
   * matching Cloud API message type. Text goes through `sendText`; the `wa*`
   * builders map to media/template/interactive/location/contacts. iMessage-only
   * card types (`app`/`flow`) have no Cloud API analogue and error clearly.
   */
  const sendWaBusiness = async (
    to: string,
    input: string | Content,
    opts?: SendOptions
  ): Promise<SendReceipt> => {
    const wb = wbFor(to);
    const content = toContent(input);
    const replyTo = opts?.replyTo;
    let res: WaSendResult;
    switch (content.type) {
      case "text":
        res = await wb.sendText(to, content.text, {
          replyTo,
          previewUrl: opts?.richLink,
        });
        break;
      case "wa_media":
        res = await wb.sendMedia(
          to,
          content.kind,
          {
            id: content.id,
            link: content.link,
            caption: content.caption,
            filename: content.filename,
          },
          { replyTo }
        );
        break;
      case "wa_template":
        res = await wb.sendTemplate(
          to,
          {
            name: content.name,
            language: { code: content.language },
            components: content.components,
          },
          { replyTo }
        );
        break;
      case "wa_interactive":
        res = await wb.sendInteractive(to, content.interactive, { replyTo });
        break;
      case "wa_location":
        res = await wb.sendLocation(
          to,
          {
            latitude: content.latitude,
            longitude: content.longitude,
            name: content.name,
            address: content.address,
          },
          { replyTo }
        );
        break;
      case "wa_contacts":
        res = await wb.sendContacts(to, content.contacts, { replyTo });
        break;
      case "app":
      case "flow":
        unsupported("whatsapp_business", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return { guid: res.messageId, sentAt: new Date() };
  };

  /**
   * A WhatsApp Business channel. Sends run over the Meta Cloud API (HTTPS), so it
   * supports the full business catalog (text, media, templates, interactive,
   * location, contacts) plus reactions and read/typing acknowledgements. The
   * conversation-history affordances iMessage exposes (edit/unsend, group admin,
   * contact-card lookup) are not part of the Cloud API and error clearly.
   */
  const makeWhatsappBusinessChannel = (to: string): Channel => ({
    to,
    get phone() {
      return to;
    },
    platform: "whatsapp_business",
    send: (content, sendOpts) => sendWaBusiness(to, content, sendOpts),
    reply: (messageGuid, content, sendOpts) =>
      sendWaBusiness(to, content, { ...sendOpts, replyTo: messageGuid }),
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      await wbFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      );
    },
    edit: () => unsupported("whatsapp_business", "edit"),
    unsend: () => unsupported("whatsapp_business", "unsend"),
    // The Cloud API ties typing/read to a specific inbound message id, so the
    // richer `channel.readReceipt(messageId)` path carries it; the argument-free
    // `typing()`/`read()` are conversation-level and unsupported here.
    typing: async () => unsupported("whatsapp_business", "typing"),
    read: async () => unsupported("whatsapp_business", "read"),
    readReceipt: async () => unsupported("whatsapp_business", "readReceipt"),
    sendFile: async (file: AttachmentSend, sendOpts) => {
      if (!file.path && !file.data) {
        throw new Error("whatsapp_business sendFile needs a hosted link via wa.document/image");
      }
      unsupported(
        "whatsapp_business",
        "sendFile with raw bytes (use wa.image/wa.document with a hosted link or media id)"
      );
      void sendOpts;
    },
    reachable: async () => true,
    contact: async () => null,
    group: {
      setName: () => unsupported("whatsapp_business", "group.setName"),
      add: () => unsupported("whatsapp_business", "group.add"),
      remove: () => unsupported("whatsapp_business", "group.remove"),
      participants: async () => unsupported("whatsapp_business", "group.participants"),
    },
  });


  const makeTerminalChannel = (to: string): Channel => {
    const line = lineFor(to);
    const session = line.terminal;
    if (!session) {
      throw new Error(`terminal session not ready for ${to}`);
    }

    const sendText = async (
      content: string | Content,
      sendOpts?: SendOptions
    ): Promise<SendReceipt> => {
      const parsed = toContent(content);
      if (parsed.type !== "text") {
        unsupported("terminal", `sending ${parsed.type} content`);
      }
      const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
      session.write(`${prefix}${parsed.text}`);
      return { guid: `term-${Date.now()}`, sentAt: new Date() };
    };

    return {
      to,
      get phone() {
        return to;
      },
      platform: "terminal",
      send: sendText,
      reply: (messageGuid, content, sendOpts) =>
        sendText(content, { ...sendOpts, replyTo: messageGuid }),
      react: async (messageGuid, reaction, reactOpts) => {
        session.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      edit: async (messageGuid, newText) => {
        session.write(`agent edited ${messageGuid}: ${newText}`);
      },
      unsend: async (messageGuid) => {
        session.write(`agent unsent ${messageGuid}`);
      },
      typing: async (on = true) => {
        if (on) {
          session.write("agent is typing…");
        }
      },
      read: async () => {},
      readReceipt: async () => {},
      sendFile: async () => unsupported("terminal", "sendFile"),
      reachable: async () => true,
      contact: async () => null,
      group: {
        setName: () => unsupported("terminal", "group.setName"),
        add: () => unsupported("terminal", "group.add"),
        remove: () => unsupported("terminal", "group.remove"),
        participants: async () => unsupported("terminal", "group.participants"),
      },
    };
  };

  /** Dispatch to the right channel factory based on the line's platform. */
  const makeChannel = (to: string): Channel => {
    const platform = live.get(to)?.platform;
    if (platform === "terminal") {
      return makeTerminalChannel(to);
    }
    if (platform === "whatsapp_business") {
      return makeWhatsappBusinessChannel(to);
    }
    return platform === "whatsapp"
      ? makeWhatsappChannel(to)
      : makeImessageChannel(to);
  };

  const toGroupCtx = (
    fallbackHandle: string,
    g?: InboundGroup
  ): GroupContext | undefined =>
    g
      ? {
          chatId: g.chatId,
          isGroup: g.isGroup,
          participant: { id: g.participant ?? fallbackHandle },
          participants: g.participants?.map((id) => ({ id })),
        }
      : undefined;

  const senderUser = (id: string | undefined, fallback: string): User => ({
    id: id ?? fallback,
  });

  const connectImessageLine = async (line: ResolvedLine): Promise<void> => {
    if (!line.phone) {
      return;
    }
    const grpc = new ImessageGrpcClient(
      grpcTarget(line.address),
      line.token || "",
      opts.projectId ?? "local"
    );
    try {
      await grpc.waitForReady();
    } catch {
      grpc.close();
      return; // line stays not-ready
    }
    const to = line.phone;
    const channel = makeImessageChannel(to);

    const messageStream = grpc.subscribeEvents({
      onReceived(text, senderId, date, group) {
        queue.push([
          channel,
          {
            platform: "imessage",
            content: { type: "text", text },
            sender: senderUser(senderId, to),
            timestamp: date,
            isFromMe: false,
            group: toGroupCtx(to, group),
          },
        ]);
      },
      onApp(card, senderId, date, group) {
        queue.push([
          channel,
          {
            platform: "imessage",
            content: {
              type: "app",
              appId: card.appId,
              caption: card.caption,
              summary: card.summary,
              data: card.data,
            },
            sender: senderUser(senderId, to),
            timestamp: date,
            isFromMe: false,
            group: toGroupCtx(to, group),
          },
        ]);
      },
      onFlow(submission, senderId, date, group) {
        queue.push([
          channel,
          {
            platform: "imessage",
            content: {
              type: "flow",
              appId: submission.appId,
              state: submission.state,
              screen: submission.screen,
              done: submission.done,
              payment: submission.payment,
            },
            sender: senderUser(senderId, to),
            timestamp: date,
            isFromMe: false,
            group: toGroupCtx(to, group),
          },
        ]);
      },
      onReaction(reaction, senderId, date, group) {
        emitter.emit(
          "reaction",
          {
            platform: "imessage",
            messageGuid: reaction.messageGuid,
            reaction: reaction.reaction,
            removed: reaction.removed,
            sender: senderUser(senderId, to),
            timestamp: date,
            group: toGroupCtx(to, group),
          },
          channel
        );
      },
      onEdit(edit, senderId, date, group) {
        emitter.emit(
          "edited",
          {
            platform: "imessage",
            messageGuid: edit.messageGuid,
            text: edit.text,
            sender: senderUser(senderId, to),
            timestamp: date,
            group: toGroupCtx(to, group),
          },
          channel
        );
      },
      onUnsend(messageGuid, senderId, date, group) {
        emitter.emit(
          "unsent",
          {
            platform: "imessage",
            messageGuid,
            sender: senderUser(senderId, to),
            timestamp: date,
            group: toGroupCtx(to, group),
          },
          channel
        );
      },
      onSendError(err) {
        emitter.emit(
          "error",
          {
            platform: "imessage",
            to,
            code: err.code,
            message: err.message,
            timestamp: new Date(),
          },
          channel
        );
      },
    });

    const chatStream = grpc.subscribeChatEvents({
      onTyping(typing, date) {
        emitter.emit(
          "typing",
          {
            platform: "imessage",
            typing: typing.typing,
            sender: senderUser(typing.displayName, to),
            timestamp: date,
          },
          channel
        );
      },
      onRead(_read, date) {
        emitter.emit(
          "read",
          {
            platform: "imessage",
            sender: senderUser(undefined, to),
            timestamp: date,
          },
          channel
        );
      },
    });

    live.set(to, {
      grpc,
      platform: "imessage",
      streams: [messageStream, chatStream],
    });
    ready.add(to);
  };

  const connectWhatsappLine = async (line: ResolvedLine): Promise<void> => {
    if (!line.phone) {
      return;
    }
    const wa = new WhatsappGrpcClient(
      grpcTarget(line.address),
      line.token || "",
      opts.projectId ?? "local"
    );
    try {
      await wa.waitForReady();
    } catch {
      wa.close();
      return;
    }
    const to = line.phone;
    const channel = makeWhatsappChannel(to);
    const stream = wa.subscribeEvents({
      onText(msg, date) {
        queue.push([
          channel,
          {
            platform: "whatsapp",
            content: { type: "text", text: msg.text },
            sender: senderUser(msg.senderId, to),
            guid: msg.messageId,
            timestamp: date,
            isFromMe: false,
          },
        ]);
      },
    });
    live.set(to, { wa, platform: "whatsapp", streams: [stream] });
    ready.add(to);
  };

  /**
   * Register a WhatsApp Business line. There is no stream to open — inbound
   * arrives out-of-band through the webhook ingress — so this just constructs
   * the send client from the resolved Cloud API credentials and marks the
   * display number ready so `channel()` can send on it.
   */
  const connectWhatsappBusinessLine = (line: ResolvedLine): void => {
    if (!(line.phone && line.business)) {
      return;
    }
    const wb = new WhatsappBusinessClient({
      phoneNumberId: line.business.phoneNumberId,
      accessToken: line.business.accessToken,
      apiVersion: line.business.apiVersion,
    });
    live.set(line.phone, { wb, platform: "whatsapp_business", streams: [] });
    ready.add(line.phone);
  };

  const connectTerminal = (config: TerminalConfig): void => {
    const to = "terminal";
    let session: TerminalSession | undefined;

    const channel: Channel = {
      to,
      get phone() {
        return to;
      },
      platform: "terminal",
      send: async (content, sendOpts) => {
        const parsed = toContent(content);
        if (parsed.type !== "text") {
          unsupported("terminal", `sending ${parsed.type} content`);
        }
        const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
        session?.write(`${prefix}${parsed.text}`);
        return { guid: `term-${Date.now()}`, sentAt: new Date() };
      },
      reply: (messageGuid, content, sendOpts) =>
        channel.send(content, { ...sendOpts, replyTo: messageGuid }),
      react: async (messageGuid, reaction, reactOpts) => {
        session?.write(
          `agent reacted ${reactOpts?.remove ? "removed " : ""}${reaction} on ${messageGuid}`
        );
      },
      edit: async (messageGuid, newText) => {
        session?.write(`agent edited ${messageGuid}: ${newText}`);
      },
      unsend: async (messageGuid) => {
        session?.write(`agent unsent ${messageGuid}`);
      },
      typing: async (on = true) => {
        if (on) {
          session?.write("agent is typing…");
        }
      },
      read: async () => {},
      readReceipt: async () => {},
      sendFile: async () => unsupported("terminal", "sendFile"),
      reachable: async () => true,
      contact: async () => null,
      group: {
        setName: () => unsupported("terminal", "group.setName"),
        add: () => unsupported("terminal", "group.add"),
        remove: () => unsupported("terminal", "group.remove"),
        participants: async () => unsupported("terminal", "group.participants"),
      },
    };

    session = startTerminalSession({
      prompt: config.prompt ?? "you> ",
      onLine: (line) => {
        queue.push([
          channel,
          {
            platform: "terminal",
            content: { type: "text", text: line },
            sender: { id: "you", displayName: "You" },
            guid: `term-in-${Date.now()}`,
            timestamp: new Date(),
            isFromMe: false,
          },
        ]);
      },
    });

    live.set(to, { platform: "terminal", terminal: session, streams: [] });
    ready.add(to);
  };

  const connectLines = async (
    platform: Platform,
    lines: ResolvedLine[]
  ): Promise<void> => {
    if (platform === "imessage") {
      await Promise.all(lines.map(connectImessageLine));
      return;
    }
    if (platform === "whatsapp") {
      await Promise.all(lines.map(connectWhatsappLine));
      return;
    }
    // WhatsApp Business: cloud send client per bound number; inbound is webhook.
    for (const line of lines) {
      connectWhatsappBusinessLine(line);
    }
  };

  for (const provider of opts.providers) {
    if (provider.platform === "terminal") {
      connectTerminal(provider);
      continue;
    }

    if (provider.mode === "dedicated") {
      let lines: ResolvedLine[];
      if (provider.platform === "imessage") {
        lines = dedicatedLines(provider);
      } else if (provider.platform === "whatsapp_business") {
        lines = whatsappBusinessDedicatedLines(provider);
      } else {
        lines = whatsappDedicatedLines(provider);
      }
      await connectLines(provider.platform, lines);
      continue;
    }

    if (!(opts.projectId && opts.projectSecret)) {
      throw new Error(
        "cloud mode requires projectId + projectSecret (or use dedicated lines)"
      );
    }
    const platform = provider.platform;
    const resolved = await broker.resolve(
      { projectId: opts.projectId, projectSecret: opts.projectSecret },
      platform
    );
    await connectLines(platform, resolved.lines);

    const scheduleNext = (ttl: number) => {
      broker.scheduleRefresh(ttl, async () => {
        try {
          const next = await broker.resolve(
            { projectId: opts.projectId!, projectSecret: opts.projectSecret! },
            platform
          );
          await connectLines(
            platform,
            next.lines.filter((l) => !live.has(l.phone))
          );
          scheduleNext(next.ttl);
        } catch {
          scheduleNext(ttl);
        }
      });
    };
    scheduleNext(resolved.ttl);
  }

  const resolveTarget = (target: string | ChannelTarget): string =>
    typeof target === "string" ? target : target.to;

  const incoming = queue.iterator();

  return {
    channel: (target) => makeChannel(resolveTarget(target)),
    space: (handle) => makeChannel(handle),
    incoming,
    messages: incoming,
    on: (event, handler) => emitter.on(event, handler),
    ready,
    readyPhones: ready,
    async close() {
      broker.cancelRefresh();
      for (const line of live.values()) {
        for (const stream of line.streams) {
          stream.cancel();
        }
        line.grpc?.close();
        line.wa?.close();
        line.wb?.close();
        line.terminal?.close();
      }
      live.clear();
      queue.done();
    },
  };
}

export { imessage } from "./providers/imessage";
export { terminal } from "./providers/terminal";
export { whatsapp, whatsappBusiness } from "./providers/whatsapp";
export { app, flow, isWaContent, payment, text, wa } from "./content";
export type {
  AppMessage,
  AttachmentSend,
  Content,
  Effect,
  FlowMessage,
  PaymentRequest,
  Reaction,
  SendOptions,
  Tapback,
  TextMessage,
  WaContactsContent,
  WaContent,
  WaInteractiveContent,
  WaLocationContent,
  WaMediaContent,
  WaTemplateContent,
} from "./content";
export {
  WhatsappBusinessClient,
  WhatsappBusinessError,
} from "./transport/whatsapp-business-rest";
export type {
  WaLocation,
  WaMediaRef,
  WaSendResult,
  WhatsappBusinessCreds,
} from "./transport/whatsapp-business-rest";
export { EFFECTS } from "./content";
export { defineFlow } from "./miniapp/experience";
export { heroCard, paymentCard } from "./miniapp/presets";
export { readState, type FlowStateReader } from "./miniapp/state";
export type {
  Action,
  CapabilityName,
  Component,
  ComponentTemplate,
  Flow,
  FlowState,
  Option,
  PaymentProvider,
  Screen,
  Style,
} from "./miniapp/experience";
export type {
  InboundApp,
  InboundFlow,
  InboundGroup,
  InboundPayment,
} from "./transport/imessage-grpc";
export type {
  AppContent,
  Channel,
  ChannelTarget,
  Contact,
  EditSignal,
  GroupOps,
  FlowContent,
  GroupContext,
  Message,
  MessageContent,
  PaymentReceipt,
  Platform,
  ReactionSignal,
  ReadSignal,
  SendErrorSignal,
  SendReceipt,
  SignalMap,
  SignalName,
  Space,
  SkylineApp,
  TextContent,
  TypingSignal,
  UnsendSignal,
  User,
} from "./types";
export { BrokerError } from "./broker";
export { LiveSession, session } from "./session";
export type { LiveSessionOptions, SessionSnapshot } from "./session";
export {
  parseWebhook,
  verifyWebhook,
  WEBHOOK_HEADERS,
} from "./webhooks";
export type {
  SkylineAttachment,
  SkylineEvent,
  SkylineEventDataMap,
  SkylineEventType,
  SkylineFailedEvent,
  SkylineGroupUpdateEvent,
  SkylineMessageEvent,
  SkylineReactionEvent,
  SkylineReadEvent,
  SkylineService,
  SkylineTypingEvent,
  VerifyOptions,
} from "./webhooks";
