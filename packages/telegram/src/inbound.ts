import type { Content } from "@skyline-ts/core/content";
import type { Channel, JsonValue, Message, PollInfo } from "@skyline-ts/core";
import {
  attachmentWithDownload,
  bindMessage,
  type SkylineHost,
} from "@skyline-ts/core/host";
import type {
  TelegramClient,
  TelegramMessage,
  TelegramUpdate,
} from "./client.js";

const pollByMessage = new Map<string, PollInfo>();
const messageKeyByPollId = new Map<string, string>();

function pollMessageKey(chatId: string, messageGuid: string): string {
  return `${chatId}:${messageGuid}`;
}

export function rememberPoll(info: PollInfo, pollId?: string): void {
  pollByMessage.set(pollMessageKey(info.chatId, info.pollMessageGuid), info);
  if (pollId) {
    messageKeyByPollId.set(
      pollId,
      pollMessageKey(info.chatId, info.pollMessageGuid)
    );
  }
}

export function rememberPollFromTelegram(
  chatId: string,
  messageGuid: string,
  poll: {
    id: string;
    options: { text: string; voter_count: number }[];
    question: string;
  }
): void {
  rememberPoll(
    {
      chatId,
      options: poll.options.map((o, index) => ({
        id: String(index),
        text: o.text,
      })),
      pollMessageGuid: messageGuid,
      title: poll.question,
      votes: poll.options.flatMap((o, index) =>
        Array.from({ length: o.voter_count }, () => ({
          optionId: String(index),
        }))
      ),
    },
    poll.id
  );
}

export function getCachedPoll(
  chatId: string,
  messageGuid: string
): PollInfo | null {
  return pollByMessage.get(pollMessageKey(chatId, messageGuid)) ?? null;
}

function resolvePollMessageGuid(
  chatId: string,
  pollId: string
): string {
  const key = messageKeyByPollId.get(pollId);
  if (key?.startsWith(`${chatId}:`)) {
    return key.slice(chatId.length + 1);
  }
  return pollId;
}

export type InboundResult =
  | { kind: "message"; chatId: string; message: Message }
  | {
      kind: "reaction";
      chatId: string;
      messageGuid: string;
      reaction: string;
      removed: boolean;
      senderId: string;
      timestamp: Date;
    }
  | {
      kind: "edited";
      chatId: string;
      messageGuid: string;
      senderId: string;
      text: string;
      timestamp: Date;
    }
  | {
      kind: "callback";
      chatId: string;
      data: string;
      messageGuid?: string;
      queryId: string;
      senderId: string;
      timestamp: Date;
    }
  | {
      kind: "inline";
      chatId: string;
      chosenResultId?: string;
      offset?: string;
      query: string;
      queryId: string;
      senderId: string;
      timestamp: Date;
    }
  | {
      kind: "joinRequest";
      chatId: string;
      senderId: string;
      timestamp: Date;
      userChatId?: string;
    }
  | {
      kind: "shipping";
      chatId: string;
      invoicePayload: string;
      queryId: string;
      senderId: string;
      shippingAddress: {
        city: string;
        countryCode: string;
        postCode: string;
        state: string;
        streetLine1: string;
        streetLine2: string;
      };
      timestamp: Date;
    }
  | {
      kind: "preCheckout";
      chatId: string;
      currency: string;
      invoicePayload: string;
      queryId: string;
      senderId: string;
      timestamp: Date;
      totalAmount: number;
    }
  | {
      kind: "group";
      chatId: string;
      participantAdded?: string;
      participantRemoved?: string;
      renamedTo?: string;
      timestamp: Date;
    }
  | {
      kind: "poll";
      action: "answer" | "update" | "closed";
      chatId: string;
      isClosed?: boolean;
      optionIds?: number[];
      options?: { text: string; voterCount: number }[];
      pollId?: string;
      pollMessageGuid: string;
      question?: string;
      timestamp: Date;
      userId?: string;
    }
  | {
      kind: "boost";
      boostId?: string;
      chatId: string;
      removed: boolean;
      timestamp: Date;
      userId?: string;
    }
  | {
      kind: "business";
      businessKind: "connection" | "deleted_messages";
      chatId: string;
      connectionId?: string;
      messageIds?: string[];
      timestamp: Date;
      userId?: string;
    }
  | {
      kind: "purchase";
      chatId: string;
      currency?: string;
      payload?: string;
      senderId?: string;
      starCount?: number;
      timestamp: Date;
    }
  | {
      kind: "reactionCount";
      chatId: string;
      messageGuid?: string;
      reactions: { emoji?: string; type: string; totalCount: number }[];
      timestamp: Date;
    }
  | {
      kind: "managed";
      chatId: string;
      timestamp: Date;
      userId?: string;
    }
  | {
      kind: "subscription";
      chatId: string;
      timestamp: Date;
      untilDate?: number;
      userId?: string;
    }
  | {
      kind: "platform";
      chatId: string;
      signalKind: string;
      payload: JsonValue;
      timestamp: Date;
      updateId: number;
    };

export function chatIdFromUpdate(update: TelegramUpdate): string | undefined {
  const msg =
    update.message ??
    update.channel_post ??
    update.edited_message ??
    update.edited_channel_post ??
    update.business_message ??
    update.edited_business_message ??
    update.guest_message;
  if (msg) {
    return String(msg.chat.id);
  }
  if (update.message_reaction) {
    return String(update.message_reaction.chat.id);
  }
  if (update.callback_query?.message) {
    return String(update.callback_query.message.chat.id);
  }
  if (update.callback_query) {
    return String(update.callback_query.from.id);
  }
  if (update.chat_join_request) {
    return String(update.chat_join_request.chat.id);
  }
  if (update.inline_query) {
    return String(update.inline_query.from.id);
  }
  if (update.shipping_query && typeof update.shipping_query === "object") {
    const q = update.shipping_query as { from?: { id: number } };
    if (q.from) {
      return String(q.from.id);
    }
  }
  if (update.pre_checkout_query && typeof update.pre_checkout_query === "object") {
    const q = update.pre_checkout_query as { from?: { id: number } };
    if (q.from) {
      return String(q.from.id);
    }
  }
  const member = update.chat_member ?? update.my_chat_member;
  if (member) {
    return String(member.chat.id);
  }
  if (update.chat_boost && typeof update.chat_boost === "object") {
    const b = update.chat_boost as { chat?: { id: number } };
    if (b.chat) {
      return String(b.chat.id);
    }
  }
  if (update.removed_chat_boost && typeof update.removed_chat_boost === "object") {
    const b = update.removed_chat_boost as { chat?: { id: number } };
    if (b.chat) {
      return String(b.chat.id);
    }
  }
  if (
    update.message_reaction_count &&
    typeof update.message_reaction_count === "object"
  ) {
    const r = update.message_reaction_count as { chat?: { id: number } };
    if (r.chat) {
      return String(r.chat.id);
    }
  }
  if (
    update.purchased_paid_media &&
    typeof update.purchased_paid_media === "object"
  ) {
    const p = update.purchased_paid_media as { from?: { id: number } };
    if (p.from) {
      return String(p.from.id);
    }
  }
  return;
}

function fileDownload(client: TelegramClient, fileId: string) {
  return {
    read: () => client.downloadFile(fileId),
    stream: async () => {
      const bytes = await client.downloadFile(fileId);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  };
}

function mediaFromMessage(
  client: TelegramClient,
  msg: TelegramMessage
): {
  attachments?: Message["attachments"];
  content: Content;
} {
  if (msg.poll) {
    rememberPollFromTelegram(String(msg.chat.id), String(msg.message_id), {
      id: msg.poll.id,
      options: msg.poll.options,
      question: msg.poll.question,
    });
    return {
      content: {
        allowsMultipleAnswers: msg.poll.allows_multiple_answers,
        isAnonymous: msg.poll.is_anonymous,
        isClosed: msg.poll.is_closed,
        options: msg.poll.options.map((o) => o.text),
        pollType: msg.poll.type === "quiz" ? "quiz" : "regular",
        title: msg.poll.question,
        type: "poll",
      },
    };
  }

  if (msg.dice) {
    return {
      content: {
        emoji: msg.dice.emoji as
          | "🎲"
          | "🎯"
          | "🏀"
          | "⚽"
          | "🎳"
          | "🎰"
          | undefined,
        type: "dice",
        value: msg.dice.value,
      },
    };
  }

  if (msg.game?.short_name) {
    return {
      content: {
        gameShortName: msg.game.short_name,
        type: "game",
      },
    };
  }

  if (msg.contact) {
    return {
      content: {
        firstName: msg.contact.first_name,
        lastName: msg.contact.last_name,
        phones: msg.contact.phone_number
          ? [msg.contact.phone_number]
          : undefined,
        type: "contact",
        vcard: msg.contact.vcard,
      },
    };
  }

  if (msg.invoice) {
    return {
      content: {
        currency: msg.invoice.currency,
        description: msg.invoice.description,
        payload: msg.invoice.start_parameter ?? "",
        prices: [
          {
            amount: msg.invoice.total_amount,
            label: msg.invoice.title,
          },
        ],
        title: msg.invoice.title,
        type: "invoice",
      },
    };
  }

  if (msg.voice) {
    return {
      attachments: [
        attachmentWithDownload(
          {
            guid: msg.voice.file_id,
            mimeType: msg.voice.mime_type ?? "audio/ogg",
            name: "voice.ogg",
            size: msg.voice.file_size,
          },
          fileDownload(client, msg.voice.file_id)
        ),
      ],
      content: {
        mimeType: msg.voice.mime_type ?? "audio/ogg",
        name: "voice.ogg",
        type: "voice",
      },
    };
  }

  if (msg.live_photo?.video || msg.live_photo?.photo?.length) {
    const still =
      msg.live_photo.photo?.[msg.live_photo.photo.length - 1] ??
      msg.photo?.[msg.photo.length - 1];
    const motion = msg.live_photo.video;
    const attachments = [];
    if (still) {
      attachments.push(
        attachmentWithDownload(
          {
            guid: still.file_id,
            mimeType: "image/jpeg",
            name: "live-photo.jpg",
            size: still.file_size,
          },
          fileDownload(client, still.file_id)
        )
      );
    }
    if (motion) {
      attachments.push(
        attachmentWithDownload(
          {
            guid: motion.file_id,
            mimeType: motion.mime_type ?? "video/mp4",
            name: motion.file_name ?? "live-photo.mp4",
            size: motion.file_size,
          },
          fileDownload(client, motion.file_id)
        )
      );
    }
    return {
      attachments,
      content: {
        caption: msg.caption,
        mimeType: "image/jpeg",
        name: "live-photo.jpg",
        type: "attachment",
      },
    };
  }

  const file =
    msg.sticker ??
    msg.animation ??
    msg.video_note ??
    msg.video ??
    msg.audio ??
    msg.document ??
    (msg.photo?.length ? msg.photo[msg.photo.length - 1] : undefined);

  if (file) {
    const guid = file.file_id;
    const mimeType =
      "mime_type" in file && typeof file.mime_type === "string"
        ? file.mime_type
        : msg.sticker
          ? "image/webp"
          : msg.photo
            ? "image/jpeg"
            : msg.video_note
              ? "video/mp4"
              : undefined;
    const name =
      "file_name" in file && typeof file.file_name === "string"
        ? file.file_name
        : msg.sticker
          ? "sticker.webp"
          : undefined;
    const attachments = [
      attachmentWithDownload(
        {
          guid,
          mimeType,
          name,
          size: file.file_size,
        },
        fileDownload(client, guid)
      ),
    ];
    return {
      attachments,
      content: {
        caption: msg.caption,
        isAnimation: Boolean(msg.animation),
        isSticker: Boolean(msg.sticker),
        isVideoNote: Boolean(msg.video_note),
        mimeType,
        name,
        type: "attachment",
      },
    };
  }

  if (msg.venue) {
    return {
      content: {
        address: msg.venue.address,
        latitude: msg.venue.location.latitude,
        longitude: msg.venue.location.longitude,
        title: msg.venue.title,
        type: "location",
      },
    };
  }

  if (msg.location) {
    return {
      content: {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        type: "location",
      },
    };
  }

  if (msg.text) {
    return { content: { text: msg.text, type: "text" } };
  }

  return { content: { text: "", type: "text" } };
}

export function messageFromTelegram(
  channel: Channel,
  client: TelegramClient,
  msg: TelegramMessage,
  botId: string
): Message | undefined {
  if (msg.from && String(msg.from.id) === botId) {
    return;
  }
  const mapped = mediaFromMessage(client, msg);
  if (
    mapped.content.type === "text" &&
    !mapped.content.text &&
    !mapped.attachments?.length
  ) {
    return;
  }
  const isGroup =
    msg.chat.type === "group" ||
    msg.chat.type === "supergroup" ||
    msg.chat.type === "channel";
  return bindMessage(channel, {
    ...(mapped.attachments ? { attachments: mapped.attachments } : {}),
    content: mapped.content,
    guid: String(msg.message_id),
    ...(msg.reply_to_message
      ? { replyTo: { messageGuid: String(msg.reply_to_message.message_id) } }
      : {}),
    ...(isGroup
      ? {
          group: {
            chatId: String(msg.chat.id),
            isGroup: true,
            kind: msg.chat.type,
            participant: {
              displayName: msg.from?.first_name ?? msg.from?.username,
              handle: msg.from?.username,
              id: msg.from ? String(msg.from.id) : String(msg.chat.id),
            },
          },
        }
      : {}),
    isFromMe: false,
    platform: "telegram",
    ...(msg.reply_to_message
      ? {
          replyTo: {
            messageGuid: String(msg.reply_to_message.message_id),
          },
        }
      : {}),
    sender: {
      displayName: msg.from?.first_name ?? msg.from?.username,
      handle: msg.from?.username,
      id: msg.from ? String(msg.from.id) : String(msg.chat.id),
    },
    ...(msg.message_thread_id != null
      ? { threadId: msg.message_thread_id }
      : {}),
    timestamp: new Date(msg.date * 1000),
  });
}

export function resultsFromUpdate(
  channel: Channel,
  client: TelegramClient,
  update: TelegramUpdate,
  botId: string
): InboundResult[] {
  const out: InboundResult[] = [];

  const msg =
    update.message ??
    update.channel_post ??
    update.edited_message ??
    update.edited_channel_post ??
    update.business_message ??
    update.edited_business_message ??
    update.guest_message;

  if (
    update.edited_message ||
    update.edited_channel_post ||
    update.edited_business_message
  ) {
    const edited =
      update.edited_message ??
      update.edited_channel_post ??
      update.edited_business_message!;
    out.push({
      kind: "edited",
      chatId: String(edited.chat.id),
      messageGuid: String(edited.message_id),
      senderId: edited.from ? String(edited.from.id) : String(edited.chat.id),
      text: edited.text ?? edited.caption ?? "",
      timestamp: new Date(edited.date * 1000),
    });
    return out;
  }

  if (msg) {
    const message = messageFromTelegram(channel, client, msg, botId);
    if (message) {
      out.push({
        kind: "message",
        chatId: String(msg.chat.id),
        message,
      });
    }
  }

  if (update.message_reaction) {
    const r = update.message_reaction;
    const chatId = String(r.chat.id);
    const added = r.new_reaction
      .filter((x) => x.type === "emoji" && x.emoji)
      .map((x) => x.emoji!);
    const previous = new Set(
      r.old_reaction
        .filter((x) => x.type === "emoji" && x.emoji)
        .map((x) => x.emoji!)
    );
    if (added.length === 0 && previous.size > 0) {
      const removedEmoji = [...previous][0]!;
      out.push({
        kind: "reaction",
        chatId,
        messageGuid: String(r.message_id),
        reaction: removedEmoji,
        removed: true,
        senderId: r.user ? String(r.user.id) : "anonymous",
        timestamp: new Date(r.date * 1000),
      });
    } else if (added.length > 0) {
      const emoji = added.find((e) => !previous.has(e)) ?? added[0]!;
      out.push({
        kind: "reaction",
        chatId,
        messageGuid: String(r.message_id),
        reaction: emoji,
        removed: false,
        senderId: r.user ? String(r.user.id) : "anonymous",
        timestamp: new Date(r.date * 1000),
      });
    }
  }

  if (update.callback_query) {
    const q = update.callback_query;
    out.push({
      kind: "callback",
      chatId: q.message
        ? String(q.message.chat.id)
        : String(q.from.id),
      data: q.data ?? "",
      messageGuid: q.message ? String(q.message.message_id) : undefined,
      queryId: q.id,
      senderId: String(q.from.id),
      timestamp: new Date(),
    });
  }

  if (update.inline_query) {
    const q = update.inline_query;
    out.push({
      kind: "inline",
      chatId: String(q.from.id),
      offset: q.offset,
      query: q.query,
      queryId: q.id,
      senderId: String(q.from.id),
      timestamp: new Date(),
    });
  }

  if (update.chosen_inline_result) {
    const r = update.chosen_inline_result as {
      from: { id: number };
      query: string;
      result_id: string;
      inline_message_id?: string;
    };
    out.push({
      kind: "inline",
      chatId: String(r.from.id),
      chosenResultId: r.result_id,
      query: r.query,
      queryId: r.inline_message_id ?? r.result_id,
      senderId: String(r.from.id),
      timestamp: new Date(),
    });
  }

  if (update.chat_join_request) {
    const r = update.chat_join_request;
    out.push({
      kind: "joinRequest",
      chatId: String(r.chat.id),
      senderId: String(r.from.id),
      timestamp: new Date(r.date * 1000),
      userChatId:
        r.user_chat_id != null ? String(r.user_chat_id) : undefined,
    });
  }

  if (update.shipping_query && typeof update.shipping_query === "object") {
    const q = update.shipping_query as {
      from: { id: number };
      id: string;
      invoice_payload: string;
      shipping_address: {
        city: string;
        country_code: string;
        post_code: string;
        state: string;
        street_line1: string;
        street_line2: string;
      };
    };
    out.push({
      kind: "shipping",
      chatId: String(q.from.id),
      invoicePayload: q.invoice_payload,
      queryId: q.id,
      senderId: String(q.from.id),
      shippingAddress: {
        city: q.shipping_address.city,
        countryCode: q.shipping_address.country_code,
        postCode: q.shipping_address.post_code,
        state: q.shipping_address.state,
        streetLine1: q.shipping_address.street_line1,
        streetLine2: q.shipping_address.street_line2,
      },
      timestamp: new Date(),
    });
  }

  if (
    update.pre_checkout_query &&
    typeof update.pre_checkout_query === "object"
  ) {
    const q = update.pre_checkout_query as {
      currency: string;
      from: { id: number };
      id: string;
      invoice_payload: string;
      total_amount: number;
    };
    out.push({
      kind: "preCheckout",
      chatId: String(q.from.id),
      currency: q.currency,
      invoicePayload: q.invoice_payload,
      queryId: q.id,
      senderId: String(q.from.id),
      timestamp: new Date(),
      totalAmount: q.total_amount,
    });
  }

  const memberUpdate = update.chat_member ?? update.my_chat_member;
  if (memberUpdate) {
    const oldStatus = memberUpdate.old_chat_member.status;
    const newStatus = memberUpdate.new_chat_member.status;
    const userId = String(memberUpdate.new_chat_member.user.id);
    const left =
      (oldStatus === "member" || oldStatus === "administrator") &&
      (newStatus === "left" || newStatus === "kicked");
    const joined =
      (oldStatus === "left" ||
        oldStatus === "kicked" ||
        oldStatus === "restricted") &&
      (newStatus === "member" || newStatus === "administrator");
    out.push({
      kind: "group",
      chatId: String(memberUpdate.chat.id),
      participantAdded: joined ? userId : undefined,
      participantRemoved: left ? userId : undefined,
      timestamp: new Date(memberUpdate.date * 1000),
    });
  }

  if (update.poll_answer) {
    const pollId = update.poll_answer.poll_id;
    const pollMessageGuid = resolvePollMessageGuid(channel.to, pollId);
    const cached = getCachedPoll(channel.to, pollMessageGuid);
    if (cached) {
      rememberPoll(
        {
          ...cached,
          votes: update.poll_answer.option_ids.map((id) => ({
            optionId: String(id),
            participant: String(update.poll_answer!.user.id),
          })),
        },
        pollId
      );
    }
    out.push({
      kind: "poll",
      action: "answer",
      chatId: channel.to,
      optionIds: update.poll_answer.option_ids,
      pollId,
      pollMessageGuid,
      timestamp: new Date(),
      userId: String(update.poll_answer.user.id),
    });
  }

  if (update.poll) {
    const pollId = update.poll.id;
    const pollMessageGuid = resolvePollMessageGuid(channel.to, pollId);
    rememberPollFromTelegram(channel.to, pollMessageGuid, {
      id: pollId,
      options: update.poll.options,
      question: update.poll.question,
    });
    out.push({
      kind: "poll",
      action: update.poll.is_closed ? "closed" : "update",
      chatId: channel.to,
      isClosed: update.poll.is_closed,
      options: update.poll.options.map((o) => ({
        text: o.text,
        voterCount: o.voter_count,
      })),
      pollId,
      pollMessageGuid,
      question: update.poll.question,
      timestamp: new Date(),
    });
  }

  if (update.business_connection !== undefined) {
    const conn = update.business_connection as {
      id?: string;
      user?: { id: number };
    };
    out.push({
      kind: "business",
      businessKind: "connection",
      chatId: chatIdFromUpdate(update) ?? channel.to,
      connectionId: conn.id,
      timestamp: new Date(),
      userId: conn.user ? String(conn.user.id) : undefined,
    });
  }

  if (update.deleted_business_messages !== undefined) {
    const deleted = update.deleted_business_messages as {
      message_ids?: number[];
    };
    out.push({
      kind: "business",
      businessKind: "deleted_messages",
      chatId: chatIdFromUpdate(update) ?? channel.to,
      messageIds: (deleted.message_ids ?? []).map(String),
      timestamp: new Date(),
    });
  }

  if (update.chat_boost !== undefined) {
    const boost = update.chat_boost as {
      boost?: { boost_id?: string; source?: { user?: { id: number } } };
    };
    out.push({
      kind: "boost",
      boostId: boost.boost?.boost_id,
      chatId: chatIdFromUpdate(update) ?? channel.to,
      removed: false,
      timestamp: new Date(),
      userId: boost.boost?.source?.user
        ? String(boost.boost.source.user.id)
        : undefined,
    });
  }

  if (update.removed_chat_boost !== undefined) {
    const removed = update.removed_chat_boost as {
      boost_id?: string;
      source?: { user?: { id: number } };
    };
    out.push({
      kind: "boost",
      boostId: removed.boost_id,
      chatId: chatIdFromUpdate(update) ?? channel.to,
      removed: true,
      timestamp: new Date(),
      userId: removed.source?.user
        ? String(removed.source.user.id)
        : undefined,
    });
  }

  if (update.purchased_paid_media !== undefined) {
    const purchase = update.purchased_paid_media as {
      from?: { id: number };
      paid_media?: { star_count?: number };
      payload?: string;
    };
    out.push({
      kind: "purchase",
      chatId: chatIdFromUpdate(update) ?? channel.to,
      currency: "XTR",
      payload: purchase.payload,
      senderId: purchase.from ? String(purchase.from.id) : undefined,
      starCount: purchase.paid_media?.star_count,
      timestamp: new Date(),
    });
  }

  if (update.message_reaction_count !== undefined) {
    const count = update.message_reaction_count as {
      chat?: { id: number };
      message_id?: number;
      reactions?: {
        type: { emoji?: string; type: string };
        total_count: number;
      }[];
    };
    out.push({
      kind: "reactionCount",
      chatId:
        count.chat != null
          ? String(count.chat.id)
          : (chatIdFromUpdate(update) ?? channel.to),
      messageGuid:
        count.message_id != null ? String(count.message_id) : undefined,
      reactions: (count.reactions ?? []).map((r) => ({
        emoji: r.type.emoji,
        totalCount: r.total_count,
        type: r.type.type,
      })),
      timestamp: new Date(),
    });
  }

  if (update.managed_bot !== undefined) {
    const managed = update.managed_bot as { user?: { id: number } };
    out.push({
      kind: "managed",
      chatId: chatIdFromUpdate(update) ?? channel.to,
      timestamp: new Date(),
      userId: managed.user ? String(managed.user.id) : undefined,
    });
  }

  if (update.subscription !== undefined) {
    const sub = update.subscription as {
      until_date?: number;
      user?: { id: number };
    };
    out.push({
      kind: "subscription",
      chatId: chatIdFromUpdate(update) ?? channel.to,
      timestamp: new Date(),
      untilDate: sub.until_date,
      userId: sub.user ? String(sub.user.id) : undefined,
    });
  }

  return out;
}

export function dispatchTelegramUpdate(
  host: SkylineHost,
  makeChannel: (to: string) => Channel,
  client: TelegramClient,
  botId: string,
  fallbackKey: string,
  update: TelegramUpdate
): void {
  const chatId = chatIdFromUpdate(update);
  if (!chatId && !update.poll && !update.poll_answer) {
    return;
  }
  const channel = makeChannel(chatId ?? fallbackKey);
  if (chatId && !host.live.has(chatId)) {
    host.live.set(chatId, {
      platform: "telegram",
      streams: [],
      telegram: client,
    });
    host.ready.add(chatId);
  }
  const results = resultsFromUpdate(channel, client, update, botId);
  for (const result of results) {
    const resultChannel =
      result.chatId === channel.to ? channel : makeChannel(result.chatId);
    if (result.chatId !== "0" && !host.live.has(result.chatId)) {
      host.live.set(result.chatId, {
        platform: "telegram",
        streams: [],
        telegram: client,
      });
      host.ready.add(result.chatId);
    }
    switch (result.kind) {
      case "message":
        host.queue.push([resultChannel, result.message]);
        break;
      case "reaction":
        host.emit(
          "reaction",
          {
            messageGuid: result.messageGuid,
            platform: "telegram",
            reaction: result.reaction,
            removed: result.removed,
            sender: { id: result.senderId },
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "edited":
        host.emit(
          "edited",
          {
            messageGuid: result.messageGuid,
            platform: "telegram",
            sender: { id: result.senderId },
            text: result.text,
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "callback":
        host.emit(
          "callback",
          {
            data: result.data,
            messageGuid: result.messageGuid,
            platform: "telegram",
            queryId: result.queryId,
            sender: { id: result.senderId },
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "inline":
        host.emit(
          "inline",
          {
            chosenResultId: result.chosenResultId,
            offset: result.offset,
            platform: "telegram",
            query: result.query,
            queryId: result.queryId,
            sender: { id: result.senderId },
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "joinRequest":
        host.emit(
          "joinRequest",
          {
            chatId: result.chatId,
            platform: "telegram",
            sender: { id: result.senderId },
            timestamp: result.timestamp,
            userChatId: result.userChatId,
          },
          resultChannel
        );
        break;
      case "shipping":
        host.emit(
          "shipping",
          {
            from: { id: result.senderId },
            invoicePayload: result.invoicePayload,
            platform: "telegram",
            queryId: result.queryId,
            shippingAddress: result.shippingAddress,
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "preCheckout":
        host.emit(
          "preCheckout",
          {
            currency: result.currency,
            from: { id: result.senderId },
            invoicePayload: result.invoicePayload,
            platform: "telegram",
            queryId: result.queryId,
            timestamp: result.timestamp,
            totalAmount: result.totalAmount,
          },
          resultChannel
        );
        break;
      case "group":
        host.emit(
          "group",
          {
            chatId: result.chatId,
            participantAdded: result.participantAdded,
            participantRemoved: result.participantRemoved,
            platform: "telegram",
            renamedTo: result.renamedTo,
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "poll":
        host.emit(
          "poll",
          {
            action: result.action,
            chatId: result.chatId,
            isClosed: result.isClosed,
            optionIds: result.optionIds,
            options: result.options,
            platform: "telegram",
            pollId: result.pollId,
            pollMessageGuid: result.pollMessageGuid,
            question: result.question,
            timestamp: result.timestamp,
            userId: result.userId,
          },
          resultChannel
        );
        break;
      case "boost":
        host.emit(
          "boost",
          {
            boostId: result.boostId,
            chatId: result.chatId,
            platform: "telegram",
            removed: result.removed,
            timestamp: result.timestamp,
            userId: result.userId,
          },
          resultChannel
        );
        break;
      case "business":
        host.emit(
          "business",
          {
            connectionId: result.connectionId,
            kind: result.businessKind,
            messageIds: result.messageIds,
            platform: "telegram",
            timestamp: result.timestamp,
            userId: result.userId,
          },
          resultChannel
        );
        break;
      case "purchase":
        host.emit(
          "purchase",
          {
            currency: result.currency,
            payload: result.payload,
            platform: "telegram",
            sender: result.senderId ? { id: result.senderId } : undefined,
            starCount: result.starCount,
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "reactionCount":
        host.emit(
          "reactionCount",
          {
            chatId: result.chatId,
            messageGuid: result.messageGuid,
            platform: "telegram",
            reactions: result.reactions,
            timestamp: result.timestamp,
          },
          resultChannel
        );
        break;
      case "managed":
        host.emit(
          "managed",
          {
            platform: "telegram",
            timestamp: result.timestamp,
            userId: result.userId,
          },
          resultChannel
        );
        break;
      case "subscription":
        host.emit(
          "subscription",
          {
            platform: "telegram",
            timestamp: result.timestamp,
            untilDate: result.untilDate,
            userId: result.userId,
          },
          resultChannel
        );
        break;
      case "platform":
        host.emit(
          "platform",
          {
            kind: result.signalKind,
            payload: result.payload,
            platform: "telegram",
            timestamp: result.timestamp,
            updateId: result.updateId,
          },
          resultChannel
        );
        break;
      default: {
        const _exhaustive: never = result;
        void _exhaustive;
      }
    }
  }
}
