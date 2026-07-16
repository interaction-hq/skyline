import type {
  AttachmentInput,
  Content,
  KeyboardContent,
  MessageEntity,
  SendOptions,
  StreamTextContent,
} from "@skyline-ts/core/content";
import {
  mimeToMediaName,
  readMediaBytes,
  UnsupportedError,
  renderInlineTokens as inlinePlainText,
} from "@skyline-ts/core/host";
import { Marked, type MarkedToken, type Token, type Tokens } from "marked";
import {
  applyCommonOpts,
  type SentMessage,
  type TelegramClient,
  type TelegramPoll,
  keyboardToReplyMarkup,
  replyMarkupToTelegram,
} from "./client.js";
import { rememberPollFromTelegram } from "./inbound.js";

const TELEGRAM_CHAT_SCOPED_METHODS = new Set<string>([
  "answerChatJoinRequestQuery",
  "approveChatJoinRequest",
  "approveSuggestedPost",
  "banChatMember",
  "banChatSenderChat",
  "closeForumTopic",
  "closeGeneralForumTopic",
  "copyMessage",
  "copyMessages",
  "createChatInviteLink",
  "createChatSubscriptionInviteLink",
  "createForumTopic",
  "declineChatJoinRequest",
  "declineSuggestedPost",
  "deleteAllMessageReactions",
  "deleteChatPhoto",
  "deleteChatStickerSet",
  "deleteForumTopic",
  "deleteMessage",
  "deleteMessageReaction",
  "deleteMessages",
  "editChatInviteLink",
  "editChatSubscriptionInviteLink",
  "editForumTopic",
  "editGeneralForumTopic",
  "editMessageCaption",
  "editMessageChecklist",
  "editMessageLiveLocation",
  "editMessageMedia",
  "editMessageReplyMarkup",
  "editMessageText",
  "exportChatInviteLink",
  "forwardMessage",
  "forwardMessages",
  "getChat",
  "getChatAdministrators",
  "getChatGifts",
  "getChatMember",
  "getChatMemberCount",
  "getChatMenuButton",
  "getUserPersonalChatMessages",
  "hideGeneralForumTopic",
  "leaveChat",
  "pinChatMessage",
  "promoteChatMember",
  "reopenForumTopic",
  "reopenGeneralForumTopic",
  "restrictChatMember",
  "revokeChatInviteLink",
  "sendAnimation",
  "sendAudio",
  "sendChatAction",
  "sendChatJoinRequestWebApp",
  "sendChecklist",
  "sendContact",
  "sendDice",
  "sendDocument",
  "sendGame",
  "sendInvoice",
  "sendLivePhoto",
  "sendLocation",
  "sendMediaGroup",
  "sendMessage",
  "sendMessageDraft",
  "sendPaidMedia",
  "sendPhoto",
  "sendPoll",
  "sendRichMessage",
  "sendRichMessageDraft",
  "sendSticker",
  "sendVenue",
  "sendVideo",
  "sendVideoNote",
  "sendVoice",
  "setChatAdministratorCustomTitle",
  "setChatDescription",
  "setChatMemberTag",
  "setChatMenuButton",
  "setChatPermissions",
  "setChatPhoto",
  "setChatStickerSet",
  "setChatTitle",
  "setMessageReaction",
  "stopMessageLiveLocation",
  "stopPoll",
  "unbanChatMember",
  "unbanChatSenderChat",
  "unhideGeneralForumTopic",
  "unpinAllChatMessages",
  "unpinAllForumTopicMessages",
  "unpinAllGeneralForumTopicMessages",
  "unpinChatMessage"
]);

/**
 * Telegram reactions are emoji strings. `setMessageReaction` only accepts a
 * fixed set in non-premium chats; anything else fails with `REACTION_INVALID`.
 * Treat membership as a best-effort hint, not a hard guarantee.
 */
export const ALLOWED_REACTION_EMOJI: ReadonlySet<string> = new Set([
  "👍",
  "👎",
  "❤",
  "🔥",
  "🥰",
  "👏",
  "😁",
  "🤔",
  "🤯",
  "😱",
  "🤬",
  "😢",
  "🎉",
  "🤩",
  "🤮",
  "💩",
  "🙏",
  "👌",
  "🕊",
  "🤡",
  "🥱",
  "🥴",
  "😍",
  "🐳",
  "❤‍🔥",
  "🌚",
  "🌭",
  "💯",
  "🤣",
  "⚡",
  "🍌",
  "🏆",
  "💔",
  "🤨",
  "😐",
  "🍓",
  "🍾",
  "💋",
  "🖕",
  "😈",
  "😴",
  "😭",
  "🤓",
  "👻",
  "👨‍💻",
  "👀",
  "🎃",
  "🙈",
  "😇",
  "😨",
  "🤝",
  "✍",
  "🤗",
  "🫡",
  "🎅",
  "🎄",
  "☃",
  "💅",
  "🤪",
  "🗿",
  "🆒",
  "💘",
  "🙉",
  "🦄",
  "😘",
  "💊",
  "🙊",
  "😎",
  "👾",
  "🤷‍♂",
  "🤷",
  "🤷‍♀",
  "😡",
]);

const VARIATION_SELECTOR_16 = /️/g;

const stripVariationSelector = (emoji: string): string =>
  emoji.replace(VARIATION_SELECTOR_16, "");

/**
 * Telegram's reaction set uses bare codepoints (no U+FE0F variation selector),
 * while clients often carry the emoji-presentation form (e.g. `❤️`).
 * Strip the selector before comparing so both forms validate.
 */
export const isAllowedReactionEmoji = (emoji: string): boolean =>
  ALLOWED_REACTION_EMOJI.has(stripVariationSelector(emoji));

/**
 * The form to send to `setMessageReaction`. Known reactions are normalized to
 * the bare codepoint Telegram expects; unknown emoji pass through unchanged so
 * the API's own validation (and our clearer error) can take over.
 */
export const normalizeReactionEmoji = (emoji: string): string =>
  isAllowedReactionEmoji(emoji) ? stripVariationSelector(emoji) : emoji;

// Private instance: immune to host apps reconfiguring the global `marked`
// singleton via `marked.use()` / `marked.setOptions()`.
const markdownLexer = new Marked();

const BULLET = "• ";
const HR_LINE = "———";
const NESTED_LIST_INDENT = "  ";
const BLOCK_SEPARATOR = "\n\n";
const TABLE_CELL_SEPARATOR = " | ";
const DEFAULT_LIST_START = 1;

const AMP_PATTERN = /&/g;
const LT_PATTERN = /</g;
const GT_PATTERN = />/g;
const QUOTE_PATTERN = /"/g;

const escapeHtml = (value: string): string =>
  value
    .replace(AMP_PATTERN, "&amp;")
    .replace(LT_PATTERN, "&lt;")
    .replace(GT_PATTERN, "&gt;");

const escapeAttribute = (value: string): string =>
  escapeHtml(value).replace(QUOTE_PATTERN, "&quot;");

// Same narrowing dodge as utils/markdown.ts: `Tokens.Generic`'s index
// signature defeats discriminated-union narrowing on `Token`.
const asMarkedToken = (token: Token): MarkedToken => token as MarkedToken;

const checkboxPrefix = (item: Tokens.ListItem): string => {
  if (!item.task) {
    return "";
  }
  return item.checked ? "[x] " : "[ ] ";
};

const listMarker = (list: Tokens.List, index: number): string => {
  if (!list.ordered) {
    return BULLET;
  }
  const start = list.start === "" ? DEFAULT_LIST_START : list.start;
  return `${start + index}. `;
};

const renderLink = (token: Tokens.Link): string => {
  // A bare autolink lexes with its label equal to its href — emit the plain
  // url and let the Telegram client auto-link it.
  if (token.text === token.href) {
    return escapeHtml(token.href);
  }
  return `<a href="${escapeAttribute(token.href)}">${renderInlineTokens(token.tokens)}</a>`;
};

// Telegram HTML has no <img>; an image degrades to a link labeled by its
// alt text (or the bare url when there is none).
const renderImage = (token: Tokens.Image): string =>
  `<a href="${escapeAttribute(token.href)}">${escapeHtml(token.text || token.href)}</a>`;

const renderText = (token: Tokens.Text): string => {
  if (token.tokens) {
    return renderInlineTokens(token.tokens);
  }
  // `escaped` is set when the lexer already entity-encoded the text (raw
  // HTML blocks); escaping again would double-encode.
  return token.escaped ? token.text : escapeHtml(token.text);
};

const renderInlineToken = (token: MarkedToken): string => {
  switch (token.type) {
    case "strong":
      return `<b>${renderInlineTokens(token.tokens)}</b>`;
    case "em":
      return `<i>${renderInlineTokens(token.tokens)}</i>`;
    case "del":
      return `<s>${renderInlineTokens(token.tokens)}</s>`;
    case "codespan":
      return `<code>${escapeHtml(token.text)}</code>`;
    case "br":
      return "\n";
    case "link":
      return renderLink(token);
    case "image":
      return renderImage(token);
    case "escape":
      return escapeHtml(token.text);
    case "text":
      return renderText(token);
    // Raw HTML in markdown source renders literally, never passes through:
    // a tag outside Telegram's whitelist would 400 the whole Bot API call
    // (a TelegramApiError, not UnsupportedError — the plain-text fallback
    // would not catch it). Escaping makes invalid output impossible.
    case "html":
      return escapeHtml(token.text);
    // Task-item checkboxes are rendered from `ListItem.task`/`checked`.
    case "checkbox":
      return "";
    default:
      return "raw" in token ? escapeHtml(String(token.raw)) : "";
  }
};

const renderInlineTokens = (tokens: Token[]): string => {
  let out = "";
  for (const token of tokens) {
    out += renderInlineToken(asMarkedToken(token));
  }
  return out;
};

const renderCode = (token: Tokens.Code): string => {
  if (token.lang) {
    return `<pre><code class="language-${escapeAttribute(token.lang)}">${escapeHtml(token.text)}</code></pre>`;
  }
  return `<pre>${escapeHtml(token.text)}</pre>`;
};

// Telegram rejects nested <blockquote> tags, so inner quotes are flattened
// into the single enclosing tag as plain lines.
const renderQuoteBody = (tokens: Token[]): string => {
  const blocks: string[] = [];
  for (const token of tokens) {
    const marked = asMarkedToken(token);
    const rendered =
      marked.type === "blockquote"
        ? renderQuoteBody(marked.tokens)
        : renderBlockToken(marked);
    if (rendered) {
      blocks.push(rendered);
    }
  }
  return blocks.join("\n");
};

// Telegram has no list markup; items become `•`/`1.` text lines whose inline
// children keep their HTML styling. Blocks inside an item stack on single
// newlines, continuation lines indented under the marker.
const renderList = (list: Tokens.List): string => {
  const lines: string[] = [];
  for (const [index, item] of list.items.entries()) {
    const prefix = `${listMarker(list, index)}${checkboxPrefix(item)}`;
    const blocks: string[] = [];
    for (const token of item.tokens) {
      const rendered = renderBlockToken(asMarkedToken(token));
      if (rendered) {
        blocks.push(rendered);
      }
    }
    const [first = "", ...rest] = blocks.join("\n").split("\n");
    lines.push(`${prefix}${first}`);
    for (const line of rest) {
      lines.push(`${NESTED_LIST_INDENT}${line}`);
    }
  }
  return lines.join("\n");
};

// Telegram has no table markup; a <pre> block keeps columns aligned in
// monospace. Cells render as plain text (inline HTML inside <pre> shows
// literally, so styling is dropped rather than leaked as markup).
const renderTable = (table: Tokens.Table): string => {
  const renderRow = (cells: Tokens.TableCell[]): string =>
    cells
      .map((cell) => inlinePlainText(cell.tokens))
      .join(TABLE_CELL_SEPARATOR);
  const lines = [renderRow(table.header)];
  for (const row of table.rows) {
    lines.push(renderRow(row));
  }
  return `<pre>${escapeHtml(lines.join("\n"))}</pre>`;
};

const renderBlockToken = (token: MarkedToken): string => {
  switch (token.type) {
    // Telegram has no headings; bold is the conventional stand-in.
    case "heading":
      return `<b>${renderInlineTokens(token.tokens)}</b>`;
    case "paragraph":
      return renderInlineTokens(token.tokens);
    case "code":
      return renderCode(token);
    case "blockquote":
      return `<blockquote>${renderQuoteBody(token.tokens)}</blockquote>`;
    case "list":
      return renderList(token);
    case "table":
      return renderTable(token);
    case "hr":
      return HR_LINE;
    case "space":
    case "def":
      return "";
    default:
      return renderInlineToken(token);
  }
};

/**
 * Render standard markdown (CommonMark + GFM) to Telegram-flavored HTML for
 * `parse_mode: "HTML"` sends. Only tags Telegram accepts are emitted; all
 * text (including raw HTML in the source) is entity-escaped so the output
 * can never fail Bot API parsing.
 */
export const markdownToTelegramHtml = (markdown: string): string => {
  const blocks: string[] = [];
  for (const token of markdownLexer.lexer(markdown)) {
    const rendered = renderBlockToken(asMarkedToken(token));
    if (rendered) {
      blocks.push(rendered);
    }
  }
  return blocks.join(BLOCK_SEPARATOR).trim();
};

const DRAFT_THROTTLE_MS = 500;
let nextDraftId = 1;

/**
 * Native streaming via `sendMessageDraft` in private chats. Groups throw
 * UnsupportedError before consuming the stream so core can drain → one send.
 */
export async function sendStreamText(
  client: TelegramClient,
  chatId: string,
  content: StreamTextContent
): Promise<string> {
  const numericId = Number(chatId);
  if (!(Number.isInteger(numericId) && numericId > 0)) {
    throw new UnsupportedError(
      "telegram",
      "sending stream_text content in non-private chats"
    );
  }

  const draftId = nextDraftId;
  nextDraftId += 1;

  const renderBody = (
    text: string
  ): { text: string; parseMode?: "HTML" } =>
    content.format === "markdown"
      ? { text: markdownToTelegramHtml(text), parseMode: "HTML" }
      : { text };

  let lastDraftText: string | undefined;
  let lastDraftAt = 0;
  let draftsAvailable = true;

  const updateDraft = async (text: string): Promise<void> => {
    if (!draftsAvailable || text === lastDraftText) {
      return;
    }
    try {
      const body = renderBody(text);
      await client.sendMessageDraft(numericId, draftId, body.text, {
        parseMode: body.parseMode,
      });
      lastDraftText = text;
      lastDraftAt = Date.now();
    } catch {
      draftsAvailable = false;
    }
  };

  await updateDraft("");

  let full = "";
  for await (const delta of content.stream()) {
    full += delta;
    if (Date.now() - lastDraftAt >= DRAFT_THROTTLE_MS) {
      await updateDraft(full);
    }
  }

  if (!full) {
    throw new UnsupportedError(
      "telegram",
      "sending stream_text content that produced no text"
    );
  }

  const body = renderBody(full);
  const sent = await client.sendMessage(chatId, body.text, {
    parseMode: body.parseMode,
  });
  return String(sent.message_id);
}

function parseMessageId(id: string): number {
  const messageId = Number(id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error(
      `Telegram message id must be a positive integer (got "${id}").`
    );
  }
  return messageId;
}

function mapEntities(entities?: MessageEntity[]) {
  return entities?.map((entity) => ({
    custom_emoji_id: entity.customEmojiId,
    language: entity.language,
    length: entity.length,
    offset: entity.offset,
    type: entity.type,
    url: entity.url,
    user: entity.user ? { id: Number(entity.user.id) } : undefined,
  }));
}

/** Map an attachment reference (url / file_id) to an `InputMedia` for polls. */
function pollMediaFromInput(input?: AttachmentInput) {
  if (!input?.url) {
    return undefined;
  }
  const mime = input.mimeType ?? "";
  const type = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : mime === "image/gif"
        ? "animation"
        : "photo";
  return { media: input.url, type };
}

function optsFromSend(sendOpts?: SendOptions) {
  const markup = sendOpts?.replyMarkup;
  return {
    allowPaidBroadcast: sendOpts?.allowPaidBroadcast,
    allowSendingWithoutReply: sendOpts?.allowSendingWithoutReply,
    businessConnectionId: sendOpts?.businessConnectionId,
    callbackQueryId: sendOpts?.callbackQueryId,
    caption: sendOpts?.caption,
    directMessagesTopicId: sendOpts?.directMessagesTopicId,
    entities: sendOpts?.entities?.map((entity) => ({
      custom_emoji_id: entity.customEmojiId,
      language: entity.language,
      length: entity.length,
      offset: entity.offset,
      type: entity.type,
      url: entity.url,
      user: entity.user ? { id: Number(entity.user.id) } : undefined,
    })),
    messageEffectId: sendOpts?.messageEffectId,
    parseMode: sendOpts?.parseMode,
    protect: sendOpts?.protect,
    quote: sendOpts?.quote
      ? {
          parseMode: sendOpts.quote.parseMode,
          position: sendOpts.quote.position,
          text: sendOpts.quote.text,
          ...(sendOpts.quote.entities?.length
            ? {
                entities: sendOpts.quote.entities.map((entity) => ({
                  custom_emoji_id: entity.customEmojiId,
                  language: entity.language,
                  length: entity.length,
                  offset: entity.offset,
                  type: entity.type,
                  url: entity.url,
                  user: entity.user ? { id: Number(entity.user.id) } : undefined,
                })),
              }
            : {}),
        }
      : undefined,
    receiverUserId: sendOpts?.receiverUserId,
    replyMarkup:
      markup && typeof markup === "object" && "type" in markup
        ? replyMarkupToTelegram(markup)
        : markup,
    replyTo: sendOpts?.replyTo,
    silent: sendOpts?.silent,
    suggestedPost: sendOpts?.suggestedPost
      ? {
          price: sendOpts.suggestedPost.price
            ? {
                amount: sendOpts.suggestedPost.price.amount,
                currency: sendOpts.suggestedPost.price.currency,
              }
            : undefined,
          send_date: sendOpts.suggestedPost.sendDate,
        }
      : undefined,
    threadId: sendOpts?.threadId,
  };
}

function withCommon(
  chatId: string,
  sendOpts?: SendOptions,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const params: Record<string, unknown> = { chat_id: chatId, ...extra };
  applyCommonOpts(params, optsFromSend(sendOpts));
  return params;
}

async function uploadMedia(
  client: TelegramClient,
  method: string,
  field: string,
  chatId: string,
  bytes: Uint8Array,
  filename: string,
  mimeType: string | undefined,
  sendOpts?: SendOptions,
  extra: Record<string, unknown> = {},
  thumbnail?: { bytes: Uint8Array; mimeType?: string; name?: string }
): Promise<SentMessage> {
  const params = withCommon(chatId, sendOpts, extra);
  if (!thumbnail) {
    return client.upload<SentMessage>(method, params, {
      bytes,
      field,
      filename,
      mimeType,
    });
  }
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
    field,
    new Blob([Uint8Array.from(bytes)], {
      type: mimeType ?? "application/octet-stream",
    }),
    filename
  );
  form.append(
    "thumbnail",
    new Blob([Uint8Array.from(thumbnail.bytes)], {
      type: thumbnail.mimeType ?? "image/jpeg",
    }),
    thumbnail.name ?? "thumb.jpg"
  );
  return client.uploadForm<SentMessage>(method, form);
}

async function readThumbnail(
  thumb: AttachmentInput | undefined
): Promise<{ bytes: Uint8Array; mimeType?: string; name?: string } | undefined> {
  if (!thumb) {
    return undefined;
  }
  const bytes = await readMediaBytes(thumb);
  return { bytes, mimeType: thumb.mimeType ?? "image/jpeg", name: thumb.name };
}

/**
 * Unified Content → Bot API. Telegram-only Bot API shapes go through
 * Escape hatch for rare Bot API methods: `custom({ method, params })`.
 */
export type SendContentResult =
  | string
  | { guid: string; albumGuids: string[]; mediaGroupId?: string };

export async function sendContent(
  client: TelegramClient,
  chatId: string,
  content: Content,
  sendOpts: SendOptions | undefined,
  unsupported: (verb: string) => never
): Promise<SendContentResult | undefined> {
  switch (content.type) {
    case "text": {
      const res = await client.sendMessage(chatId, content.text, {
        ...optsFromSend(sendOpts),
        linkPreview: sendOpts?.linkPreview,
        parseMode: sendOpts?.parseMode,
      });
      return String(res.message_id);
    }
    case "markdown": {
      const res = await client.sendMessage(
        chatId,
        markdownToTelegramHtml(content.body),
        {
          ...optsFromSend(sendOpts),
          linkPreview: sendOpts?.linkPreview,
          parseMode: sendOpts?.parseMode ?? "HTML",
        }
      );
      return String(res.message_id);
    }
    case "richlink": {
      const res = await client.sendMessage(chatId, content.url, {
        ...optsFromSend(sendOpts),
        linkPreview: sendOpts?.linkPreview ?? true,
      });
      return String(res.message_id);
    }
    case "app": {
      const body = [content.caption, content.url].filter(Boolean).join("\n");
      const res = await client.sendMessage(chatId, body || content.url, {
        ...optsFromSend(sendOpts),
      });
      return String(res.message_id);
    }
    case "attachment": {
      const bytes = await readMediaBytes(content);
      const mime = content.mimeType ?? "application/octet-stream";
      const name = content.name ?? mimeToMediaName(mime, "file");
      const caption = content.caption;
      const thumbnail = await readThumbnail(content.thumbnail);
      if (content.isSticker || mime === "image/webp") {
        const res = await uploadMedia(
          client,
          "sendSticker",
          "sticker",
          chatId,
          bytes,
          name,
          mime,
          sendOpts
        );
        return String(res.message_id);
      }
      if (content.isVideoNote) {
        const res = await uploadMedia(
          client,
          "sendVideoNote",
          "video_note",
          chatId,
          bytes,
          name,
          mime.startsWith("video/") ? mime : "video/mp4",
          sendOpts,
          {
            duration: content.duration,
            length: content.length,
          },
          thumbnail
        );
        return String(res.message_id);
      }
      if (content.isAnimation || mime === "image/gif") {
        const res = await uploadMedia(
          client,
          "sendAnimation",
          "animation",
          chatId,
          bytes,
          name,
          mime,
          sendOpts,
          {
            caption,
            duration: content.duration,
            has_spoiler: content.hasSpoiler,
            height: content.height,
            show_caption_above_media: content.showCaptionAboveMedia,
            width: content.width,
          },
          thumbnail
        );
        return String(res.message_id);
      }
      if (mime.startsWith("image/")) {
        const res = await uploadMedia(
          client,
          "sendPhoto",
          "photo",
          chatId,
          bytes,
          name,
          mime,
          sendOpts,
          {
            caption,
            has_spoiler: content.hasSpoiler,
            show_caption_above_media: content.showCaptionAboveMedia,
          }
        );
        return String(res.message_id);
      }
      if (mime.startsWith("video/")) {
        const res = await uploadMedia(
          client,
          "sendVideo",
          "video",
          chatId,
          bytes,
          name,
          mime,
          sendOpts,
          {
            caption,
            cover: content.cover?.url,
            duration: content.duration,
            has_spoiler: content.hasSpoiler,
            height: content.height,
            show_caption_above_media: content.showCaptionAboveMedia,
            start_timestamp: content.startTimestamp,
            supports_streaming: content.supportsStreaming,
            width: content.width,
          },
          thumbnail
        );
        return String(res.message_id);
      }
      if (mime.startsWith("audio/")) {
        const res = await uploadMedia(
          client,
          "sendAudio",
          "audio",
          chatId,
          bytes,
          name,
          mime,
          sendOpts,
          {
            caption,
            duration: content.duration,
            performer: content.performer,
            title: content.title,
          },
          thumbnail
        );
        return String(res.message_id);
      }
      const res = await uploadMedia(
        client,
        "sendDocument",
        "document",
        chatId,
        bytes,
        name,
        mime,
        sendOpts,
        {
          caption,
          disable_content_type_detection: content.disableContentTypeDetection,
        },
        thumbnail
      );
      return String(res.message_id);
    }
    case "voice": {
      const bytes = await readMediaBytes(content);
      const res = await uploadMedia(
        client,
        "sendVoice",
        "voice",
        chatId,
        bytes,
        content.name ?? "voice.ogg",
        content.mimeType ?? "audio/ogg",
        sendOpts,
        { duration: content.duration }
      );
      return String(res.message_id);
    }
    case "contact": {
      if (content.phones?.[0] || content.firstName) {
        const res = await client.call<SentMessage>(
          "sendContact",
          withCommon(chatId, sendOpts, {
            first_name: content.firstName ?? "Contact",
            last_name: content.lastName,
            phone_number: content.phones?.[0] ?? "",
            vcard: content.vcard,
          })
        );
        return String(res.message_id);
      }
      const vcard =
        content.vcard ??
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${[content.firstName, content.lastName].filter(Boolean).join(" ")}`,
          ...(content.phones ?? []).map((p) => `TEL:${p}`),
          ...(content.emails ?? []).map((e) => `EMAIL:${e}`),
          "END:VCARD",
        ].join("\n");
      const res = await uploadMedia(
        client,
        "sendDocument",
        "document",
        chatId,
        new TextEncoder().encode(vcard),
        "contact.vcf",
        "text/vcard",
        sendOpts
      );
      return String(res.message_id);
    }
    case "poll": {
      const res = await client.call<SentMessage & { poll?: TelegramPoll }>(
        "sendPoll",
        withCommon(chatId, sendOpts, {
          allow_adding_options: content.allowAddingOptions,
          allows_multiple_answers: content.allowsMultipleAnswers,
          allows_revoting: content.allowsRevoting,
          close_date: content.closeDate,
          correct_option_ids:
            content.correctOptionIds ??
            (content.correctOptionId != null
              ? [content.correctOptionId]
              : undefined),
          country_codes: content.countryCodes,
          description: content.description,
          description_entities: mapEntities(content.descriptionEntities),
          description_parse_mode: content.descriptionParseMode,
          explanation: content.explanation,
          explanation_entities: mapEntities(content.explanationEntities),
          explanation_media: pollMediaFromInput(content.explanationMedia),
          explanation_parse_mode: content.explanationParseMode,
          hide_results_until_closes: content.hideResultsUntilCloses,
          is_anonymous: content.isAnonymous,
          is_closed: content.isClosed,
          media: pollMediaFromInput(content.media),
          members_only: content.membersOnly,
          open_period: content.openPeriod,
          options: content.options.map((text) => ({ text })),
          question: content.title,
          question_entities: mapEntities(content.questionEntities),
          question_parse_mode: content.questionParseMode,
          shuffle_options: content.shuffleOptions,
          type: content.pollType,
        })
      );
      const messageGuid = String(res.message_id);
      if (res.poll) {
        rememberPollFromTelegram(chatId, messageGuid, res.poll);
      } else {
        rememberPollFromTelegram(chatId, messageGuid, {
          id: messageGuid,
          options: content.options.map((text) => ({
            text,
            voter_count: 0,
          })),
          question: content.title,
        });
      }
      return messageGuid;
    }
    case "keyboard": {
      const markup = keyboardToReplyMarkup(content as KeyboardContent);
      const body = content.text?.trim() || "Choose an option";
      const res = await client.sendMessage(chatId, body, {
        ...optsFromSend(sendOpts),
        replyMarkup: markup,
      });
      return String(res.message_id);
    }
    case "location": {
      if (content.title && content.address) {
        const res = await client.call<SentMessage>(
          "sendVenue",
          withCommon(chatId, sendOpts, {
            address: content.address,
            foursquare_id: content.foursquareId,
            foursquare_type: content.foursquareType,
            google_place_id: content.googlePlaceId,
            google_place_type: content.googlePlaceType,
            latitude: content.latitude,
            longitude: content.longitude,
            title: content.title,
          })
        );
        return String(res.message_id);
      }
      const res = await client.call<SentMessage>(
        "sendLocation",
        withCommon(chatId, sendOpts, {
          heading: content.heading,
          horizontal_accuracy: content.horizontalAccuracy,
          latitude: content.latitude,
          live_period: content.livePeriod,
          longitude: content.longitude,
          proximity_alert_radius: content.proximityAlertRadius,
        })
      );
      return String(res.message_id);
    }
    case "dice": {
      const res = await client.call<SentMessage>(
        "sendDice",
        withCommon(chatId, sendOpts, { emoji: content.emoji })
      );
      return String(res.message_id);
    }
    case "forward": {
      const res = await client.call<SentMessage>(
        "forwardMessage",
        withCommon(chatId, sendOpts, {
          from_chat_id: content.fromChatId,
          message_id: parseMessageId(content.messageId),
          video_start_timestamp: content.videoStartTimestamp,
        })
      );
      return String(res.message_id);
    }
    case "copy": {
      const res = await client.call<{ message_id: number }>(
        "copyMessage",
        withCommon(chatId, sendOpts, {
          caption: content.caption,
          caption_entities: mapEntities(content.captionEntities),
          from_chat_id: content.fromChatId,
          message_id: parseMessageId(content.messageId),
          parse_mode: content.parseMode,
          show_caption_above_media: content.showCaptionAboveMedia,
          video_start_timestamp: content.videoStartTimestamp,
        })
      );
      return String(res.message_id);
    }
    case "invoice": {
      const res = await client.call<SentMessage>(
        "sendInvoice",
        withCommon(chatId, sendOpts, {
          currency: content.currency,
          description: content.description,
          is_flexible: content.isFlexible,
          max_tip_amount: content.maxTipAmount,
          need_email: content.needEmail,
          need_name: content.needName,
          need_phone_number: content.needPhoneNumber,
          need_shipping_address: content.needShippingAddress,
          payload: content.payload,
          photo_height: content.photoHeight,
          photo_size: content.photoSize,
          photo_url: content.photoUrl,
          photo_width: content.photoWidth,
          prices: content.prices,
          provider_data: content.providerData,
          provider_token: content.providerToken ?? "",
          send_email_to_provider: content.sendEmailToProvider,
          send_phone_number_to_provider: content.sendPhoneNumberToProvider,
          start_parameter: content.startParameter,
          suggested_tip_amounts: content.suggestedTipAmounts,
          title: content.title,
        })
      );
      return String(res.message_id);
    }
    case "game": {
      const res = await client.call<SentMessage>(
        "sendGame",
        withCommon(chatId, sendOpts, {
          game_short_name: content.gameShortName,
        })
      );
      return String(res.message_id);
    }
    case "forward_many": {
      await client.call(
        "forwardMessages",
        withCommon(chatId, sendOpts, {
          from_chat_id: content.fromChatId,
          message_ids: content.messageIds.map(parseMessageId),
        })
      );
      return undefined;
    }
    case "copy_many": {
      await client.call(
        "copyMessages",
        withCommon(chatId, sendOpts, {
          from_chat_id: content.fromChatId,
          message_ids: content.messageIds.map(parseMessageId),
          remove_caption: content.removeCaption,
        })
      );
      return undefined;
    }
    case "checklist": {
      const res = await client.call<SentMessage>(
        "sendChecklist",
        withCommon(chatId, sendOpts, {
          checklist: {
            others_can_add_tasks: content.othersCanAddTasks,
            others_can_mark_tasks_as_done: content.othersCanMarkTasksAsDone,
            tasks: content.items.map((item, index) => ({
              id: item.id ?? String(index + 1),
              text: item.text,
            })),
            title: content.title,
          },
        })
      );
      return res?.message_id != null ? String(res.message_id) : undefined;
    }
    case "paid_media": {
      const media: Record<string, unknown>[] = [];
      const files: {
        bytes: Uint8Array;
        field: string;
        filename: string;
        mimeType?: string;
      }[] = [];
      let attachIndex = 0;
      for (const item of content.media) {
        const bytes = await readMediaBytes(item);
        const mime = item.mimeType ?? "application/octet-stream";
        const kind = mime.startsWith("video/") ? "video" : "photo";
        const field = `file${attachIndex}`;
        attachIndex += 1;
        media.push({ media: `attach://${field}`, type: kind });
        files.push({
          bytes,
          field,
          filename: item.name ?? `${kind}.bin`,
          mimeType: mime,
        });
      }
      const form = new FormData();
      const params = withCommon(chatId, sendOpts, {
        caption: content.caption,
        media,
        payload: content.payload,
        show_caption_above_media: content.showCaptionAboveMedia,
        star_count: content.starCount,
      });
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
      for (const file of files) {
        form.append(
          file.field,
          new Blob([Uint8Array.from(file.bytes)], {
            type: file.mimeType ?? "application/octet-stream",
          }),
          file.filename
        );
      }
      const res = await client.uploadForm<SentMessage>("sendPaidMedia", form);
      return res?.message_id != null ? String(res.message_id) : undefined;
    }
    case "gift": {
      await client.call(
        "sendGift",
        withCommon(chatId, sendOpts, {
          gift_id: content.giftId,
          pay_for_upgrade: content.payForUpgrade,
          text: content.text,
          text_entities: mapEntities(content.textEntities),
          text_parse_mode: content.textParseMode,
          user_id: content.userId != null ? Number(content.userId) : undefined,
        })
      );
      return undefined;
    }
    case "rich_message": {
      const res = await client.call<SentMessage>(
        "sendRichMessage",
        withCommon(chatId, sendOpts, {
          is_rtl: content.isRtl,
          skip_entity_detection: content.skipEntityDetection,
          text: content.text ?? content.markdown ?? content.html,
        })
      );
      return res?.message_id != null ? String(res.message_id) : undefined;
    }
    case "story":
    case "giveaway":
    case "giveaway_winners":
      throw new UnsupportedError(
        "telegram",
        `sending ${content.type} content — bots receive these inbound but cannot create them (post business stories via channel.stories.post)`
      );
    case "live_photo": {
      const photoBytes = await readMediaBytes(content.photo);
      const videoBytes = await readMediaBytes(content.video);
      const form = new FormData();
      const params = withCommon(chatId, sendOpts, {
        caption: content.caption,
        has_spoiler: content.hasSpoiler,
        show_caption_above_media: content.showCaptionAboveMedia,
      });
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
        "photo",
        new Blob([Uint8Array.from(photoBytes)], {
          type: content.photo.mimeType ?? "image/jpeg",
        }),
        content.photo.name ?? "photo.jpg"
      );
      form.append(
        "live_photo",
        new Blob([Uint8Array.from(videoBytes)], {
          type: content.video.mimeType ?? "video/mp4",
        }),
        content.video.name ?? "live.mp4"
      );
      const res = await client.uploadForm<SentMessage>("sendLivePhoto", form);
      return res?.message_id != null ? String(res.message_id) : undefined;
    }
    case "media_album": {
      const media: Record<string, unknown>[] = [];
      const files: {
        bytes: Uint8Array;
        field: string;
        filename: string;
        mimeType?: string;
      }[] = [];
      let attachIndex = 0;
      for (const item of content.items) {
        const bytes = await readMediaBytes(item);
        const mime = item.mimeType ?? "application/octet-stream";
        const kind = mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : mime.startsWith("image/")
              ? "photo"
              : "document";
        const field = `file${attachIndex}`;
        attachIndex += 1;
        media.push({ media: `attach://${field}`, type: kind });
        files.push({
          bytes,
          field,
          filename: item.name ?? `${kind}.bin`,
          mimeType: mime,
        });
      }
      const form = new FormData();
      const params = withCommon(chatId, sendOpts, { media });
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
      for (const file of files) {
        form.append(
          file.field,
          new Blob([Uint8Array.from(file.bytes)], {
            type: file.mimeType ?? "application/octet-stream",
          }),
          file.filename
        );
      }
      const res = await client.uploadForm<SentMessage[]>(
        "sendMediaGroup",
        form
      );
      const guids = (res ?? [])
        .map((m) => (m?.message_id != null ? String(m.message_id) : undefined))
        .filter((id): id is string => id != null);
      const [first] = guids;
      if (!first) {
        return;
      }
      return {
        albumGuids: guids,
        guid: first,
        mediaGroupId: res?.[0]?.media_group_id,
      };
    }
    case "custom": {
      const raw = content.raw as {
        method?: string;
        params?: Record<string, unknown>;
      };
      if (!(raw && typeof raw.method === "string")) {
        throw new Error(
          "Telegram custom content `raw` must be `{ method, params }`"
        );
      }
      const params = { ...(raw.params ?? {}) };
      if (
        TELEGRAM_CHAT_SCOPED_METHODS.has(raw.method as never) &&
        params.chat_id === undefined
      ) {
        params.chat_id = chatId;
      }
      const res = await client.call<SentMessage | boolean | unknown>(
        raw.method,
        params
      );
      if (
        res &&
        typeof res === "object" &&
        "message_id" in res &&
        (res as SentMessage).message_id != null
      ) {
        return String((res as SentMessage).message_id);
      }
      return undefined;
    }
    case "group": {
      let last: SendContentResult | undefined;
      for (const item of content.items) {
        last = await sendContent(
          client,
          chatId,
          item,
          sendOpts,
          unsupported
        );
      }
      return last;
    }
    case "reply": {
      const targetGuid = content.target.guid;
      if (!targetGuid) {
        throw new Error("reply: target message has no guid");
      }
      return sendContent(
        client,
        chatId,
        content.content,
        { ...sendOpts, replyTo: targetGuid },
        unsupported
      );
    }
    case "edit": {
      const targetGuid = content.target.guid;
      if (!targetGuid) {
        throw new Error("edit: target message has no guid");
      }
      const inner = content.content;
      if (inner.type === "text") {
        await client.editMessageText(chatId, targetGuid, inner.text, {
          replyMarkup: optsFromSend(sendOpts).replyMarkup,
        });
      } else if (inner.type === "markdown") {
        await client.editMessageText(
          chatId,
          targetGuid,
          markdownToTelegramHtml(inner.body),
          {
            parseMode: "HTML",
            replyMarkup: optsFromSend(sendOpts).replyMarkup,
          }
        );
      } else {
        unsupported(`editing ${inner.type} content`);
      }
      return;
    }
    case "unsend": {
      const targetGuid = content.target.guid;
      if (!targetGuid) {
        throw new Error("unsend: target message has no guid");
      }
      await client.deleteMessage(chatId, targetGuid);
      return;
    }
    case "reaction": {
      const targetGuid = content.target.guid;
      if (!targetGuid) {
        throw new Error("reaction: target message has no guid");
      }
      const emoji = normalizeReactionEmoji(content.emoji);
      if (!isAllowedReactionEmoji(emoji)) {
        throw new UnsupportedError(
          "telegram",
          `reaction emoji "${content.emoji}"`
        );
      }
      await client.setMessageReaction(chatId, targetGuid, emoji);
      return;
    }
    case "typing": {
      if (content.state === "start") {
        await client.sendChatAction(chatId, "typing");
      }
      return;
    }
    case "read":
      return;
    case "rename": {
      await client.call("setChatTitle", {
        chat_id: chatId,
        title: content.displayName,
      });
      return;
    }
    case "avatar": {
      if (content.action.kind === "clear") {
        await client.call("deleteChatPhoto", { chat_id: chatId });
      } else {
        const bytes = await content.action.read();
        await client.upload(
          "setChatPhoto",
          { chat_id: chatId },
          {
            bytes,
            field: "photo",
            filename: "photo.jpg",
            mimeType: "image/jpeg",
          }
        );
      }
      return;
    }
    case "leaveChannel": {
      await client.call("leaveChat", { chat_id: chatId });
      return;
    }
    case "addMember":
      unsupported("sending addMember content — bots cannot freely add users");
      break;
    case "removeMember": {
      for (const member of content.members) {
        await client.call("banChatMember", {
          chat_id: chatId,
          revoke_messages: content.revokeMessages,
          until_date: content.untilDate,
          user_id: Number(member),
        });
      }
      return;
    }
    case "stream_text":
      return sendStreamText(client, chatId, content);
    case "flow":
    case "digital_touch":
    case "wa_media":
    case "wa_template":
    case "wa_interactive":
    case "wa_location":
    case "wa_contacts":
      unsupported(`sending ${content.type} content`);
      break;
    default: {
      const _exhaustive: never = content;
      throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
