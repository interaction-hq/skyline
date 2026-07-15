import type { KeyboardContent, ReplyMarkup } from "@skyline-ts/core/content";
import type { InlineQueryResult } from "@skyline-ts/core";
import { DEFAULT_BASE_URL } from "./config.js";

const REQUEST_TIMEOUT_MS = 30_000;
const TRAILING_SLASHES = /\/+$/;

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly description: string,
    readonly errorCode?: number
  ) {
    super(`Telegram ${method}: ${description}`);
    this.name = "TelegramApiError";
  }
}

export interface TelegramClientOptions {
  baseUrl?: string;
  botToken: string;
}

export interface SentMessage {
  chat: { id: number; type?: string };
  date: number;
  message_id: number;
  message_thread_id?: number;
  text?: string;
}

export interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
}

export interface TelegramUser {
  first_name?: string;
  id: number;
  username?: string;
}

export interface TelegramChat {
  id: number;
  title?: string;
  type: string;
  username?: string;
}

export interface TelegramMessage {
  animation?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  audio?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  caption?: string;
  chat: TelegramChat;
  contact?: {
    first_name?: string;
    last_name?: string;
    phone_number: string;
    user_id?: number;
    vcard?: string;
  };
  date: number;
  dice?: { emoji: string; value: number };
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  forward_origin?: {
    chat?: TelegramChat;
    date?: number;
    message_id?: number;
    type: string;
  };
  from?: TelegramUser;
  game?: { description?: string; short_name?: string; title?: string };
  invoice?: {
    currency: string;
    description: string;
    start_parameter?: string;
    title: string;
    total_amount: number;
  };
  live_photo?: {
    photo?: { file_id: string; file_size?: number }[];
    video?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  location?: { latitude: number; longitude: number };
  message_id: number;
  message_thread_id?: number;
  photo?: { file_id: string; file_size?: number }[];
  poll?: {
    allows_multiple_answers?: boolean;
    id: string;
    is_anonymous?: boolean;
    is_closed?: boolean;
    options: { text: string; voter_count: number }[];
    question: string;
    total_voter_count?: number;
    type?: string;
  };
  reply_to_message?: { message_id: number };
  sticker?: {
    emoji?: string;
    file_id: string;
    file_size?: number;
    is_animated?: boolean;
    is_video?: boolean;
  };
  text?: string;
  venue?: {
    address: string;
    location: { latitude: number; longitude: number };
    title: string;
  };
  video?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  video_note?: { file_id: string; file_size?: number };
  voice?: {
    duration?: number;
    file_id: string;
    file_size?: number;
    mime_type?: string;
  };
}

export interface TelegramUpdate {
  business_connection?: unknown;
  business_message?: TelegramMessage;
  callback_query?: {
    data?: string;
    from: TelegramUser;
    id: string;
    message?: TelegramMessage;
  };
  channel_post?: TelegramMessage;
  chat_boost?: unknown;
  chat_join_request?: {
    chat: TelegramChat;
    date: number;
    from: TelegramUser;
    user_chat_id?: number;
  };
  chat_member?: {
    chat: TelegramChat;
    date: number;
    new_chat_member: { status: string; user: TelegramUser };
    old_chat_member: { status: string; user: TelegramUser };
  };
  chosen_inline_result?: unknown;
  deleted_business_messages?: unknown;
  edited_business_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  guest_message?: TelegramMessage;
  inline_query?: {
    from: TelegramUser;
    id: string;
    offset?: string;
    query: string;
  };
  managed_bot?: unknown;
  message?: TelegramMessage;
  message_reaction?: {
    chat: TelegramChat;
    date: number;
    message_id: number;
    new_reaction: { emoji?: string; type: string }[];
    old_reaction: { emoji?: string; type: string }[];
    user?: TelegramUser;
  };
  message_reaction_count?: unknown;
  my_chat_member?: {
    chat: TelegramChat;
    date: number;
    new_chat_member: { status: string; user: TelegramUser };
    old_chat_member: { status: string; user: TelegramUser };
  };
  poll?: {
    id: string;
    is_closed?: boolean;
    options: { text: string; voter_count: number }[];
    question: string;
  };
  poll_answer?: {
    option_ids: number[];
    poll_id: string;
    user: TelegramUser;
  };
  pre_checkout_query?: unknown;
  purchased_paid_media?: unknown;
  removed_chat_boost?: unknown;
  shipping_query?: unknown;
  subscription?: unknown;
  update_id: number;
}

/** All Update fields from Bot API — receive everything getUpdates can deliver. */
export const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "guest_message",
  "message_reaction",
  "message_reaction_count",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "purchased_paid_media",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "chat_boost",
  "removed_chat_boost",
  "managed_bot",
  "subscription",
] as const;

export class TelegramClient {
  private readonly base: string;
  private readonly token: string;

  constructor(opts: TelegramClientOptions) {
    this.token = opts.botToken;
    this.base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(TRAILING_SLASHES, "");
  }

  private apiUrl(method: string): string {
    return `${this.base}/bot${this.token}/${method}`;
  }

  async call<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await fetch(this.apiUrl(method), {
      body: JSON.stringify(params),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as {
      description?: string;
      error_code?: number;
      ok?: boolean;
      result?: T;
    } | null;
    if (!(res.ok && json?.ok)) {
      throw new TelegramApiError(
        method,
        json?.description ?? `HTTP ${res.status}`,
        json?.error_code
      );
    }
    return json.result as T;
  }

  async upload<T>(
    method: string,
    params: Record<string, unknown>,
    file: {
      bytes: Uint8Array;
      field: string;
      filename: string;
      mimeType?: string;
    }
  ): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) {
        continue;
      }
      form.append(
        key,
        typeof value === "string" || value instanceof Blob
          ? value
          : JSON.stringify(value)
      );
    }
    form.append(
      file.field,
      new Blob([Uint8Array.from(file.bytes)], {
        type: file.mimeType ?? "application/octet-stream",
      }),
      file.filename
    );
    const res = await fetch(this.apiUrl(method), {
      body: form,
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json().catch(() => null)) as {
      description?: string;
      error_code?: number;
      ok?: boolean;
      result?: T;
    } | null;
    if (!(res.ok && json?.ok)) {
      throw new TelegramApiError(
        method,
        json?.description ?? `HTTP ${res.status}`,
        json?.error_code
      );
    }
    return json.result as T;
  }

  async uploadForm<T>(method: string, form: FormData): Promise<T> {
    const res = await fetch(this.apiUrl(method), {
      body: form,
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json().catch(() => null)) as {
      description?: string;
      error_code?: number;
      ok?: boolean;
      result?: T;
    } | null;
    if (!(res.ok && json?.ok)) {
      throw new TelegramApiError(
        method,
        json?.description ?? `HTTP ${res.status}`,
        json?.error_code
      );
    }
    return json.result as T;
  }

  sendMessage(
    chatId: string,
    text: string,
    opts?: {
      linkPreview?: boolean;
      parseMode?: "HTML" | "MarkdownV2";
      protect?: boolean;
      replyMarkup?: unknown;
      replyTo?: string;
      silent?: boolean;
      threadId?: number | string;
    }
  ): Promise<SentMessage> {
    const params: Record<string, unknown> = { chat_id: chatId, text };
    applyCommonOpts(params, opts);
    if (opts?.parseMode) {
      params.parse_mode = opts.parseMode;
    }
    if (opts?.linkPreview === false) {
      params.link_preview_options = { is_disabled: true };
    }
    return this.call("sendMessage", params);
  }

  editMessageText(
    chatId: string,
    messageId: string,
    text: string,
    opts?: { parseMode?: "HTML" | "MarkdownV2"; replyMarkup?: unknown }
  ): Promise<SentMessage | true> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      message_id: Number(messageId),
      text,
    };
    if (opts?.parseMode) {
      params.parse_mode = opts.parseMode;
    }
    if (opts?.replyMarkup) {
      params.reply_markup = opts.replyMarkup;
    }
    return this.call("editMessageText", params);
  }

  deleteMessage(chatId: string, messageId: string): Promise<true> {
    return this.call("deleteMessage", {
      chat_id: chatId,
      message_id: Number(messageId),
    });
  }

  sendChatAction(chatId: string, action: string): Promise<true> {
    return this.call("sendChatAction", { action, chat_id: chatId });
  }

  setMessageReaction(
    chatId: string,
    messageId: string,
    emoji: string | null
  ): Promise<true> {
    return this.call("setMessageReaction", {
      chat_id: chatId,
      message_id: Number(messageId),
      reaction: emoji ? [{ emoji, type: "emoji" }] : [],
    });
  }

  sendMessageDraft(
    chatId: number,
    draftId: number,
    text: string,
    opts?: { parseMode?: "HTML" }
  ): Promise<true> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      draft_id: draftId,
      text,
    };
    if (opts?.parseMode) {
      params.parse_mode = opts.parseMode;
    }
    return this.call("sendMessageDraft", params);
  }

  answerCallbackQuery(
    queryId: string,
    opts?: { showAlert?: boolean; text?: string; url?: string }
  ): Promise<true> {
    return this.call("answerCallbackQuery", {
      callback_query_id: queryId,
      show_alert: opts?.showAlert,
      text: opts?.text,
      url: opts?.url,
    });
  }

  answerInlineQuery(
    queryId: string,
    results: unknown[],
    opts?: Record<string, unknown>
  ): Promise<true> {
    return this.call("answerInlineQuery", {
      inline_query_id: queryId,
      results,
      ...opts,
    });
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const meta = await this.call<TelegramFile>("getFile", { file_id: fileId });
    if (!meta.file_path) {
      throw new Error(`Telegram getFile returned no file_path for ${fileId}`);
    }
    const url = `${this.base}/file/bot${this.token}/${meta.file_path}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Telegram media download failed (HTTP ${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  getUpdates(opts: {
    offset?: number;
    timeout?: number;
  }): Promise<TelegramUpdate[]> {
    return this.call("getUpdates", {
      allowed_updates: [...ALLOWED_UPDATES],
      offset: opts.offset,
      timeout: opts.timeout ?? 25,
    });
  }

  getChat(chatId: string): Promise<{ title?: string; type?: string }> {
    return this.call("getChat", { chat_id: chatId });
  }
}

export function applyCommonOpts(
  params: Record<string, unknown>,
  opts?: {
    caption?: string;
    entities?: unknown[];
    parseMode?: "HTML" | "MarkdownV2";
    protect?: boolean;
    replyMarkup?: unknown;
    replyTo?: string;
    silent?: boolean;
    threadId?: number | string;
  }
): void {
  if (!opts) {
    return;
  }
  if (opts.replyTo) {
    params.reply_parameters = { message_id: Number(opts.replyTo) };
  }
  if (opts.threadId != null) {
    params.message_thread_id = Number(opts.threadId);
  }
  if (opts.silent) {
    params.disable_notification = true;
  }
  if (opts.protect) {
    params.protect_content = true;
  }
  if (opts.caption) {
    params.caption = opts.caption;
  }
  if (opts.parseMode) {
    params.parse_mode = opts.parseMode;
  }
  if (opts.entities?.length) {
    params.entities = opts.entities;
  }
  if (opts.replyMarkup) {
    params.reply_markup = opts.replyMarkup;
  }
}

/**
 * Skyline camelCase → Telegram Bot API snake_case.
 * Known renames that aren't 1:1 camel→snake live in RENAMES.
 */

const RENAMES: Record<string, string> = {
  chargeId: "telegram_payment_charge_id",
  messageGuid: "message_id",
  reactorUserId: "user_id",
  telegramPaymentChargeId: "telegram_payment_charge_id",
  threadId: "message_thread_id",
};

function camelToSnakeKey(key: string): string {
  if (RENAMES[key]) {
    return RENAMES[key]!;
  }
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof Date) &&
    !(value instanceof Blob)
  );
}

/** Recursively convert Skyline camelCase keys to Bot API snake_case. */
export function toTelegramParams(
  value: unknown
): Record<string, unknown> | unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toTelegramParams(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) {
      continue;
    }
    out[camelToSnakeKey(key)] = toTelegramParams(nested);
  }
  return out;
}

export function asTelegramParams(
  value: unknown
): Record<string, unknown> {
  const mapped = toTelegramParams(value);
  if (!isPlainObject(mapped)) {
    return {};
  }
  return mapped;
}

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/** Recursively convert Bot API snake_case keys to Skyline camelCase. */
export function fromTelegramResult<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => fromTelegramResult(item)) as T;
  }
  if (!isPlainObject(value)) {
    return value as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[snakeToCamelKey(key)] = fromTelegramResult(nested);
  }
  return out as T;
}

export function keyboardToReplyMarkup(
  content: KeyboardContent
): Record<string, unknown> {
  if (content.replyKeyboard) {
    return {
      input_field_placeholder: content.placeholder,
      keyboard: content.buttons.map((row) =>
        row.map((btn) => ({ text: btn.text }))
      ),
      one_time_keyboard: content.oneTime ?? false,
      resize_keyboard: content.resize ?? true,
    };
  }
  return {
    inline_keyboard: content.buttons.map((row) =>
      row.map((btn) => {
        const out: Record<string, unknown> = { text: btn.text };
        if (btn.url) {
          out.url = btn.url;
        }
        if (btn.callbackData) {
          out.callback_data = btn.callbackData;
        }
        if (btn.webApp) {
          out.web_app = btn.webApp;
        }
        return out;
      })
    ),
  };
}

export function replyMarkupToTelegram(
  markup: ReplyMarkup
): Record<string, unknown> {
  switch (markup.type) {
    case "inline":
      return {
        inline_keyboard: markup.inlineKeyboard.map((row) =>
          row.map((btn) => {
            const out: Record<string, unknown> = { text: btn.text };
            if (btn.url) {
              out.url = btn.url;
            }
            if (btn.callbackData) {
              out.callback_data = btn.callbackData;
            }
            if (btn.webApp) {
              out.web_app = btn.webApp;
            }
            if (btn.switchInlineQuery != null) {
              out.switch_inline_query = btn.switchInlineQuery;
            }
            if (btn.switchInlineQueryCurrentChat != null) {
              out.switch_inline_query_current_chat =
                btn.switchInlineQueryCurrentChat;
            }
            return out;
          })
        ),
      };
    case "reply":
      return {
        input_field_placeholder: markup.placeholder,
        keyboard: markup.keyboard,
        one_time_keyboard: markup.oneTime ?? false,
        resize_keyboard: markup.resize ?? true,
      };
    case "remove":
      return {
        remove_keyboard: true,
        selective: markup.selective,
      };
    case "force_reply":
      return {
        force_reply: true,
        input_field_placeholder: markup.placeholder,
        selective: markup.selective,
      };
    default: {
      const _exhaustive: never = markup;
      return _exhaustive;
    }
  }
}

/** Skyline InlineQueryResult → Bot API InlineQueryResult (snake_case + markup). */
export function inlineQueryResultToTelegram(
  result: InlineQueryResult
): Record<string, unknown> {
  const mapped = asTelegramParams(result);
  if (
    result.type === "article" &&
    result.replyMarkup &&
    typeof mapped === "object"
  ) {
    mapped.reply_markup = replyMarkupToTelegram(result.replyMarkup);
  }
  return mapped;
}

export interface TelegramPollHandlers {
  onUpdate: (update: TelegramUpdate) => void;
}

export function startTelegramPolling(
  client: TelegramClient,
  handlers: TelegramPollHandlers
): { cancel: () => void } {
  let cancelled = false;
  let offset = 0;

  const loop = async () => {
    while (!cancelled) {
      try {
        const updates = await client.getUpdates({ offset, timeout: 25 });
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            handlers.onUpdate(update);
          } catch {
            /* ignore handler errors */
          }
        }
      } catch {
        if (cancelled) {
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };

  void loop();

  return {
    cancel() {
      cancelled = true;
    },
  };
}

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function verifyTelegramWebhookSecret(
  headers: Headers,
  secretToken: string
): void {
  const got = headers.get(SECRET_HEADER);
  if (!got) {
    throw new Error("Telegram webhook is missing the secret token header");
  }
  if (got !== secretToken) {
    throw new Error("Telegram webhook secret token mismatch");
  }
}

export async function parseTelegramUpdate(
  body: ArrayBuffer | Uint8Array | string
): Promise<TelegramUpdate> {
  const text =
    typeof body === "string"
      ? body
      : new TextDecoder().decode(
          body instanceof Uint8Array ? body : new Uint8Array(body)
        );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Telegram webhook body is not valid JSON");
  }
  if (
    !(
      json &&
      typeof json === "object" &&
      "update_id" in json &&
      typeof (json as { update_id: unknown }).update_id === "number"
    )
  ) {
    throw new Error("Telegram webhook payload is missing a numeric update_id");
  }
  return json as TelegramUpdate;
}

/**
 * Fetch handler for Telegram Bot API webhooks. Returns 200 quickly after
 * dispatching the update onto the Skyline host (via `onUpdate`).
 */
export function createTelegramWebhookHandler(opts: {
  onUpdate: (update: TelegramUpdate) => void;
  secretToken?: string;
}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      if (opts.secretToken) {
        verifyTelegramWebhookSecret(request.headers, opts.secretToken);
      }
      const update = await parseTelegramUpdate(await request.arrayBuffer());
      opts.onUpdate(update);
      return new Response("ok", { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad request";
      return new Response(message, { status: 400 });
    }
  };
}

/** Register `webhookUrl` with Telegram (idempotent when URL already matches). */
export async function ensureTelegramWebhook(
  client: TelegramClient,
  webhookUrl: string,
  secretToken?: string
): Promise<void> {
  const info = await client.call<{ url?: string }>("getWebhookInfo");
  if (info.url === webhookUrl) {
    return;
  }
  await client.call("setWebhook", {
    allowed_updates: [...ALLOWED_UPDATES],
    drop_pending_updates: false,
    secret_token: secretToken,
    url: webhookUrl,
  });
}
