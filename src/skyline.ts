// Skyline — the unified messaging SDK. One project, one credential pair, every
// platform. `Skyline({ projectId, projectSecret, providers })` resolves lines
// (via the cloud broker by default, or dedicated endpoints you supply), connects
// them, and gives you a merged `app.incoming` feed, `app.on(event)` signals, and
// a `channel()` you send/react/type on — all over one fast per-line transport.

import { Broker } from "./broker";
import { issueSlackTokens } from "./cloud/slack-tokens";
import {
  type AttachmentSend,
  type Content,
  type Reaction,
  resolveEffect,
  type SendOptions,
  toContent,
} from "./content";
import {
  slackDedicatedLines,
  type WhatsappBusinessConfig,
  type WhatsappConfig,
  whatsappBusinessDedicatedLines,
  whatsappDedicatedLines,
} from "./providers";
import { dedicatedLines, type ImessageConfig } from "./providers/imessage";
import type { SlackConfig } from "./providers/slack";
import type { TerminalConfig } from "./providers/terminal";
import { connectDiscordGateway } from "./transport/discord-gateway";
import { DiscordClient } from "./transport/discord-rest";
import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
  type InboundGroup,
  type SendWireOptions,
} from "./transport/imessage-grpc";
import { SlackGrpcClient, slackGrpcTarget } from "./transport/slack-grpc";
import { SlackClient } from "./transport/slack-rest";
import { connectSlackSocket } from "./transport/slack-socket";
import {
  startTerminalSession,
  type TerminalSession,
} from "./transport/terminal";
import {
  type WaSendResult,
  WhatsappBusinessClient,
} from "./transport/whatsapp-business-rest";
import { WhatsappGrpcClient } from "./transport/whatsapp-grpc";
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

export type ProviderConfig =
  | ImessageConfig
  | SlackConfig
  | WhatsappConfig
  | WhatsappBusinessConfig
  | TerminalConfig;

export interface SkylineOptions {
  /** Project credentials (cloud mode). Optional if every provider is dedicated. */
  projectId?: string;
  projectSecret?: string;
  /** Providers to enable. */
  providers: ProviderConfig[];
}

interface InboundQueue {
  done(): void;
  iterator(): AsyncIterable<[Channel, Message]>;
  push(item: [Channel, Message]): void;
}

function createQueue(): InboundQueue {
  const buffer: [Channel, Message][] = [];
  let resolveNext: (() => void) | null = null;
  let finished = false;

  return {
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
    push(item) {
      buffer.push(item);
      resolveNext?.();
      resolveNext = null;
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
      return () =>
        set.delete(handler as (signal: unknown, channel: Channel) => void);
    },
  };
}

interface LiveLine {
  discord?: DiscordClient;
  discordApplicationId?: string;
  discordGuildId?: string;
  grpc?: ImessageGrpcClient;
  platform: Platform;
  slack?: SlackClient | SlackGrpcClient;
  slackBotUserId?: string;
  slackTeamId?: string;
  streams: { cancel: () => void }[];
  terminal?: TerminalSession;
  wa?: WhatsappGrpcClient;
  wb?: WhatsappBusinessClient;
}

/** A verb this platform does not support raises a clear, catchable error. */
function unsupported(platform: Platform, verb: string): never {
  throw new Error(`${verb} is not supported on ${platform}`);
}

async function readAttachmentBytes(file: AttachmentSend): Promise<Uint8Array> {
  if (file.data) {
    return file.data instanceof Uint8Array
      ? file.data
      : new Uint8Array(file.data);
  }
  if (file.path) {
    const buf = await Bun.file(file.path).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error("sendFile requires file.data or file.path");
}

export async function Skyline(opts: SkylineOptions): Promise<SkylineApp> {
  const queue = createQueue();
  const emitter = createEmitter();
  const live = new Map<string, LiveLine>();
  const ready = new Set<string>();
  const broker = new Broker();

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

  const wbFor = (_to: string): WhatsappBusinessClient => {
    const line = lineForPlatform("whatsapp_business");
    if (!line.wb) {
      throw new Error("whatsapp_business client not ready");
    }
    return line.wb;
  };

  const lineForPlatform = (platform: Platform, scopeId?: string): LiveLine => {
    if (scopeId) {
      const scoped = live.get(scopeId);
      if (scoped?.platform === platform) {
        return scoped;
      }
    }
    for (const line of live.values()) {
      if (line.platform === platform) {
        return line;
      }
    }
    throw new Error(`no ready line for platform ${platform}`);
  };

  const slackFor = (teamId?: string): SlackClient | SlackGrpcClient => {
    const line = lineForPlatform("slack", teamId);
    if (!line.slack) {
      throw new Error("slack client not ready");
    }
    return line.slack;
  };

  const discordFor = (guildId?: string): DiscordClient => {
    const line = lineForPlatform("discord", guildId);
    if (!line.discord) {
      throw new Error("discord client not ready");
    }
    return line.discord;
  };

  const wireOpts = (sendOpts?: SendOptions): SendWireOptions => ({
    effectId: resolveEffect(sendOpts?.effect),
    replyTo: sendOpts?.replyTo,
    richLink: sendOpts?.richLink,
    scan: sendOpts?.scan,
    subject: sendOpts?.subject,
  });

  // A group is addressed by its chat guid directly; a DM by a bare handle we
  // wrap. Detect an already-formed chat guid so groups route unchanged.
  const chatGuidFor = (to: string): string =>
    /;[-+];/.test(to) || to.startsWith("chat") ? to : dmChatGuid(to);

  const sendContent = async (
    to: string,
    input: string | Content,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const grpc = imFor(to);
    const id = newId();
    const sentAt = new Date();
    const content = toContent(input);
    const chatGuid = chatGuidFor(to);
    let guid: string | undefined;
    switch (content.type) {
      case "text": {
        const res = await grpc.send(
          chatGuid,
          content.text,
          id,
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "app": {
        const res = await grpc.sendApp(
          chatGuid,
          {
            ...content,
            effect: resolveEffect(sendOpts?.effect) ?? content.effect,
          },
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
            appStoreId: content.appStoreId,
            bundleId: content.bundleId,
            caption: content.caption,
            image: content.image,
            screen: content.screen,
            spec: content.flow,
            state,
            subcaption: content.subcaption,
            summary: content.summary,
            teamId: content.teamId,
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
      contact: async () => {
        const card = await imFor(to).getContactCard(to);
        if (!card) {
          return null;
        }
        return {
          address: card.address,
          emails: card.emails ?? [],
          firstName: card.first_name || undefined,
          fullName: card.full_name || undefined,
          isContact: Boolean(card.is_contact),
          lastName: card.last_name || undefined,
          organization: card.organization || undefined,
          phones: card.phones ?? [],
        };
      },
      edit: (messageGuid, newText) =>
        imFor(to).editMessage(chatGuid, messageGuid, newText),
      group: {
        add: (handle) => imFor(to).addParticipant(chatGuid, handle),
        participants: async () => {
          const rows = await imFor(to).getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
        remove: (handle) => imFor(to).removeParticipant(chatGuid, handle),
        setName: (name) => imFor(to).setGroupName(chatGuid, name),
      },
      get phone() {
        return to;
      },
      platform: "imessage",
      reachable: () => imFor(to).checkAvailability(to, "imessage"),
      react: (messageGuid, reaction: Reaction, reactOpts) =>
        imFor(to).sendReaction(chatGuid, messageGuid, reaction, {
          remove: reactOpts?.remove,
        }),
      read: () => imFor(to).markRead(chatGuid),
      readReceipt: () => imFor(to).sendReadReceipt(chatGuid),
      reply: (messageGuid, content, sendOpts) =>
        sendContent(to, content, { ...sendOpts, replyTo: messageGuid }),
      send: (content, sendOpts) => sendContent(to, content, sendOpts),
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
            attachmentName: file.name,
            attachmentPath: file.path,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
          },
          wireOpts(sendOpts)
        );
        return { guid: res.guid, sentAt };
      },
      to,
      typing: async (on = true) => {
        const grpc = imFor(to);
        await (on ? grpc.startTyping(chatGuid) : grpc.stopTyping(chatGuid));
      },
      unsend: (messageGuid) => imFor(to).unsendMessage(chatGuid, messageGuid),
    };
  };

  /**
   * A WhatsApp channel. WhatsApp personal supports text/reply/react over its own
   * gRPC transport; the iMessage-only affordances (effects, typing/read receipts,
   * group admin, contact cards) raise a clear "not supported" error so callers
   * can branch on `channel.platform`.
   */
  const makeWhatsappChannel = (to: string): Channel => ({
    contact: async () => null,
    edit: () => unsupported("whatsapp", "edit"),
    group: {
      add: () => unsupported("whatsapp", "group.add"),
      participants: async () => unsupported("whatsapp", "group.participants"),
      remove: () => unsupported("whatsapp", "group.remove"),
      setName: () => unsupported("whatsapp", "group.setName"),
    },
    get phone() {
      return to;
    },
    platform: "whatsapp",
    reachable: async () => true,
    react: (messageGuid, reaction: Reaction, reactOpts) =>
      waFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      ),
    read: async () => unsupported("whatsapp", "read"),
    readReceipt: async () => unsupported("whatsapp", "readReceipt"),
    reply: async (messageGuid, content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        unsupported("whatsapp", `replying with ${c.type} content`);
      }
      const res = await waFor(to).sendText(to, c.text, newId(), messageGuid);
      void sendOpts;
      return { guid: res.messageId, sentAt: new Date() };
    },
    send: async (content, sendOpts) => {
      const c = toContent(content);
      if (c.type !== "text") {
        unsupported("whatsapp", `sending ${c.type} content`);
      }
      const res = await waFor(to).sendText(
        to,
        c.text,
        newId(),
        sendOpts?.replyTo
      );
      return { guid: res.messageId, sentAt: new Date() };
    },
    sendFile: async () => unsupported("whatsapp", "sendFile"),
    to,
    typing: async () => unsupported("whatsapp", "typing"),
    unsend: () => unsupported("whatsapp", "unsend"),
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
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const wb = wbFor(to);
    const content = toContent(input);
    const replyTo = sendOpts?.replyTo;
    let res: WaSendResult;
    switch (content.type) {
      case "text":
        res = await wb.sendText(to, content.text, {
          previewUrl: sendOpts?.richLink,
          replyTo,
        });
        break;
      case "wa_media":
        res = await wb.sendMedia(
          to,
          content.kind,
          {
            caption: content.caption,
            filename: content.filename,
            id: content.id,
            link: content.link,
          },
          { replyTo }
        );
        break;
      case "wa_template":
        res = await wb.sendTemplate(
          to,
          {
            components: content.components,
            language: { code: content.language },
            name: content.name,
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
            address: content.address,
            latitude: content.latitude,
            longitude: content.longitude,
            name: content.name,
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
    contact: async () => null,
    edit: () => unsupported("whatsapp_business", "edit"),
    group: {
      add: () => unsupported("whatsapp_business", "group.add"),
      participants: async () =>
        unsupported("whatsapp_business", "group.participants"),
      remove: () => unsupported("whatsapp_business", "group.remove"),
      setName: () => unsupported("whatsapp_business", "group.setName"),
    },
    get phone() {
      return to;
    },
    platform: "whatsapp_business",
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      await wbFor(to).sendReaction(
        to,
        messageGuid,
        reactOpts?.remove ? "" : reaction
      );
    },
    read: async () => unsupported("whatsapp_business", "read"),
    readReceipt: async () => unsupported("whatsapp_business", "readReceipt"),
    reply: (messageGuid, content, sendOpts) =>
      sendWaBusiness(to, content, { ...sendOpts, replyTo: messageGuid }),
    send: (content, sendOpts) => sendWaBusiness(to, content, sendOpts),
    sendFile: async (file: AttachmentSend, sendOpts) => {
      if (!(file.path || file.data)) {
        throw new Error(
          "whatsapp_business sendFile needs a hosted link via wa.document/image"
        );
      }
      unsupported(
        "whatsapp_business",
        "sendFile with raw bytes (use wa.image/wa.document with a hosted link or media id)"
      );
      void sendOpts;
    },
    to,
    // The Cloud API ties typing/read to a specific inbound message id, so the
    // richer `channel.readReceipt(messageId)` path carries it; the argument-free
    // `typing()`/`read()` are conversation-level and unsupported here.
    typing: async () => unsupported("whatsapp_business", "typing"),
    unsend: () => unsupported("whatsapp_business", "unsend"),
  });

  const makeSlackChannel = (to: string, teamId?: string): Channel => ({
    contact: async () => null,
    edit: async (messageGuid, newText) => {
      await slackFor(teamId).editText(to, messageGuid, newText);
    },
    group: {
      add: () => unsupported("slack", "group.add"),
      participants: async () => unsupported("slack", "group.participants"),
      remove: () => unsupported("slack", "group.remove"),
      setName: () => unsupported("slack", "group.setName"),
    },
    get phone() {
      return to;
    },
    platform: "slack",
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      const client = slackFor(teamId);
      if (reactOpts?.remove) {
        await client.removeReaction(to, messageGuid, reaction);
      } else {
        await client.addReaction(to, messageGuid, reaction);
      }
    },
    // Slack has no conversation-level typing/read in the Web API path we use;
    // accept the call as a no-op so multi-platform agents stay portable.
    read: async () => {},
    readReceipt: async () => {},
    reply: (messageGuid, content, sendOpts) =>
      makeSlackChannel(to, teamId).send(content, {
        ...sendOpts,
        replyTo: messageGuid,
      }),
    send: async (content, sendOpts) => {
      const parsed = toContent(content);
      if (parsed.type !== "text") {
        unsupported("slack", `sending ${parsed.type} content`);
      }
      const res = await slackFor(teamId).sendText(to, parsed.text, {
        replyTo: sendOpts?.replyTo,
      });
      return { guid: res.messageId, sentAt: new Date() };
    },
    sendFile: async (file, sendOpts) => {
      const bytes = await readAttachmentBytes(file);
      const res = await slackFor(teamId).uploadFile(
        to,
        {
          data: bytes,
          name: file.name ?? "attachment",
        },
        { replyTo: sendOpts?.replyTo }
      );
      return { guid: res.messageId, sentAt: new Date() };
    },
    to,
    typing: async () => {},
    unsend: async (messageGuid) => {
      await slackFor(teamId).deleteMessage(to, messageGuid);
    },
  });

  const makeDiscordChannel = (to: string, guildId?: string): Channel => ({
    contact: async () => null,
    edit: async (messageGuid, newText) => {
      await discordFor(guildId).editText(to, messageGuid, newText);
    },
    group: {
      add: () => unsupported("discord", "group.add"),
      participants: async () => unsupported("discord", "group.participants"),
      remove: () => unsupported("discord", "group.remove"),
      setName: () => unsupported("discord", "group.setName"),
    },
    get phone() {
      return to;
    },
    platform: "discord",
    reachable: async () => true,
    react: async (messageGuid, reaction: Reaction, reactOpts) => {
      const client = discordFor(guildId);
      if (reactOpts?.remove) {
        await client.removeReaction(to, messageGuid, reaction);
      } else {
        await client.addReaction(to, messageGuid, reaction);
      }
    },
    read: async () => {},
    readReceipt: async () => {},
    reply: (messageGuid, content, sendOpts) =>
      makeDiscordChannel(to, guildId).send(content, {
        ...sendOpts,
        replyTo: messageGuid,
      }),
    send: async (content, sendOpts) => {
      const parsed = toContent(content);
      if (parsed.type !== "text") {
        unsupported("discord", `sending ${parsed.type} content`);
      }
      const res = await discordFor(guildId).sendText(to, parsed.text, {
        replyTo: sendOpts?.replyTo,
      });
      return { guid: res.messageId, sentAt: new Date() };
    },
    sendFile: async (file, sendOpts) => {
      const bytes = await readAttachmentBytes(file);
      const res = await discordFor(guildId).uploadFile(
        to,
        {
          data: bytes,
          name: file.name ?? "attachment",
        },
        { replyTo: sendOpts?.replyTo }
      );
      return { guid: res.messageId, sentAt: new Date() };
    },
    to,
    typing: async (on = true) => {
      if (on) {
        await discordFor(guildId).typing(to);
      }
    },
    unsend: async (messageGuid) => {
      await discordFor(guildId).deleteMessage(to, messageGuid);
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
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session.write(`agent edited ${messageGuid}: ${newText}`);
      },
      group: {
        add: () => unsupported("terminal", "group.add"),
        participants: async () => unsupported("terminal", "group.participants"),
        remove: () => unsupported("terminal", "group.remove"),
        setName: () => unsupported("terminal", "group.setName"),
      },
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
        sendText(content, { ...sendOpts, replyTo: messageGuid }),
      send: sendText,
      sendFile: async () => unsupported("terminal", "sendFile"),
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

  /** Dispatch to the right channel factory based on the line's platform. */
  const makeChannel = (to: string, platformHint?: Platform): Channel => {
    const keyed = live.get(to)?.platform;
    const platform =
      platformHint ??
      keyed ??
      (live.size === 1 ? live.values().next().value?.platform : undefined);
    if (platform === "terminal") {
      return makeTerminalChannel(to);
    }
    if (platform === "whatsapp_business") {
      return makeWhatsappBusinessChannel(to);
    }
    if (platform === "slack") {
      return makeSlackChannel(to);
    }
    if (platform === "discord") {
      return makeDiscordChannel(to);
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
      onApp(card, senderId, date, group) {
        queue.push([
          channel,
          {
            content: {
              appId: card.appId,
              caption: card.caption,
              data: card.data,
              summary: card.summary,
              type: "app",
            },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onEdit(edit, senderId, date, group) {
        emitter.emit(
          "edited",
          {
            group: toGroupCtx(to, group),
            messageGuid: edit.messageGuid,
            platform: "imessage",
            sender: senderUser(senderId, to),
            text: edit.text,
            timestamp: date,
          },
          channel
        );
      },
      onFlow(submission, senderId, date, group) {
        queue.push([
          channel,
          {
            content: {
              appId: submission.appId,
              done: submission.done,
              payment: submission.payment,
              screen: submission.screen,
              state: submission.state,
              type: "flow",
            },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onReaction(reaction, senderId, date, group) {
        emitter.emit(
          "reaction",
          {
            group: toGroupCtx(to, group),
            messageGuid: reaction.messageGuid,
            platform: "imessage",
            reaction: reaction.reaction,
            removed: reaction.removed,
            sender: senderUser(senderId, to),
            timestamp: date,
          },
          channel
        );
      },
      onReceived(text, senderId, date, group) {
        queue.push([
          channel,
          {
            content: { text, type: "text" },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onSendError(err) {
        emitter.emit(
          "error",
          {
            code: err.code,
            message: err.message,
            platform: "imessage",
            timestamp: new Date(),
            to,
          },
          channel
        );
      },
      onUnsend(messageGuid, senderId, date, group) {
        emitter.emit(
          "unsent",
          {
            group: toGroupCtx(to, group),
            messageGuid,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
          channel
        );
      },
    });

    const chatStream = grpc.subscribeChatEvents({
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
      onTyping(typing, date) {
        emitter.emit(
          "typing",
          {
            platform: "imessage",
            sender: senderUser(typing.displayName, to),
            timestamp: date,
            typing: typing.typing,
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
            content: { text: msg.text, type: "text" },
            guid: msg.messageId,
            isFromMe: false,
            platform: "whatsapp",
            sender: senderUser(msg.senderId, to),
            timestamp: date,
          },
        ]);
      },
    });
    live.set(to, { platform: "whatsapp", streams: [stream], wa });
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
      accessToken: line.business.accessToken,
      apiVersion: line.business.apiVersion,
      phoneNumberId: line.business.phoneNumberId,
    });
    live.set(line.phone, { platform: "whatsapp_business", streams: [], wb });
    ready.add(line.phone);
  };

  const connectSlackLine = (line: ResolvedLine): void => {
    if (!line.slack) {
      return;
    }
    const teamId = line.slack.teamId ?? line.phone ?? "slack";
    const botUserId = line.slack.team?.botUserId;
    const key = line.phone || teamId;
    const streams: { cancel: () => void }[] = [];

    const accessToken = line.slack.accessToken ?? line.token;
    const useGrpc =
      Boolean(line.slack.accessToken) ||
      Boolean(line.address && !line.slack.botToken?.startsWith("xoxb-"));

    if (useGrpc && accessToken) {
      const client = new SlackGrpcClient(
        slackGrpcTarget(line.slack.endpoint || line.address),
        teamId,
        accessToken
      );
      const sub = client.subscribe({
        onReaction(event) {
          const channel = makeSlackChannel(event.channelId, teamId);
          emitter.emit(
            "reaction",
            {
              messageGuid: event.messageId,
              platform: "slack",
              reaction: event.emoji,
              removed: event.removed,
              sender: { id: event.userId },
              timestamp: new Date(),
            },
            channel
          );
        },
        onText(event) {
          const channel = makeSlackChannel(event.channelId, teamId);
          queue.push([
            channel,
            {
              content: { text: event.text, type: "text" },
              guid: event.messageId,
              isFromMe: event.isFromMe,
              platform: "slack",
              sender: { id: event.userId },
              slack: {
                subtype: event.subtype,
                teamId,
                threadTs: event.threadTs,
                ts: event.messageId,
              },
              timestamp: new Date(),
            },
          ]);
        },
      });
      streams.push(sub);
      live.set(key, {
        platform: "slack",
        slack: client,
        slackBotUserId: botUserId,
        slackTeamId: teamId,
        streams,
      });
      ready.add(key);
      return;
    }

    if (!line.slack.botToken) {
      return;
    }
    const client = new SlackClient({
      baseUrl: line.slack.endpoint,
      botToken: line.slack.botToken,
    });

    if (line.slack.appToken) {
      const socket = connectSlackSocket({
        appToken: line.slack.appToken,
        handlers: {
          onEdited(event) {
            if (!event.channelId) {
              return;
            }
            const channel = makeSlackChannel(event.channelId, teamId);
            emitter.emit(
              "edited",
              {
                messageGuid: event.messageId,
                platform: "slack",
                sender: { id: event.userId },
                text: event.text,
                timestamp: new Date(),
              },
              channel
            );
          },
          onReaction(event) {
            const channel = makeSlackChannel(event.channelId, teamId);
            emitter.emit(
              "reaction",
              {
                messageGuid: event.messageId,
                platform: "slack",
                reaction: event.emoji,
                removed: event.removed,
                sender: { id: event.userId },
                timestamp: new Date(),
              },
              channel
            );
          },
          onText(event) {
            const isFromMe =
              Boolean(botUserId && event.userId === botUserId) ||
              Boolean(event.isBot);
            const channel = makeSlackChannel(event.channelId, teamId);
            queue.push([
              channel,
              {
                content: { text: event.text, type: "text" },
                guid: event.messageId,
                isFromMe,
                platform: "slack",
                sender: { id: event.userId },
                slack: {
                  subtype: event.subtype,
                  teamId,
                  threadTs: event.threadTs,
                  ts: event.messageId,
                },
                timestamp: new Date(),
              },
            ]);
          },
        },
      });
      streams.push(socket);
    }

    live.set(key, {
      platform: "slack",
      slack: client,
      slackBotUserId: botUserId,
      slackTeamId: teamId,
      streams,
    });
    ready.add(key);
  };

  const connectDiscordLine = (line: ResolvedLine): void => {
    if (!line.discord) {
      return;
    }
    const guildId = line.discord.guildId;
    const applicationId =
      line.discord.applicationId ?? line.discord.guild?.applicationId;
    const key = line.phone || guildId || "discord";
    const client = new DiscordClient({
      baseUrl: line.discord.endpoint,
      botToken: line.discord.botToken,
    });
    const gateway = connectDiscordGateway({
      botToken: line.discord.botToken,
      handlers: {
        onEdited(event) {
          const channel = makeDiscordChannel(event.channelId, guildId);
          emitter.emit(
            "edited",
            {
              messageGuid: event.messageId,
              platform: "discord",
              sender: { id: event.authorId },
              text: event.text,
              timestamp: new Date(),
            },
            channel
          );
        },
        onReaction(event) {
          const channel = makeDiscordChannel(event.channelId, guildId);
          emitter.emit(
            "reaction",
            {
              messageGuid: event.messageId,
              platform: "discord",
              reaction: event.emoji,
              removed: event.removed,
              sender: { id: event.userId },
              timestamp: new Date(),
            },
            channel
          );
        },
        onText(event) {
          const channel = makeDiscordChannel(event.channelId, guildId);
          queue.push([
            channel,
            {
              content: { text: event.text, type: "text" },
              discord: {
                applicationId,
                guildId: event.guildId ?? guildId,
                messageId: event.messageId,
              },
              guid: event.messageId,
              isFromMe: Boolean(event.isBot),
              platform: "discord",
              sender: { id: event.authorId },
              timestamp: new Date(),
            },
          ]);
        },
      },
    });

    live.set(key, {
      discord: client,
      discordApplicationId: applicationId,
      discordGuildId: guildId,
      platform: "discord",
      streams: [gateway],
    });
    ready.add(key);
  };

  const connectTerminal = (config: TerminalConfig): void => {
    const to = "terminal";
    let session: TerminalSession | undefined;

    const channel: Channel = {
      contact: async () => null,
      edit: async (messageGuid, newText) => {
        session?.write(`agent edited ${messageGuid}: ${newText}`);
      },
      group: {
        add: () => unsupported("terminal", "group.add"),
        participants: async () => unsupported("terminal", "group.participants"),
        remove: () => unsupported("terminal", "group.remove"),
        setName: () => unsupported("terminal", "group.setName"),
      },
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
      send: async (content, sendOpts) => {
        const parsed = toContent(content);
        if (parsed.type !== "text") {
          unsupported("terminal", `sending ${parsed.type} content`);
        }
        const prefix = sendOpts?.replyTo ? "↳ agent: " : "agent: ";
        session?.write(`${prefix}${parsed.text}`);
        return { guid: `term-${Date.now()}`, sentAt: new Date() };
      },
      sendFile: async () => unsupported("terminal", "sendFile"),
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
        queue.push([
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

    live.set(to, { platform: "terminal", streams: [], terminal: session });
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
    if (platform === "whatsapp_business") {
      for (const line of lines) {
        connectWhatsappBusinessLine(line);
      }
      return;
    }
    if (platform === "slack") {
      for (const line of lines) {
        connectSlackLine(line);
      }
      return;
    }
    if (platform === "discord") {
      for (const line of lines) {
        connectDiscordLine(line);
      }
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
      } else if (provider.platform === "slack") {
        lines = slackDedicatedLines(provider);
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

    if (platform === "slack") {
      const tokens = await issueSlackTokens(opts.projectId, opts.projectSecret);
      const resolved = await broker.resolve(
        { projectId: opts.projectId, projectSecret: opts.projectSecret },
        "slack"
      );
      const endpoint =
        resolved.lines[0]?.address ||
        process.env.SKYLINE_SLACK_ENDPOINT ||
        "slack-grpc.skyline.interactions.co.in:443";
      const lines: ResolvedLine[] = Object.entries(tokens.auth).map(
        ([teamId, accessToken]) => ({
          address: endpoint,
          phone: teamId,
          slack: {
            accessToken,
            endpoint,
            team: tokens.teams[teamId],
            teamId,
          },
          token: accessToken,
        })
      );
      await connectLines("slack", lines);

      const projectId = opts.projectId;
      const projectSecret = opts.projectSecret;
      const scheduleNext = (ttl: number) => {
        broker.scheduleRefresh(ttl, async () => {
          try {
            const next = await issueSlackTokens(projectId, projectSecret);
            for (const [teamId, accessToken] of Object.entries(next.auth)) {
              if (live.has(teamId)) {
                continue;
              }
              await connectLines("slack", [
                {
                  address: endpoint,
                  phone: teamId,
                  slack: {
                    accessToken,
                    endpoint,
                    team: next.teams[teamId],
                    teamId,
                  },
                  token: accessToken,
                },
              ]);
            }
            scheduleNext(next.expiresIn);
          } catch {
            scheduleNext(ttl);
          }
        });
      };
      scheduleNext(tokens.expiresIn);
      continue;
    }

    const resolved = await broker.resolve(
      { projectId: opts.projectId, projectSecret: opts.projectSecret },
      platform
    );
    await connectLines(platform, resolved.lines);

    const projectId = opts.projectId;
    const projectSecret = opts.projectSecret;
    const scheduleNext = (ttl: number) => {
      broker.scheduleRefresh(ttl, async () => {
        try {
          const next = await broker.resolve(
            { projectId, projectSecret },
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

  const resolveTarget = (
    target: string | ChannelTarget
  ): { platform?: Platform; to: string } =>
    typeof target === "string"
      ? { to: target }
      : { platform: target.platform, to: target.to };

  const incoming = queue.iterator();

  return {
    channel: (target) => {
      const resolved = resolveTarget(target);
      return makeChannel(resolved.to, resolved.platform);
    },
    async close() {
      broker.cancelRefresh();
      for (const line of live.values()) {
        for (const stream of line.streams) {
          stream.cancel();
        }
        line.grpc?.close();
        line.wa?.close();
        line.wb?.close();
        line.slack?.close();
        line.discord?.close();
        line.terminal?.close();
      }
      live.clear();
      queue.done();
    },
    incoming,
    messages: incoming,
    on: (event, handler) => emitter.on(event, handler),
    ready,
    readyPhones: ready,
    space: (handle) => makeChannel(handle),
  };
}
