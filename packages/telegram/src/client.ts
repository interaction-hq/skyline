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
  language_code?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessageEntity {
  custom_emoji_id?: string;
  date_time_format?: string;
  language?: string;
  length: number;
  offset: number;
  type: string;
  unix_time?: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramChat {
  id: number;
  title?: string;
  type: string;
  username?: string;
}

export interface TelegramPollMedia {
  animation?: { file_id?: string; file_unique_id?: string };
  audio?: { file_id?: string; file_unique_id?: string };
  document?: { file_id?: string; file_unique_id?: string };
  link?: { title?: string; url?: string };
  live_photo?: { file_id?: string; file_unique_id?: string };
  location?: { latitude: number; longitude: number };
  photo?: { file_id?: string; file_unique_id?: string }[];
  sticker?: { file_id?: string; file_unique_id?: string };
  venue?: { location?: { latitude: number; longitude: number }; title?: string };
  video?: { file_id?: string; file_unique_id?: string };
}

export interface TelegramPollOption {
  media?: TelegramPollMedia;
  persistent_id?: string;
  text: string;
  voter_count?: number;
}

export interface TelegramPoll {
  allows_multiple_answers?: boolean;
  allows_revoting?: boolean;
  close_date?: number;
  correct_option_ids?: number[];
  country_codes?: string[];
  description?: string;
  description_entities?: TelegramMessageEntity[];
  explanation?: string;
  explanation_entities?: TelegramMessageEntity[];
  explanation_media?: TelegramPollMedia;
  id: string;
  is_anonymous?: boolean;
  is_closed?: boolean;
  media?: TelegramPollMedia;
  members_only?: boolean;
  open_period?: number;
  options: TelegramPollOption[];
  question: string;
  question_entities?: TelegramMessageEntity[];
  total_voter_count?: number;
  type?: string;
}

export interface TelegramMessage {
  animation?: {
    duration?: number;
    file_id: string;
    file_name?: string;
    height?: number;
    mime_type?: string;
    file_size?: number;
    thumbnail?: { file_id: string };
    width?: number;
  };
  audio?: {
    duration?: number;
    file_id: string;
    file_name?: string;
    mime_type?: string;
    performer?: string;
    file_size?: number;
    thumbnail?: { file_id: string };
    title?: string;
  };
  author_signature?: string;
  boost_added?: { boost_count?: number };
  business_connection_id?: string;
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
  channel_chat_created?: boolean;
  chat: TelegramChat;
  chat_background_set?: unknown;
  chat_owner_changed?: unknown;
  chat_owner_left?: unknown;
  chat_shared?: { chat_id: number; request_id?: number };
  checklist?: unknown;
  checklist_tasks_added?: unknown;
  checklist_tasks_done?: unknown;
  community_chat_added?: unknown;
  community_chat_removed?: unknown;
  connected_website?: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    phone_number: string;
    user_id?: number;
    vcard?: string;
  };
  date: number;
  delete_chat_photo?: boolean;
  dice?: { emoji: string; value: number };
  direct_message_price_changed?: unknown;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    thumbnail?: { file_id: string };
  };
  edit_date?: number;
  effect_id?: string;
  entities?: TelegramMessageEntity[];
  ephemeral_message_id?: number;
  external_reply?: {
    chat?: TelegramChat;
    has_media_spoiler?: boolean;
    message_id?: number;
    origin?: { type?: string };
  };
  forum_topic_closed?: unknown;
  forum_topic_created?: {
    icon_color?: number;
    icon_custom_emoji_id?: string;
    name?: string;
  };
  forum_topic_edited?: { icon_custom_emoji_id?: string; name?: string };
  forum_topic_reopened?: unknown;
  forward_date?: number;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  forward_from_message_id?: number;
  forward_origin?: {
    chat?: TelegramChat;
    date?: number;
    message_id?: number;
    sender_user?: TelegramUser;
    sender_user_name?: string;
    type: string;
  };
  from?: TelegramUser;
  game?: { description?: string; short_name?: string; title?: string };
  general_forum_topic_hidden?: unknown;
  general_forum_topic_unhidden?: unknown;
  gift?: unknown;
  gift_upgrade_sent?: unknown;
  giveaway?: unknown;
  giveaway_completed?: unknown;
  giveaway_created?: unknown;
  giveaway_winners?: unknown;
  group_chat_created?: boolean;
  guest_query_id?: string;
  has_media_spoiler?: boolean;
  has_protected_content?: boolean;
  invoice?: {
    currency: string;
    description: string;
    start_parameter?: string;
    title: string;
    total_amount: number;
  };
  is_automatic_forward?: boolean;
  is_from_offline?: boolean;
  is_paid_post?: boolean;
  is_topic_message?: boolean;
  left_chat_member?: TelegramUser;
  link_preview_options?: {
    is_disabled?: boolean;
    prefer_large_media?: boolean;
    prefer_small_media?: boolean;
    show_above_text?: boolean;
    url?: string;
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
  location?: {
    heading?: number;
    horizontal_accuracy?: number;
    latitude: number;
    live_period?: number;
    longitude: number;
    proximity_alert_radius?: number;
  };
  managed_bot_created?: unknown;
  media_group_id?: string;
  message_auto_delete_timer_changed?: unknown;
  message_id: number;
  message_thread_id?: number;
  migrate_from_chat_id?: number;
  migrate_to_chat_id?: number;
  new_chat_members?: TelegramUser[];
  new_chat_photo?: unknown;
  new_chat_title?: string;
  paid_media?: unknown;
  paid_message_price_changed?: unknown;
  paid_star_count?: number;
  passport_data?: unknown;
  photo?: { file_id: string; file_size?: number }[];
  pinned_message?: { message_id?: number };
  poll?: TelegramPoll;
  poll_option_added?: unknown;
  poll_option_deleted?: unknown;
  proximity_alert_triggered?: unknown;
  quote?: {
    entities?: TelegramMessageEntity[];
    is_manual?: boolean;
    position?: number;
    text: string;
  };
  receiver_user?: TelegramUser;
  refunded_payment?: {
    currency: string;
    invoice_payload?: string;
    telegram_payment_charge_id?: string;
    total_amount: number;
  };
  reply_markup?: {
    inline_keyboard?: {
      callback_data?: string;
      callback_game?: unknown;
      copy_text?: { text?: string };
      login_url?: {
        bot_username?: string;
        forward_text?: string;
        request_write_access?: boolean;
        url: string;
      };
      pay?: boolean;
      switch_inline_query?: string;
      switch_inline_query_chosen_chat?: {
        allow_bot_chats?: boolean;
        allow_channel_chats?: boolean;
        allow_group_chats?: boolean;
        allow_user_chats?: boolean;
        query?: string;
      };
      switch_inline_query_current_chat?: string;
      text: string;
      url?: string;
      web_app?: { url: string };
    }[][];
  };
  suggested_post_info?: {
    price?: { amount?: number; currency?: string };
    send_date?: number;
    state?: string;
  };
  direct_messages_topic?: { topic_id?: number; name?: string };
  guest_bot_caller_user?: TelegramUser;
  guest_bot_caller_chat?: TelegramChat;
  reply_to_checklist_task_id?: number;
  reply_to_message?: {
    caption?: string;
    from?: TelegramUser;
    message_id: number;
    text?: string;
  };
  reply_to_poll_option_id?: string;
  reply_to_story?: { id?: number };
  rich_message?: unknown;
  sender_boost_count?: number;
  sender_business_bot?: TelegramUser;
  sender_chat?: TelegramChat;
  sender_tag?: string;
  show_caption_above_media?: boolean;
  sticker?: {
    emoji?: string;
    file_id: string;
    file_size?: number;
    is_animated?: boolean;
    is_video?: boolean;
  };
  story?: { chat?: TelegramChat; id?: number };
  successful_payment?: {
    currency: string;
    invoice_payload: string;
    provider_payment_charge_id?: string;
    telegram_payment_charge_id?: string;
    total_amount: number;
  };
  suggested_post_approval_failed?: unknown;
  suggested_post_approved?: unknown;
  suggested_post_declined?: unknown;
  suggested_post_paid?: unknown;
  suggested_post_refunded?: unknown;
  supergroup_chat_created?: boolean;
  text?: string;
  unique_gift?: unknown;
  users_shared?: { request_id?: number; users?: TelegramUser[] };
  venue?: {
    address: string;
    location: { latitude: number; longitude: number };
    title: string;
  };
  via_bot?: TelegramUser;
  video?: {
    duration?: number;
    file_id: string;
    file_name?: string;
    height?: number;
    mime_type?: string;
    file_size?: number;
    thumbnail?: { file_id: string };
    width?: number;
  };
  video_chat_ended?: { duration?: number };
  video_chat_participants_invited?: { users?: TelegramUser[] };
  video_chat_scheduled?: { start_date?: number };
  video_chat_started?: unknown;
  video_note?: {
    duration?: number;
    file_id: string;
    file_size?: number;
    length?: number;
    thumbnail?: { file_id: string };
  };
  voice?: {
    duration?: number;
    file_id: string;
    file_size?: number;
    mime_type?: string;
  };
  web_app_data?: { button_text?: string; data: string };
  write_access_allowed?: unknown;
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
  poll?: TelegramPoll;
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
      linkPreview?:
        | boolean
        | {
            disabled?: boolean;
            preferLargeMedia?: boolean;
            preferSmallMedia?: boolean;
            showAboveText?: boolean;
            url?: string;
          };
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
    const linkPreviewOptions = linkPreviewToTelegram(opts?.linkPreview);
    if (linkPreviewOptions) {
      params.link_preview_options = linkPreviewOptions;
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
    emoji: string | null,
    opts?: { isBig?: boolean }
  ): Promise<true> {
    return this.call("setMessageReaction", {
      chat_id: chatId,
      is_big: opts?.isBig,
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

  deleteWebhook(opts?: { dropPendingUpdates?: boolean }): Promise<true> {
    return this.call("deleteWebhook", {
      drop_pending_updates: opts?.dropPendingUpdates,
    });
  }

  getChat(chatId: string): Promise<{ title?: string; type?: string }> {
    return this.call("getChat", { chat_id: chatId });
  }
}

/** Map Skyline `linkPreview` to Telegram `link_preview_options`. */
export function linkPreviewToTelegram(
  linkPreview?:
    | boolean
    | {
        disabled?: boolean;
        preferLargeMedia?: boolean;
        preferSmallMedia?: boolean;
        showAboveText?: boolean;
        url?: string;
      }
): Record<string, unknown> | undefined {
  if (linkPreview === undefined || linkPreview === true) {
    return undefined;
  }
  if (linkPreview === false) {
    return { is_disabled: true };
  }
  return {
    ...(linkPreview.disabled ? { is_disabled: true } : {}),
    ...(linkPreview.url ? { url: linkPreview.url } : {}),
    ...(linkPreview.preferLargeMedia ? { prefer_large_media: true } : {}),
    ...(linkPreview.preferSmallMedia ? { prefer_small_media: true } : {}),
    ...(linkPreview.showAboveText ? { show_above_text: true } : {}),
  };
}

export function applyCommonOpts(
  params: Record<string, unknown>,
  opts?: {
    allowPaidBroadcast?: boolean;
    allowSendingWithoutReply?: boolean;
    businessConnectionId?: string;
    callbackQueryId?: string;
    caption?: string;
    directMessagesTopicId?: number | string;
    entities?: unknown[];
    messageEffectId?: string;
    parseMode?: "HTML" | "MarkdownV2";
    protect?: boolean;
    quote?: {
      entities?: { length: number; offset: number; type: string }[];
      parseMode?: "HTML" | "MarkdownV2";
      position?: number;
      text: string;
    };
    receiverUserId?: number | string;
    replyMarkup?: unknown;
    replyTo?: string;
    silent?: boolean;
    suggestedPost?: {
      price?: { amount: number; currency: string };
      send_date?: number;
    };
    threadId?: number | string;
  }
): void {
  if (!opts) {
    return;
  }
  if (opts.replyTo) {
    params.reply_parameters = {
      message_id: Number(opts.replyTo),
      ...(opts.allowSendingWithoutReply
        ? { allow_sending_without_reply: true }
        : {}),
      ...(opts.quote
        ? {
            quote: opts.quote.text,
            ...(opts.quote.position != null
              ? { quote_position: opts.quote.position }
              : {}),
            ...(opts.quote.parseMode
              ? { quote_parse_mode: opts.quote.parseMode }
              : {}),
            ...(opts.quote.entities?.length
              ? { quote_entities: opts.quote.entities }
              : {}),
          }
        : {}),
    };
  }
  if (opts.businessConnectionId) {
    params.business_connection_id = opts.businessConnectionId;
  }
  if (opts.callbackQueryId) {
    params.callback_query_id = opts.callbackQueryId;
  }
  if (opts.directMessagesTopicId != null) {
    params.direct_messages_topic_id = Number(opts.directMessagesTopicId);
  }
  if (opts.receiverUserId != null) {
    params.receiver_user_id = Number(opts.receiverUserId);
  }
  if (opts.suggestedPost) {
    params.suggested_post_parameters = {
      ...(opts.suggestedPost.price
        ? {
            price: {
              amount: opts.suggestedPost.price.amount,
              currency: opts.suggestedPost.price.currency,
            },
          }
        : {}),
      ...(opts.suggestedPost.send_date != null
        ? { send_date: opts.suggestedPost.send_date }
        : {}),
    };
  }
  if (opts.messageEffectId) {
    params.message_effect_id = opts.messageEffectId;
  }
  if (opts.allowPaidBroadcast) {
    params.allow_paid_broadcast = true;
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
            if (btn.switchInlineQueryChosenChat) {
              out.switch_inline_query_chosen_chat = {
                ...(btn.switchInlineQueryChosenChat.query != null
                  ? { query: btn.switchInlineQueryChosenChat.query }
                  : {}),
                ...(btn.switchInlineQueryChosenChat.allowUserChats
                  ? { allow_user_chats: true }
                  : {}),
                ...(btn.switchInlineQueryChosenChat.allowBotChats
                  ? { allow_bot_chats: true }
                  : {}),
                ...(btn.switchInlineQueryChosenChat.allowGroupChats
                  ? { allow_group_chats: true }
                  : {}),
                ...(btn.switchInlineQueryChosenChat.allowChannelChats
                  ? { allow_channel_chats: true }
                  : {}),
              };
            }
            if (btn.loginUrl) {
              out.login_url = {
                url: btn.loginUrl.url,
                ...(btn.loginUrl.forwardText
                  ? { forward_text: btn.loginUrl.forwardText }
                  : {}),
                ...(btn.loginUrl.botUsername
                  ? { bot_username: btn.loginUrl.botUsername }
                  : {}),
                ...(btn.loginUrl.requestWriteAccess
                  ? { request_write_access: true }
                  : {}),
              };
            }
            if (btn.copyText) {
              out.copy_text = { text: btn.copyText };
            }
            if (btn.pay) {
              out.pay = true;
            }
            if (btn.callbackGame) {
              out.callback_game = {};
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
    // getUpdates returns 409 while a webhook is registered; clear it so
    // long-poll works after switching away from a webhook deployment.
    try {
      await client.deleteWebhook();
    } catch {
      /* no webhook set / start polling anyway */
    }
    try {
      // Drain backlog so a new process does not replay stale callbacks/messages.
      for (;;) {
        const pending = await client.getUpdates({ offset, timeout: 0 });
        if (!pending.length) {
          break;
        }
        offset = pending[pending.length - 1]!.update_id + 1;
      }
    } catch {
      /* start polling anyway */
    }

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
  opts?: {
    certificate?: string;
    ipAddress?: string;
    maxConnections?: number;
    secretToken?: string;
  }
): Promise<void> {
  const info = await client.call<{ url?: string }>("getWebhookInfo");
  if (info.url === webhookUrl) {
    return;
  }
  await client.call("setWebhook", {
    allowed_updates: [...ALLOWED_UPDATES],
    certificate: opts?.certificate,
    drop_pending_updates: false,
    ip_address: opts?.ipAddress,
    max_connections: opts?.maxConnections,
    secret_token: opts?.secretToken,
    url: webhookUrl,
  });
}
