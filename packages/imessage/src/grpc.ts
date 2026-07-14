import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export type FlowSpec = Record<string, unknown>;

const PACKAGE = "interactions.imessage.v1";

const INLINE_FLOW_URL_MAX = 1500;

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/[=]+$/, "");
}

export interface SendWireOptions {
  effectId?: string;
  replyTo?: string;
  richLink?: boolean;
  scan?: boolean;
  subject?: string;
}

export interface InboundAttachment {
  guid: string;
  mimeType?: string;
  name?: string;
  size?: number;
}

export interface InboundTextMessage {
  attachments?: InboundAttachment[];
  date: Date;
  group?: InboundGroup;
  guid?: string;
  isFromMe?: boolean;
  replyTo?: { messageGuid: string; partIndex?: number };
  senderId?: string;
  service?: string;
  text: string;
}

export interface InboundReaction {
  messageGuid: string;
  reaction: string;
  removed: boolean;
}

export interface InboundEdit {
  messageGuid: string;
  text: string;
}

export interface InboundTyping {
  chatId: string;
  displayName?: string;
  typing: boolean;
}

export interface InboundRead {
  chatId: string;
  isRead: boolean;
}

export interface InboundContact {
  address?: string;
  emails?: string[];
  first_name?: string;
  full_name?: string;
  has_image?: boolean;
  is_contact?: boolean;
  last_name?: string;
  nickname?: string;
  organization?: string;
  phones?: string[];
}

export interface AppCardWire {
  appId?: string;
  appStoreId?: number;
  bundleId?: string;
  caption?: string;
  data?: Record<string, string>;
  effect?: string;
  image?: string;
  imageSubtitle?: string;
  imageTitle?: string;
  interactive?: boolean;
  subcaption?: string;
  summary?: string;
  teamId?: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
  url: string;
}

export interface FlowCardWire {
    appId?: string;
  appStoreId?: number;
  bundleId?: string;
  caption?: string;
  image?: string;
    screen?: string;
    spec?: FlowSpec;
    state?: Record<string, string>;
  subcaption?: string;
  summary?: string;
  teamId?: string;
}

export interface InboundApp {
  appId?: string;
  caption?: string;
    data: Record<string, string>;
  summary?: string;
}

export function parseInboundApp(
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded balloon is dynamically typed.
  balloon: any
): InboundApp | null {
  const fields = balloon?.fields as Record<string, string> | undefined;
  if (!fields) {
    return null;
  }
  const data: Record<string, string> = {};
  let appId: string | undefined;
  let sawQuery = false;
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith("query.")) {
      continue;
    }
    sawQuery = true;
    const name = key.slice("query.".length);
    if (name === "appId") {
      appId = value;
    } else {
      data[name] = value;
    }
  }
  if (!(sawQuery && (appId || Object.keys(data).length > 0))) {
    return null;
  }
  return {
    appId,
    caption: fields.caption || balloon?.text || undefined,
    data,
    summary: fields.summary || undefined,
  };
}

export interface InboundPayment {
  amount: string;
  currency: string;
  paid: boolean;
  provider: string;
}

export interface InboundFlow {
  appId?: string;
    done: boolean;
    payment?: InboundPayment;
    screen?: string;
    state: Record<string, string>;
}

export interface InboundGroup {
  chatId: string;
  isGroup: boolean;
  participant?: string;
  participants?: string[];
}

export function parseInboundFlow(
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded balloon is dynamically typed.
  balloon: any
): InboundFlow | null {
  const fields = balloon?.fields as Record<string, string> | undefined;
  if (!fields) {
    return null;
  }
  const state: Record<string, string> = {};
  let appId: string | undefined;
  let screen: string | undefined;
  let done = false;
  let sawState = false;
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith("query.")) {
      continue;
    }
    const name = key.slice("query.".length);
    if (name === "appId") {
      appId = value;
    } else if (name === "screen") {
      screen = value;
    } else if (name === "done") {
      done = value === "1" || value === "true";
    } else if (name.startsWith("state.")) {
      sawState = true;
      state[name.slice("state.".length)] = value;
    }
  }
  if (!(sawState || done || screen)) {
    return null;
  }
  return { appId, done, payment: paymentFromState(state), screen, state };
}

export function paymentFromState(
  state: Record<string, string>
): InboundPayment | undefined {
  if (state.__paid !== "true" && state["payment.amount"] === undefined) {
    return;
  }
  return {
    amount: state["payment.amount"] ?? "0",
    currency: state["payment.currency"] ?? "USD",
    paid: state.__paid === "true",
    provider: state["payment.provider"] ?? "link",
  };
}

export function resolveGroup(
  // biome-ignore lint/suspicious/noExplicitAny: proto message is dynamically typed.
  msg: any,
  senderId: string | undefined
): InboundGroup | undefined {
  const chatGuids: string[] = Array.isArray(msg?.chat_guids)
    ? msg.chat_guids
    : [];
  const chatId = chatGuids[0];
  if (!chatId) {
    return;
  }
  const participants: string[] = Array.isArray(msg?.chat_participants)
    ? msg.chat_participants
        .map((p: { address?: string } | string) =>
          typeof p === "string" ? p : (p.address ?? "")
        )
        .filter(Boolean)
    : [];
  const isGroup =
    participants.length > 1 || /^(chat|iMessage;\+;|SMS;\+;)/.test(chatId);
  return {
    chatId,
    isGroup,
    participant: senderId,
    participants: participants.length ? participants : undefined,
  };
}

export class ImessageGrpcClient {
  private readonly client: grpc.Client;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly service: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly chat: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly groupSvc: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly addressSvc: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly pollSvc: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly faceTimeSvc: any;
  // biome-ignore lint/suspicious/noExplicitAny: proto-loaded service is dynamically typed.
  private readonly attachmentSvc: any;
  private readonly token: string;
  private readonly projectId: string;

  constructor(target: string, token: string, projectId = "local") {
    this.token = token;
    this.projectId = projectId;
    const protoDir = resolveProtoDir();
    const protoFiles = readdirSync(protoDir)
      .filter((f) => f.endsWith(".proto"))
      .map((f) => join(protoDir, f));

    const def = protoLoader.loadSync(protoFiles, {
      defaults: true,
      enums: String,
      includeDirs: [protoDir],
      keepCase: true,
      longs: String,
      oneofs: false,
    });

    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto package traversal.
    const loaded = grpc.loadPackageDefinition(def) as any;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto package traversal.
    const pkg = PACKAGE.split(".").reduce((o: any, k) => o[k], loaded);
    const creds = grpc.credentials.createInsecure();
    const MessageCtor = pkg.MessageService;
    this.client = new MessageCtor(target, creds);
    this.service = this.client;
    const shared = { "grpc.use_local_subchannel_pool": 0 };
    this.chat = new pkg.ChatService(target, creds, shared);
    this.groupSvc = new pkg.GroupService(target, creds, shared);
    this.addressSvc = new pkg.AddressService(target, creds, shared);
    this.pollSvc = new pkg.PollService(target, creds, shared);
    this.faceTimeSvc = new pkg.FaceTimeService(target, creds, shared);
    this.attachmentSvc = new pkg.AttachmentService(target, creds, shared);
  }

  private metadata(): grpc.Metadata {
    const md = new grpc.Metadata();
    if (this.token) {
      md.set("authorization", `Bearer ${this.token}`);
    }
    md.set("x-project-id", this.projectId);
    return md;
  }

  waitForReady(deadlineMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.waitForReady(new Date(Date.now() + deadlineMs), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

    send(
    chatGuid: string,
    message: string,
    clientMessageId: string,
    opts: SendWireOptions = {}
  ): Promise<{ guid: string }> {
    const request: Record<string, unknown> = {
      chat_guid: chatGuid,
      client_message_id: clientMessageId,
      dd_scan: opts.scan ?? true,
      message,
      rich_link: opts.richLink ?? true,
    };
    if (opts.replyTo) {
      request.selected_message_guid = opts.replyTo;
    }
    if (opts.effectId) {
      request.effect_id = opts.effectId;
    }
    if (opts.subject) {
      request.subject = opts.subject;
    }
    return this.invokeSend(request, clientMessageId);
  }

    sendAttachment(
    chatGuid: string,
    clientMessageId: string,
    attachment: {
      attachmentGuid?: string;
      attachmentPath?: string;
      attachmentName?: string;
      isAudioMessage?: boolean;
      isSticker?: boolean;
    },
    opts: SendWireOptions = {}
  ): Promise<{ guid: string }> {
    const request: Record<string, unknown> = {
      attachment_guid: attachment.attachmentGuid,
      attachment_name: attachment.attachmentName,
      attachment_path: attachment.attachmentPath,
      chat_guid: chatGuid,
      client_message_id: clientMessageId,
      dd_scan: opts.scan ?? false,
      is_audio_message: attachment.isAudioMessage ?? false,
      is_sticker: attachment.isSticker ?? false,
      rich_link: false,
    };
    if (opts.replyTo) {
      request.selected_message_guid = opts.replyTo;
    }
    if (opts.effectId) {
      request.effect_id = opts.effectId;
    }
    return this.invokeSend(request, clientMessageId);
  }

    sendMultipart(
    chatGuid: string,
    clientMessageId: string,
    attachmentGuids: string[],
    opts: SendWireOptions & { text?: string } = {}
  ): Promise<{ guid: string }> {
    const request: Record<string, unknown> = {
      attachment_guids: attachmentGuids,
      chat_guid: chatGuid,
      client_message_id: clientMessageId,
      dd_scan: opts.scan ?? false,
      rich_link: opts.richLink ?? false,
    };
    if (opts.text) {
      request.message = opts.text;
    }
    if (opts.replyTo) {
      request.selected_message_guid = opts.replyTo;
    }
    if (opts.effectId) {
      request.effect_id = opts.effectId;
    }
    if (opts.subject) {
      request.subject = opts.subject;
    }
    return this.invokeSend(request, clientMessageId);
  }

    uploadAttachment(
    data: Uint8Array,
    name: string
  ): Promise<{ attachment_guid: string }> {
    return new Promise((resolve, reject) => {
      this.service.Upload(
        { data, name },
        this.metadata(),
        { deadline: new Date(Date.now() + 30_000) },
        (err: grpc.ServiceError | null, res: { attachment_guid: string }) =>
          err ? reject(err) : resolve(res)
      );
    });
  }

    sendReaction(
    chatGuid: string,
    messageGuid: string,
    reaction: string,
    opts: { remove?: boolean; emoji?: string } = {}
  ): Promise<void> {
    const known = new Set([
      "love",
      "like",
      "dislike",
      "laugh",
      "emphasize",
      "question",
    ]);
    const isTapback = known.has(reaction);
    const wire = isTapback ? reaction : "emoji";
    const value = opts.remove ? `-${wire}` : wire;
    return this.unaryVoid(this.service, "SendReaction", {
      chat_guid: chatGuid,
      emoji: isTapback ? undefined : (opts.emoji ?? reaction),
      message_guid: messageGuid,
      part_index: 0,
      reaction: value,
    });
  }

  editMessage(
    chatGuid: string,
    messageGuid: string,
    newText: string
  ): Promise<void> {
    return this.unaryVoid(this.service, "EditMessage", {
      chat_guid: chatGuid,
      message_guid: messageGuid,
      new_text: newText,
      part_index: 0,
    });
  }

  unsendMessage(chatGuid: string, messageGuid: string): Promise<void> {
    return this.unaryVoid(this.service, "UnsendMessage", {
      chat_guid: chatGuid,
      message_guid: messageGuid,
      part_index: 0,
    });
  }

  startTyping(chatGuid: string): Promise<void> {
    return this.unaryVoid(this.chat, "StartTyping", { chat_guid: chatGuid });
  }

  stopTyping(chatGuid: string): Promise<void> {
    return this.unaryVoid(this.chat, "StopTyping", { chat_guid: chatGuid });
  }

  markRead(chatGuid: string): Promise<void> {
    return this.unaryVoid(this.chat, "MarkRead", { chat_guid: chatGuid });
  }

  sendReadReceipt(chatGuid: string): Promise<void> {
    return this.unaryVoid(this.chat, "SendReadReceipt", {
      chat_guid: chatGuid,
    });
  }

    private unaryVoid(
    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto service.
    service: any,
    method: string,
    request: Record<string, unknown>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      service[method](
        request,
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

    sendApp(
    chatGuid: string,
    card: AppCardWire,
    clientMessageId: string
  ): Promise<{ guid: string }> {
    const url = new URL(card.url);
    if (card.appId) {
      url.searchParams.set("appId", card.appId);
    }
    for (const [k, v] of Object.entries(card.data ?? {})) {
      url.searchParams.set(k, v);
    }
    const payload = {
      app_id: card.appId,
      app_store_id: card.appStoreId,
      bundle_id: card.bundleId,
      caption: card.caption,
      data: card.data ?? {},
      effect_id: card.effect,
      image_subtitle: card.imageSubtitle,
      image_title: card.imageTitle,
      image_url: card.image,
      interactive: card.interactive ?? true,
      subcaption: card.subcaption,
      summary: card.summary,
      team_id: card.teamId,
      trailing_caption: card.trailingCaption,
      trailing_subcaption: card.trailingSubcaption,
      url: url.toString(),
    };
    return this.invokeSend(
      {
        chat_guid: chatGuid,
        client_message_id: clientMessageId,
        mini_app: payload,
        rich_link: true,
      },
      clientMessageId
    );
  }

    sendFlow(
    chatGuid: string,
    card: FlowCardWire,
    clientMessageId: string
  ): Promise<{ guid: string }> {
    const base = card.appId
      ? `https://apps.interactions.co.in/x/${encodeURIComponent(card.appId)}`
      : "https://apps.interactions.co.in/x/inline";
    const url = new URL(base);
    if (card.appId) {
      url.searchParams.set("appId", card.appId);
    }
    const specJSON = card.spec ? JSON.stringify(card.spec) : undefined;
    const inlineInURL =
      specJSON !== undefined && specJSON.length <= INLINE_FLOW_URL_MAX;
    if (specJSON && inlineInURL) {
      url.searchParams.set("spec", toBase64Url(specJSON));
    }
    if (card.screen) {
      url.searchParams.set("screen", card.screen);
    }
    for (const [k, v] of Object.entries(card.state ?? {})) {
      url.searchParams.set(`state.${k}`, v);
    }
    const payload: Record<string, unknown> = {
      app_id: card.appId,
      app_store_id: card.appStoreId,
      bundle_id: card.bundleId,
      caption: card.caption,
      data: card.state ?? {},
      image_url: card.image,
      interactive: true,
      subcaption: card.subcaption,
      summary: card.summary,
      team_id: card.teamId,
      url: url.toString(),
    };
    if (specJSON && !inlineInURL) {
      payload.inline_flow_json = specJSON;
      if (card.screen) {
        payload.flow_screen = card.screen;
      }
    }
    return this.invokeSend(
      {
        chat_guid: chatGuid,
        client_message_id: clientMessageId,
        mini_app: payload,
        rich_link: true,
      },
      clientMessageId
    );
  }

  private invokeSend(
    // biome-ignore lint/suspicious/noExplicitAny: proto request is dynamically typed.
    request: Record<string, any>,
    _clientMessageId: string
  ): Promise<{ guid: string }> {
    return new Promise((resolve, reject) => {
      this.service.Send(
        request,
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: { guid: string }) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        }
      );
    });
  }

  subscribeEvents(handlers: {
    onReceived: (msg: InboundTextMessage) => void;
        onApp?: (
      card: InboundApp,
      senderId: string | undefined,
      date: Date,
      group?: InboundGroup
    ) => void;
        onFlow?: (
      submission: InboundFlow,
      senderId: string | undefined,
      date: Date,
      group?: InboundGroup
    ) => void;
        onReaction?: (
      reaction: InboundReaction,
      senderId: string | undefined,
      date: Date,
      group?: InboundGroup
    ) => void;
        onEdit?: (
      edit: InboundEdit,
      senderId: string | undefined,
      date: Date,
      group?: InboundGroup
    ) => void;
        onUnsend?: (
      messageGuid: string,
      senderId: string | undefined,
      date: Date,
      group?: InboundGroup
    ) => void;
        onSendError?: (err: {
      code?: string;
      message?: string;
      chatId?: string;
    }) => void;
    onError?: (err: grpc.ServiceError) => void;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
  }): grpc.ClientReadableStream<any> {
    const call = this.service.SubscribeEvents(
      {},
      this.metadata()
      // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    ) as grpc.ClientReadableStream<any>;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    call.on("data", (event: any) => {
      if (event?.message_send_error) {
        const e = event.message_send_error;
        handlers.onSendError?.({
          chatId: e.chat_guid,
          code: e.error_code,
          message: e.error_message,
        });
        return;
      }

      const updated = event?.message_updated;
      if (updated?.message) {
        this.handleUpdated(updated, handlers);
        return;
      }

      const received = event?.message_received;
      if (!received?.message) {
        return;
      }
      const msg = received.message;
      if (msg.is_from_me) {
        return;
      }
      const senderId: string | undefined = msg.sender?.address;
      const date = toDate(msg.date_created) ?? new Date();
      const group = resolveGroup(msg, senderId);

      const submission = parseInboundFlow(msg.balloon);
      if (submission) {
        handlers.onFlow?.(submission, senderId, date, group);
        return;
      }

      const card = parseInboundApp(msg.balloon);
      if (card) {
        handlers.onApp?.(card, senderId, date, group);
        return;
      }

      const inbound = mapInboundText(msg, senderId, date, group);
      if (!inbound.text && !inbound.attachments?.length) {
        return;
      }
      handlers.onReceived(inbound);
    });
    call.on("error", (err: grpc.ServiceError) => handlers.onError?.(err));
    return call;
  }

    private handleUpdated(
    // biome-ignore lint/suspicious/noExplicitAny: dynamic proto event.
    updated: any,
    handlers: {
      onReaction?: (
        reaction: InboundReaction,
        senderId: string | undefined,
        date: Date,
        group?: InboundGroup
      ) => void;
      onEdit?: (
        edit: InboundEdit,
        senderId: string | undefined,
        date: Date,
        group?: InboundGroup
      ) => void;
      onUnsend?: (
        messageGuid: string,
        senderId: string | undefined,
        date: Date,
        group?: InboundGroup
      ) => void;
    }
  ): void {
    const msg = updated.message;
    const kind: string = updated.update_type ?? "";
    const senderId: string | undefined = msg.sender?.address;
    const date = toDate(msg.date_created) ?? new Date();
    const group = resolveGroup(msg, senderId);
    const guid: string = msg.guid ?? "";
    if (kind === "reaction") {
      const raw: string = msg.associated_message_type ?? msg.reaction ?? "";
      const removed = raw.startsWith("-");
      handlers.onReaction?.(
        {
          messageGuid: msg.associated_message_guid ?? guid,
          reaction: removed ? raw.slice(1) : raw,
          removed,
        },
        senderId,
        date,
        group
      );
    } else if (kind === "edited") {
      handlers.onEdit?.(
        { messageGuid: guid, text: msg.text ?? "" },
        senderId,
        date,
        group
      );
    } else if (kind === "unsent") {
      handlers.onUnsend?.(guid, senderId, date, group);
    }
  }

    subscribeChatEvents(handlers: {
    onTyping?: (typing: InboundTyping, date: Date) => void;
    onRead?: (read: InboundRead, date: Date) => void;
    onError?: (err: grpc.ServiceError) => void;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
  }): grpc.ClientReadableStream<any> {
    const call = this.chat.SubscribeEvents(
      {},
      this.metadata()
      // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    ) as grpc.ClientReadableStream<any>;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
    call.on("data", (event: any) => {
      const date = toDate(event?.timestamp) ?? new Date();
      const typing = event?.typing_indicator;
      if (typing) {
        handlers.onTyping?.(
          {
            chatId: typing.chat_guid,
            displayName: typing.display_name,
            typing: Boolean(typing.is_typing),
          },
          date
        );
        return;
      }
      const read = event?.chat_read_status_changed;
      if (read) {
        handlers.onRead?.(
          { chatId: read.chat_guid, isRead: Boolean(read.is_read) },
          date
        );
      }
    });
    call.on("error", (err: grpc.ServiceError) => handlers.onError?.(err));
    return call;
  }

  private group(
    method: string,
    request: Record<string, unknown>
  ): Promise<void> {
    return this.unaryVoid(this.groupSvc, method, request);
  }

  setGroupName(chatGuid: string, name: string): Promise<void> {
    return this.group("SetDisplayName", { chat_guid: chatGuid, name });
  }

  setIcon(chatGuid: string, data: Uint8Array): Promise<void> {
    return this.group("SetIcon", { chat_guid: chatGuid, data });
  }

  removeIcon(chatGuid: string): Promise<void> {
    return this.group("RemoveIcon", { chat_guid: chatGuid });
  }

  getIcon(chatGuid: string): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      this.groupSvc.GetIcon(
        { chat_guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: { data?: Buffer }) => {
          if (err) {
            reject(err);
          } else {
            resolve(res.data ? new Uint8Array(res.data) : null);
          }
        }
      );
    });
  }

  setBackground(chatGuid: string, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.groupSvc.SetBackground(
        { chat_guid: chatGuid, data },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  removeBackground(chatGuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.groupSvc.RemoveBackground(
        { chat_guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  leaveChat(chatGuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chat.LeaveChat(
        { guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  shareContactInfo(chatGuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chat.ShareContactInfo(
        { chat_guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  createChat(addresses: string[]): Promise<{ chatGuid: string }> {
    return new Promise((resolve, reject) => {
      this.chat.CreateChat(
        { addresses, service: "iMessage" },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (
          err: grpc.ServiceError | null,
          res: { chat?: { guid?: string } }
        ) => {
          if (err) {
            reject(err);
          } else {
            const chatGuid = res.chat?.guid;
            if (!chatGuid) {
              reject(new Error("createChat: missing chat guid"));
            } else {
              resolve({ chatGuid });
            }
          }
        }
      );
    });
  }

  getMessage(messageGuid: string): Promise<InboundTextMessage | null> {
    return new Promise((resolve, reject) => {
      this.service.GetMessage(
        { decode: true, guid: messageGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: proto response is dynamically typed.
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            if (err.code === grpc.status.NOT_FOUND) {
              resolve(null);
            } else {
              reject(err);
            }
          } else if (!res?.guid) {
            resolve(null);
          } else {
            const senderId: string | undefined = res.sender?.address;
            const date = toDate(res.date_created) ?? new Date();
            const group = resolveGroup(res, senderId);
            resolve(mapInboundText(res, senderId, date, group));
          }
        }
      );
    });
  }

  sendPoll(
    chatGuid: string,
    title: string,
    options: string[]
  ): Promise<{ guid: string }> {
    return new Promise((resolve, reject) => {
      this.pollSvc.CreatePoll(
        { chat_guid: chatGuid, options, title },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: { guid: string }) =>
          err ? reject(err) : resolve({ guid: res.guid })
      );
    });
  }

  sendDigitalTouch(
    chatGuid: string,
    gesture: {
      bpm?: number;
      color?: string;
      kind: string;
      mediaPath?: string;
      stillPath?: string;
      tapCount?: number;
    }
  ): Promise<{ guid: string }> {
    return new Promise((resolve, reject) => {
      this.service.SendDigitalTouch(
        {
          bpm: gesture.bpm,
          chat_guid: chatGuid,
          color: gesture.color,
          kind: gesture.kind,
          media_path: gesture.mediaPath,
          still_path: gesture.stillPath,
          tap_count: gesture.tapCount,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 30_000) },
        (err: grpc.ServiceError | null, res: { guid: string }) =>
          err ? reject(err) : resolve({ guid: res.guid })
      );
    });
  }

  listMessages(
    chatGuid: string,
    opts?: {
      after?: Date;
      before?: Date;
      limit?: number;
      searchText?: string;
    }
  ): Promise<InboundTextMessage[]> {
    return new Promise((resolve, reject) => {
      this.service.ListMessages(
        {
          after: opts?.after ? { seconds: Math.floor(opts.after.getTime() / 1000) } : undefined,
          before: opts?.before
            ? { seconds: Math.floor(opts.before.getTime() / 1000) }
            : undefined,
          chat_guid: chatGuid,
          decode: true,
          limit: opts?.limit ?? 50,
          search_text: opts?.searchText,
          with_attachments: true,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 30_000) },
        // biome-ignore lint/suspicious/noExplicitAny: proto response is dynamically typed.
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            reject(err);
            return;
          }
          const messages = Array.isArray(res?.messages) ? res.messages : [];
          resolve(
            messages.map((msg: Record<string, unknown>) => {
              const senderId = (msg.sender as { address?: string } | undefined)
                ?.address;
              const date =
                toDate(
                  msg.date_created as
                    | { seconds?: string | number; nanos?: number }
                    | undefined
                ) ?? new Date();
              const group = resolveGroup(msg, senderId);
              return mapInboundText(msg, senderId, date, group);
            })
          );
        }
      );
    });
  }

  shareLocation(
    chatGuid: string,
    opts?: { durationSeconds?: number }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chat.SendLocation(
        {
          chat_guid: chatGuid,
          duration_seconds: opts?.durationSeconds,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  stopLocation(chatGuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.chat.StopLocation(
        { chat_guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  getFocusStatus(address: string): Promise<{ silenced: boolean }> {
    return new Promise((resolve, reject) => {
      this.addressSvc.GetFocusStatus(
        { address },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (
          err: grpc.ServiceError | null,
          res: { is_focused?: boolean }
        ) => {
          if (err) {
            reject(err);
          } else {
            resolve({ silenced: Boolean(res.is_focused) });
          }
        }
      );
    });
  }

  createFaceTimeLink(handles?: string[]): Promise<{ url: string }> {
    return new Promise((resolve, reject) => {
      this.faceTimeSvc.CreateLink(
        { handles: handles ?? [] },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: { url: string }) =>
          err ? reject(err) : resolve({ url: res.url })
      );
    });
  }

  addParticipant(chatGuid: string, address: string): Promise<void> {
    return this.group("AddParticipant", { address, chat_guid: chatGuid });
  }

  removeParticipant(chatGuid: string, address: string): Promise<void> {
    return this.group("RemoveParticipant", { address, chat_guid: chatGuid });
  }

  getParticipants(chatGuid: string): Promise<{ address: string }[]> {
    return new Promise((resolve, reject) => {
      this.chat.GetParticipants(
        { chat_guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (
          err: grpc.ServiceError | null,
          res: { participants?: { address: string }[] }
        ) => (err ? reject(err) : resolve(res.participants ?? []))
      );
    });
  }

    checkAvailability(
    address: string,
    kind: "imessage" | "facetime" = "imessage"
  ): Promise<boolean> {
    const type =
      kind === "facetime"
        ? "AVAILABILITY_TYPE_FACETIME"
        : "AVAILABILITY_TYPE_IMESSAGE";
    return new Promise((resolve, reject) => {
      this.addressSvc.CheckAvailability(
        { address, type },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: { available: boolean }) =>
          err ? reject(err) : resolve(Boolean(res.available))
      );
    });
  }

    getContactCard(
    address: string,
    includeImages = false
  ): Promise<InboundContact> {
    return new Promise((resolve, reject) => {
      this.chat.GetContactCard(
        { address, include_images: includeImages },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null, res: InboundContact) =>
          err ? reject(err) : resolve(res)
      );
    });
  }

  close(): void {
    this.client.close();
    this.chat.close?.();
    this.groupSvc.close?.();
    this.addressSvc.close?.();
    this.pollSvc.close?.();
    this.faceTimeSvc.close?.();
    this.attachmentSvc.close?.();
  }

  getChatDisplayName(chatGuid: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.chat.GetChat(
        { guid: chatGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: proto response is dynamically typed.
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            reject(err);
          } else {
            const name =
              res?.chat?.display_name || res?.display_name || undefined;
            resolve(name ? String(name) : null);
          }
        }
      );
    });
  }

  downloadAttachment(attachmentGuid: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const call = this.attachmentSvc.Download(
        { attachment_guid: attachmentGuid },
        this.metadata()
      ) as grpc.ClientReadableStream<{ data?: Uint8Array | Buffer }>;
      const chunks: Uint8Array[] = [];
      call.on("data", (chunk) => {
        if (chunk?.data) {
          chunks.push(
            chunk.data instanceof Uint8Array
              ? chunk.data
              : new Uint8Array(chunk.data)
          );
        }
      });
      call.on("error", (err: Error) => reject(err));
      call.on("end", () => {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          out.set(c, offset);
          offset += c.length;
        }
        resolve(out);
      });
    });
  }

  downloadAttachmentStream(
    attachmentGuid: string
  ): ReadableStream<Uint8Array> {
    const call = this.attachmentSvc.Download(
      { attachment_guid: attachmentGuid },
      this.metadata()
    ) as grpc.ClientReadableStream<{ data?: Uint8Array | Buffer }>;
    return new ReadableStream<Uint8Array>({
      cancel() {
        call.cancel();
      },
      start(controller) {
        call.on("data", (chunk) => {
          if (chunk?.data) {
            controller.enqueue(
              chunk.data instanceof Uint8Array
                ? chunk.data
                : new Uint8Array(chunk.data)
            );
          }
        });
        call.on("error", (err: Error) => controller.error(err));
        call.on("end", () => controller.close());
      },
    });
  }

  getAttachmentInfo(attachmentGuid: string): Promise<InboundAttachment | null> {
    return new Promise((resolve, reject) => {
      this.attachmentSvc.GetAttachment(
        { guid: attachmentGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: proto response is dynamically typed.
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            if (err.code === grpc.status.NOT_FOUND) {
              resolve(null);
            } else {
              reject(err);
            }
          } else {
            const att = res?.attachment;
            if (!att?.guid) {
              resolve(null);
            } else {
              resolve({
                guid: att.guid,
                mimeType: att.mime_type || undefined,
                name: att.file_name || undefined,
                size:
                  att.total_bytes != null ? Number(att.total_bytes) : undefined,
              });
            }
          }
        }
      );
    });
  }

  votePoll(
    chatGuid: string,
    pollMessageGuid: string,
    optionIdentifier: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pollSvc.Vote(
        {
          chat_guid: chatGuid,
          option_identifier: optionIdentifier,
          poll_message_guid: pollMessageGuid,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  unvotePoll(chatGuid: string, pollMessageGuid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pollSvc.Unvote(
        { chat_guid: chatGuid, poll_message_guid: pollMessageGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  addPollOption(
    chatGuid: string,
    pollMessageGuid: string,
    optionText: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pollSvc.AddOption(
        {
          chat_guid: chatGuid,
          option_text: optionText,
          poll_message_guid: pollMessageGuid,
        },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        (err: grpc.ServiceError | null) => (err ? reject(err) : resolve())
      );
    });
  }

  getPoll(pollMessageGuid: string): Promise<{
    chatId: string;
    options: { creatorHandle?: string; id?: string; text: string }[];
    pollMessageGuid: string;
    title: string;
    votes: { optionId: string; participant?: string }[];
  } | null> {
    return new Promise((resolve, reject) => {
      this.pollSvc.GetPoll(
        { message_guid: pollMessageGuid },
        this.metadata(),
        { deadline: new Date(Date.now() + 15_000) },
        // biome-ignore lint/suspicious/noExplicitAny: proto response is dynamically typed.
        (err: grpc.ServiceError | null, res: any) => {
          if (err) {
            if (err.code === grpc.status.NOT_FOUND) {
              resolve(null);
            } else {
              reject(err);
            }
          } else if (!res?.message_guid) {
            resolve(null);
          } else {
            resolve({
              chatId: res.chat_guid,
              options: (res.options ?? []).map(
                (o: {
                  creator_handle?: string;
                  option_identifier?: string;
                  text?: string;
                }) => ({
                  creatorHandle: o.creator_handle,
                  id: o.option_identifier,
                  text: o.text ?? "",
                })
              ),
              pollMessageGuid: res.message_guid,
              title: res.title ?? "",
              votes: (res.votes ?? []).map(
                (v: {
                  option_identifier?: string;
                  participant_address?: string;
                }) => ({
                  optionId: v.option_identifier ?? "",
                  participant: v.participant_address,
                })
              ),
            });
          }
        }
      );
    });
  }

  subscribePollEvents(handlers: {
    onPollChange?: (event: {
      action: string;
      chatId: string;
      date: Date;
      pollMessageGuid: string;
    }) => void;
    onError?: (err: grpc.ServiceError) => void;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
  }): grpc.ClientReadableStream<any> {
    const call = this.pollSvc.SubscribeEvents(
      {},
      this.metadata()
    ) as grpc.ClientReadableStream<Record<string, unknown>>;
    call.on("data", (event) => {
      const changed = event?.poll_changed as
        | {
            action?: string;
            chat_guid?: string;
            poll_message_guid?: string;
          }
        | undefined;
      if (!changed?.poll_message_guid) {
        return;
      }
      handlers.onPollChange?.({
        action: changed.action ?? "changed",
        chatId: changed.chat_guid ?? "",
        date: toDate(event.timestamp) ?? new Date(),
        pollMessageGuid: changed.poll_message_guid,
      });
    });
    call.on("error", (err: grpc.ServiceError) => handlers.onError?.(err));
    return call;
  }

  subscribeGroupEvents(handlers: {
    onGroupChange?: (event: {
      backgroundChanged?: boolean;
      backgroundRemoved?: boolean;
      chatId: string;
      date: Date;
      iconChanged?: boolean;
      iconRemoved?: boolean;
      participantAdded?: string;
      participantRemoved?: string;
      renamedTo?: string;
    }) => void;
    onError?: (err: grpc.ServiceError) => void;
    // biome-ignore lint/suspicious/noExplicitAny: streamed event is dynamically typed.
  }): grpc.ClientReadableStream<any> {
    const call = this.groupSvc.SubscribeEvents(
      {},
      this.metadata()
    ) as grpc.ClientReadableStream<Record<string, unknown>>;
    call.on("data", (event) => {
      const changed = event?.group_changed as Record<string, unknown> | undefined;
      if (!changed?.chat_guid) {
        return;
      }
      handlers.onGroupChange?.({
        backgroundChanged: Boolean(changed.background_changed),
        backgroundRemoved: Boolean(changed.background_removed),
        chatId: String(changed.chat_guid),
        date: toDate(event.timestamp) ?? new Date(),
        iconChanged: Boolean(changed.icon_changed),
        iconRemoved: Boolean(changed.icon_removed),
        participantAdded:
          typeof changed.participant_added === "string"
            ? changed.participant_added
            : undefined,
        participantRemoved:
          typeof changed.participant_removed === "string"
            ? changed.participant_removed
            : undefined,
        renamedTo:
          typeof changed.renamed_to === "string" ? changed.renamed_to : undefined,
      });
    });
    call.on("error", (err: grpc.ServiceError) => handlers.onError?.(err));
    return call;
  }
}

export function readAssetBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function mapInboundAttachments(
  // biome-ignore lint/suspicious/noExplicitAny: proto attachment list is dynamically typed.
  attachments: any[] | undefined
): InboundAttachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return;
  }
  return attachments.map((att) => ({
    guid: att.guid,
    mimeType: att.mime_type || undefined,
    name: att.file_name || undefined,
    size: att.total_bytes != null ? Number(att.total_bytes) : undefined,
  }));
}

function mapReplyTo(
  // biome-ignore lint/suspicious/noExplicitAny: proto message is dynamically typed.
  msg: any
): { messageGuid: string; partIndex?: number } | undefined {
  const messageGuid: string | undefined =
    msg.reply_to_guid ?? msg.thread_originator_guid;
  if (!messageGuid) {
    return;
  }
  const partIndex =
    msg.thread_originator_part != null
      ? Number(msg.thread_originator_part)
      : undefined;
  return { messageGuid, partIndex };
}

function mapInboundText(
  // biome-ignore lint/suspicious/noExplicitAny: proto message is dynamically typed.
  msg: any,
  senderId: string | undefined,
  date: Date,
  group?: InboundGroup
): InboundTextMessage {
  return {
    attachments: mapInboundAttachments(msg.attachments),
    date,
    group,
    guid: msg.guid || undefined,
    isFromMe: Boolean(msg.is_from_me),
    replyTo: mapReplyTo(msg),
    senderId,
    service: msg.sender?.service || undefined,
    text: msg.text ?? "",
  };
}

function toDate(
  ts: { seconds?: string | number; nanos?: number } | undefined
): Date | null {
  if (!ts || ts.seconds === undefined) {
    return null;
  }
  const seconds = Number(ts.seconds);
  const nanos = Number(ts.nanos ?? 0);
  return new Date(seconds * 1000 + Math.floor(nanos / 1e6));
}

export function grpcTarget(address: string): string {
  let a = address
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!/:\d+$/.test(a)) {
    a = `${a}:50051`;
  }
  return a;
}

export function dmChatGuid(handle: string): string {
  return `any;-;${handle}`;
}

function resolveProtoDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.PROTO_DIR,
    join(here, "proto"),
    join(here, "..", "proto"),
    join(process.cwd(), "proto"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  throw new Error("proto dir not found — set PROTO_DIR or ship dist/proto");
}
