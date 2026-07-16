import type { Content, ReplyMarkup } from "@skyline-ts/core/content";
import type {
  Channel,
  ChatRef,
  JsonValue,
  Message,
  MessageCustomEmoji,
  MessageDateTime,
  MessageExternalReply,
  MessageForward,
  MessageEntity,
  MessageLinkPreview,
  GiftEventInfo,
  MessageQuote,
  MessageSystemEvent,
  OrderInfo,
  PollInfo,
  PollMediaInfo,
  User,
} from "@skyline-ts/core";
import {
  attachmentWithDownload,
  bindMessage,
  type SkylineHost,
} from "@skyline-ts/core/host";
import type {
  TelegramChat,
  TelegramClient,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramOrderInfo,
  TelegramPoll,
  TelegramPollMedia,
  TelegramUpdate,
  TelegramUser,
} from "./client.js";

function orderInfoFromTelegram(info?: TelegramOrderInfo): OrderInfo | undefined {
  if (!info) {
    return;
  }
  const address = info.shipping_address;
  return {
    ...(info.email ? { email: info.email } : {}),
    ...(info.name ? { name: info.name } : {}),
    ...(info.phone_number ? { phoneNumber: info.phone_number } : {}),
    ...(address
      ? {
          shippingAddress: {
            city: address.city,
            countryCode: address.country_code,
            postCode: address.post_code,
            state: address.state,
            streetLine1: address.street_line1,
            streetLine2: address.street_line2,
          },
        }
      : {}),
  };
}

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

function pollMediaFromTelegram(
  raw?: TelegramPollMedia
): PollMediaInfo | undefined {
  if (!raw) {
    return;
  }
  const file = (m?: { file_id?: string; file_unique_id?: string }) => ({
    fileId: m?.file_id,
    fileUniqueId: m?.file_unique_id,
  });
  if (raw.photo?.length) {
    const largest = raw.photo.at(-1);
    return { ...file(largest), kind: "photo" };
  }
  if (raw.video) {
    return { ...file(raw.video), kind: "video" };
  }
  if (raw.animation) {
    return { ...file(raw.animation), kind: "animation" };
  }
  if (raw.audio) {
    return { ...file(raw.audio), kind: "audio" };
  }
  if (raw.document) {
    return { ...file(raw.document), kind: "document" };
  }
  if (raw.sticker) {
    return { ...file(raw.sticker), kind: "sticker" };
  }
  if (raw.live_photo) {
    return { ...file(raw.live_photo), kind: "live_photo" };
  }
  if (raw.location) {
    return {
      kind: "location",
      location: {
        latitude: raw.location.latitude,
        longitude: raw.location.longitude,
      },
    };
  }
  if (raw.venue) {
    return {
      kind: "venue",
      location: raw.venue.location
        ? {
            latitude: raw.venue.location.latitude,
            longitude: raw.venue.location.longitude,
          }
        : undefined,
      title: raw.venue.title,
    };
  }
  if (raw.link) {
    return { kind: "link", link: raw.link.url, title: raw.link.title };
  }
  return;
}

export function entitiesFromTelegram(
  raw?: TelegramMessageEntity[]
): MessageEntity[] | undefined {
  if (!raw?.length) {
    return;
  }
  return raw.map((e) => ({
    customEmojiId: e.custom_emoji_id,
    language: e.language,
    length: e.length,
    offset: e.offset,
    type: e.type as MessageEntity["type"],
    url: e.url,
    user: e.user ? skylineUser(e.user) : undefined,
  }));
}

export function rememberPollFromTelegram(
  chatId: string,
  messageGuid: string,
  poll: TelegramPoll
): void {
  const telegram: PollInfo["telegram"] = {
    countryCodes: poll.country_codes,
    descriptionEntities: entitiesFromTelegram(poll.description_entities),
    explanationEntities: entitiesFromTelegram(poll.explanation_entities),
    explanationMedia: pollMediaFromTelegram(poll.explanation_media),
    media: pollMediaFromTelegram(poll.media),
    membersOnly: poll.members_only,
    questionEntities: entitiesFromTelegram(poll.question_entities),
  };
  rememberPoll(
    {
      allowsMultipleAnswers: poll.allows_multiple_answers,
      allowsRevoting: poll.allows_revoting,
      chatId,
      closeDate: poll.close_date,
      correctOptionIds: poll.correct_option_ids,
      description: poll.description,
      explanation: poll.explanation,
      id: poll.id,
      isAnonymous: poll.is_anonymous,
      isClosed: poll.is_closed,
      openPeriod: poll.open_period,
      options: poll.options.map((o, index) => ({
        id: o.persistent_id ?? String(index),
        media: pollMediaFromTelegram(o.media),
        text: o.text,
        voterCount: o.voter_count,
      })),
      pollMessageGuid: messageGuid,
      telegram,
      title: poll.question,
      totalVoterCount: poll.total_voter_count,
      type: poll.type === "quiz" ? "quiz" : "regular",
      votes: poll.options.flatMap((o, index) =>
        Array.from({ length: o.voter_count ?? 0 }, () => ({
          optionId: o.persistent_id ?? String(index),
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
      orderInfo?: OrderInfo;
      queryId: string;
      senderId: string;
      shippingOptionId?: string;
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
  const elevated = extraContentFromMessage(msg);
  if (elevated) {
    return { content: elevated };
  }

  if (msg.poll) {
    rememberPollFromTelegram(
      String(msg.chat.id),
      String(msg.message_id),
      msg.poll
    );
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
        type: "live_photo",
        ...(msg.caption ? { caption: msg.caption } : {}),
        ...(msg.has_media_spoiler ? { hasSpoiler: true } : {}),
        ...(msg.show_caption_above_media
          ? { showCaptionAboveMedia: true }
          : {}),
        photo: {
          mimeType: "image/jpeg",
          name: "live-photo.jpg",
          ...(still?.file_id ? { url: `tg-file:${still.file_id}` } : {}),
        },
        video: {
          mimeType: motion?.mime_type ?? "video/mp4",
          name: motion?.file_name ?? "live-photo.mp4",
          ...(motion?.file_id ? { url: `tg-file:${motion.file_id}` } : {}),
        },
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
    const media = msg.video ?? msg.animation ?? msg.audio ?? msg.video_note;
    const thumbFileId =
      media && "thumbnail" in media ? media.thumbnail?.file_id : undefined;
    const duration =
      msg.video?.duration ??
      msg.animation?.duration ??
      msg.audio?.duration ??
      msg.video_note?.duration;
    const width = msg.video?.width ?? msg.animation?.width;
    const height = msg.video?.height ?? msg.animation?.height;
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
        ...(duration != null ? { duration } : {}),
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        ...(msg.video_note?.length != null
          ? { length: msg.video_note.length }
          : {}),
        ...(msg.audio?.performer ? { performer: msg.audio.performer } : {}),
        ...(msg.audio?.title ? { title: msg.audio.title } : {}),
        ...(msg.has_media_spoiler ? { hasSpoiler: true } : {}),
        ...(msg.show_caption_above_media
          ? { showCaptionAboveMedia: true }
          : {}),
        ...(thumbFileId
          ? { thumbnail: { url: `tg-file:${thumbFileId}` } }
          : {}),
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
        ...(msg.location.heading != null
          ? { heading: msg.location.heading }
          : {}),
        ...(msg.location.horizontal_accuracy != null
          ? { horizontalAccuracy: msg.location.horizontal_accuracy }
          : {}),
        ...(msg.location.live_period != null
          ? { livePeriod: msg.location.live_period }
          : {}),
        ...(msg.location.proximity_alert_radius != null
          ? { proximityAlertRadius: msg.location.proximity_alert_radius }
          : {}),
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
  botId: string,
  includeRaw = false
): Message | undefined {
  if (msg.from && String(msg.from.id) === botId) {
    return;
  }
  const systemEvent = systemEventFromMessage(msg);
  const mapped = mediaFromMessage(client, msg);
  if (
    mapped.content.type === "text" &&
    !mapped.content.text &&
    !mapped.attachments?.length &&
    !systemEvent
  ) {
    return;
  }
  const isGroup =
    msg.chat.type === "group" ||
    msg.chat.type === "supergroup" ||
    msg.chat.type === "channel";
  const forward = forwardFromMessage(msg);
  const quote = quoteFromMessage(msg);
  const linkPreview = linkPreviewFromMessage(msg);
  const externalReply = externalReplyFromMessage(msg);
  const markup = markupFromMessage(msg);
  const raw = includeRaw ? asJsonValue(msg) : undefined;
  const facetSource = msg.text ?? msg.caption ?? "";
  const facetEntities = msg.text ? msg.entities : msg.caption_entities;
  const facets = facetsFromText(facetSource, facetEntities);
  const sender =
    skylineUser(msg.from) ??
    ({
      id: String(msg.chat.id),
      displayName: msg.chat.title ?? msg.chat.username,
      ...(msg.chat.username ? { handle: msg.chat.username } : {}),
    } as const);
  const viaUser = skylineUser(msg.via_bot);

  return bindMessage(channel, {
    ...(mapped.attachments ? { attachments: mapped.attachments } : {}),
    ...(msg.author_signature
      ? { authorSignature: msg.author_signature }
      : {}),
    ...(msg.business_connection_id
      ? { businessConnectionId: msg.business_connection_id }
      : {}),
    ...(facets.cashtags ? { cashtags: facets.cashtags } : {}),
    ...(facets.commands ? { commands: facets.commands } : {}),
    content: mapped.content,
    ...(facets.customEmojis ? { customEmojis: facets.customEmojis } : {}),
    ...(facets.dateTimes ? { dateTimes: facets.dateTimes } : {}),
    ...(msg.direct_messages_topic?.topic_id != null
      ? {
          directMessagesTopic: {
            topicId: msg.direct_messages_topic.topic_id,
            ...(msg.direct_messages_topic.name
              ? { name: msg.direct_messages_topic.name }
              : {}),
          },
        }
      : {}),
    ...(msg.edit_date != null
      ? { editTimestamp: new Date(msg.edit_date * 1000) }
      : {}),
    ...(msg.effect_id ? { effectId: msg.effect_id } : {}),
    ...(msg.ephemeral_message_id != null
      ? { ephemeralMessageId: String(msg.ephemeral_message_id) }
      : {}),
    ...(externalReply ? { externalReply } : {}),
    ...(forward ? { forward } : {}),
    ...(skylineUser(msg.guest_bot_caller_user) ||
    chatRef(msg.guest_bot_caller_chat)
      ? {
          guestBotCaller: {
            ...(skylineUser(msg.guest_bot_caller_user)
              ? { user: skylineUser(msg.guest_bot_caller_user) }
              : {}),
            ...(chatRef(msg.guest_bot_caller_chat)
              ? { chat: chatRef(msg.guest_bot_caller_chat) }
              : {}),
          },
        }
      : {}),
    ...(msg.guest_query_id ? { guestQueryId: msg.guest_query_id } : {}),
    guid: String(msg.message_id),
    ...(msg.has_media_spoiler ? { hasMediaSpoiler: true } : {}),
    ...(msg.has_protected_content ? { hasProtectedContent: true } : {}),
    ...(facets.hashtags ? { hashtags: facets.hashtags } : {}),
    ...(msg.is_automatic_forward ? { isAutomaticForward: true } : {}),
    ...(msg.is_from_offline ? { isFromOffline: true } : {}),
    ...(msg.is_paid_post ? { isPaidPost: true } : {}),
    ...(msg.is_topic_message ? { isTopicMessage: true } : {}),
    ...(linkPreview ? { linkPreview } : {}),
    ...(facets.links ? { links: facets.links } : {}),
    ...(facets.markdown ? { markdown: facets.markdown } : {}),
    ...(markup ? { markup } : {}),
    ...(msg.media_group_id ? { mediaGroupId: msg.media_group_id } : {}),
    ...(facets.mentions ? { mentions: facets.mentions } : {}),
    ...(msg.paid_star_count != null
      ? { paidStarCount: msg.paid_star_count }
      : {}),
    ...(facets.phones ? { phones: facets.phones } : {}),
    ...(quote ? { quote } : {}),
    ...(raw ? { raw } : {}),
    ...(skylineUser(msg.receiver_user)
      ? { receiver: skylineUser(msg.receiver_user) }
      : {}),
    ...(isGroup
      ? {
          group: {
            chatId: String(msg.chat.id),
            isGroup: true,
            kind: msg.chat.type,
            participant: sender,
          },
        }
      : {}),
    isFromMe: false,
    platform: "telegram",
    ...(msg.reply_to_message ||
    msg.reply_to_story ||
    msg.reply_to_checklist_task_id != null ||
    msg.reply_to_poll_option_id
      ? {
          replyTo: {
            messageGuid: msg.reply_to_message
              ? String(msg.reply_to_message.message_id)
              : msg.reply_to_story?.id != null
                ? String(msg.reply_to_story.id)
                : "0",
            ...(msg.reply_to_message?.from
              ? {
                  senderHandle: msg.reply_to_message.from.username,
                  senderId: String(msg.reply_to_message.from.id),
                }
              : {}),
            ...(msg.reply_to_message?.text || msg.reply_to_message?.caption
              ? {
                  text:
                    msg.reply_to_message.text ?? msg.reply_to_message.caption,
                }
              : {}),
            ...(msg.reply_to_story?.id != null
              ? { storyId: String(msg.reply_to_story.id) }
              : {}),
            ...(msg.reply_to_checklist_task_id != null
              ? { checklistTaskId: msg.reply_to_checklist_task_id }
              : {}),
            ...(msg.reply_to_poll_option_id
              ? { pollOptionId: msg.reply_to_poll_option_id }
              : {}),
          },
        }
      : {}),
    sender,
    ...(msg.sender_boost_count != null
      ? { senderBoostCount: msg.sender_boost_count }
      : {}),
    ...(skylineUser(msg.sender_business_bot)
      ? { senderBusinessBot: skylineUser(msg.sender_business_bot) }
      : {}),
    ...(chatRef(msg.sender_chat) ? { senderChat: chatRef(msg.sender_chat) } : {}),
    ...(msg.sender_tag ? { senderTag: msg.sender_tag } : {}),
    ...(msg.show_caption_above_media ? { showCaptionAboveMedia: true } : {}),
    ...(msg.suggested_post_info
      ? {
          suggestedPostInfo: {
            ...(msg.suggested_post_info.state
              ? { state: msg.suggested_post_info.state }
              : {}),
            ...(msg.suggested_post_info.price
              ? {
                  price: {
                    ...(msg.suggested_post_info.price.currency
                      ? { currency: msg.suggested_post_info.price.currency }
                      : {}),
                    ...(msg.suggested_post_info.price.amount != null
                      ? { amount: msg.suggested_post_info.price.amount }
                      : {}),
                  },
                }
              : {}),
            ...(msg.suggested_post_info.send_date != null
              ? { sendDate: msg.suggested_post_info.send_date }
              : {}),
          },
        }
      : {}),
    ...(systemEvent ? { systemEvent } : {}),
    ...(msg.message_thread_id != null
      ? { threadId: msg.message_thread_id }
      : {}),
    timestamp: new Date(msg.date * 1000),
    ...(viaUser?.handle ? { viaHandle: viaUser.handle } : {}),
    ...(viaUser ? { viaUser } : {}),
  });
}

export function resultsFromUpdate(
  channel: Channel,
  client: TelegramClient,
  update: TelegramUpdate,
  botId: string,
  includeRaw = false
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
    const message = messageFromTelegram(
      channel,
      client,
      msg,
      botId,
      includeRaw
    );
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
      order_info?: TelegramOrderInfo;
      shipping_option_id?: string;
      total_amount: number;
    };
    const orderInfo = orderInfoFromTelegram(q.order_info);
    out.push({
      kind: "preCheckout",
      chatId: String(q.from.id),
      currency: q.currency,
      invoicePayload: q.invoice_payload,
      queryId: q.id,
      senderId: String(q.from.id),
      timestamp: new Date(),
      totalAmount: q.total_amount,
      ...(orderInfo ? { orderInfo } : {}),
      ...(q.shipping_option_id
        ? { shippingOptionId: q.shipping_option_id }
        : {}),
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
    rememberPollFromTelegram(channel.to, pollMessageGuid, update.poll);
    out.push({
      kind: "poll",
      action: update.poll.is_closed ? "closed" : "update",
      chatId: channel.to,
      isClosed: update.poll.is_closed,
      options: update.poll.options.map((o) => ({
        text: o.text,
        voterCount: o.voter_count ?? 0,
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
  update: TelegramUpdate,
  includeRaw = false
): void {
  const chatId = chatIdFromUpdate(update);
  const channel = makeChannel(chatId ?? fallbackKey);
  if (chatId && !host.live.has(chatId)) {
    host.live.set(chatId, {
      includeRaw,
      platform: "telegram",
      streams: [],
      telegram: client,
    });
    host.ready.add(chatId);
  }
  const results = resultsFromUpdate(
    channel,
    client,
    update,
    botId,
    includeRaw
  );
  if (results.length === 0) {
    return;
  }
  for (const result of results) {
    const resultChannel =
      result.chatId === channel.to ? channel : makeChannel(result.chatId);
    if (result.chatId !== "0" && !host.live.has(result.chatId)) {
      host.live.set(result.chatId, {
        includeRaw,
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
            ...(result.orderInfo ? { orderInfo: result.orderInfo } : {}),
            ...(result.shippingOptionId
              ? { shippingOptionId: result.shippingOptionId }
              : {}),
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

function asJsonValue(value: unknown): JsonValue | undefined {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return;
  }
}

function chatRef(chat?: TelegramChat): ChatRef | undefined {
  if (!chat) {
    return;
  }
  return {
    id: String(chat.id),
    ...(chat.username ? { handle: chat.username } : {}),
    ...(chat.title ? { title: chat.title } : {}),
    ...(chat.type ? { kind: chat.type as ChatRef["kind"] } : {}),
  };
}

function skylineUser(user?: TelegramUser): User | undefined {
  if (!user) {
    return;
  }
  return {
    id: String(user.id),
    displayName: user.first_name ?? user.username,
    ...(user.username ? { handle: user.username } : {}),
    ...(user.language_code ? { languageCode: user.language_code } : {}),
  };
}

function entitySlice(text: string, entity: TelegramMessageEntity): string {
  return text.substring(entity.offset, entity.offset + entity.length);
}

const FORMAT_ENTITY_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
  "code",
  "pre",
  "blockquote",
  "expandable_blockquote",
  "text_link",
]);

type InboundTextFacets = {
  cashtags?: string[];
  commands?: { args?: string; command: string }[];
  customEmojis?: MessageCustomEmoji[];
  dateTimes?: MessageDateTime[];
  hashtags?: string[];
  links?: { text: string; url: string }[];
  markdown?: string;
  mentions?: User[];
  phones?: string[];
};

function facetsFromText(
  text: string,
  entities?: TelegramMessageEntity[]
): InboundTextFacets {
  if (!text || !entities?.length) {
    return {};
  }

  const mentions: User[] = [];
  const links: { text: string; url: string }[] = [];
  const hashtags: string[] = [];
  const cashtags: string[] = [];
  const commands: { args?: string; command: string }[] = [];
  const phones: string[] = [];
  const customEmojis: MessageCustomEmoji[] = [];
  const dateTimes: MessageDateTime[] = [];

  for (const entity of entities) {
    const slice = entitySlice(text, entity);
    switch (entity.type) {
      case "mention": {
        const handle = slice.replace(/^@/, "");
        if (handle) {
          mentions.push({ handle, id: handle });
        }
        break;
      }
      case "text_mention": {
        const user = skylineUser(entity.user);
        if (user) {
          mentions.push(user);
        }
        break;
      }
      case "url":
      case "email":
        links.push({ text: slice, url: slice });
        break;
      case "text_link":
        if (entity.url) {
          links.push({ text: slice, url: entity.url });
        }
        break;
      case "hashtag":
        hashtags.push(slice.replace(/^#/, ""));
        break;
      case "cashtag":
        cashtags.push(slice.replace(/^\$/, ""));
        break;
      case "phone_number":
        phones.push(slice);
        break;
      case "custom_emoji":
        if (entity.custom_emoji_id) {
          customEmojis.push({ id: entity.custom_emoji_id, text: slice });
        }
        break;
      case "date_time":
        if (entity.unix_time != null) {
          dateTimes.push({
            text: slice,
            unixTime: entity.unix_time,
            ...(entity.date_time_format
              ? { format: entity.date_time_format }
              : {}),
          });
        }
        break;
      case "bot_command": {
        const [head, ...rest] = slice.slice(1).split(/\s+/);
        const command = (head ?? "").split("@")[0] ?? "";
        if (command) {
          commands.push({
            command,
            ...(rest.length ? { args: rest.join(" ") } : {}),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  let markdown: string | undefined;
  if (entities.some((entity) => FORMAT_ENTITY_TYPES.has(entity.type))) {
    const sorted = [...entities]
      .filter((entity) => FORMAT_ENTITY_TYPES.has(entity.type))
      .sort((a, b) => b.offset - a.offset || a.length - b.length);
    let out = text;
    for (const entity of sorted) {
      const slice = out.substring(entity.offset, entity.offset + entity.length);
      let wrapped = slice;
      switch (entity.type) {
        case "bold":
          wrapped = `**${slice}**`;
          break;
        case "italic":
          wrapped = `*${slice}*`;
          break;
        case "strikethrough":
          wrapped = `~~${slice}~~`;
          break;
        case "code":
          wrapped = `\`${slice}\``;
          break;
        case "pre":
          wrapped = entity.language
            ? `\`\`\`${entity.language}\n${slice}\n\`\`\``
            : `\`\`\`\n${slice}\n\`\`\``;
          break;
        case "text_link":
          wrapped = entity.url ? `[${slice}](${entity.url})` : slice;
          break;
        case "spoiler":
          wrapped = `||${slice}||`;
          break;
        case "underline":
          wrapped = `__${slice}__`;
          break;
        case "blockquote":
        case "expandable_blockquote":
          wrapped = slice
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          break;
        default:
          break;
      }
      out =
        out.substring(0, entity.offset) +
        wrapped +
        out.substring(entity.offset + entity.length);
    }
    if (out !== text) {
      markdown = out;
    }
  }

  return {
    ...(cashtags.length ? { cashtags } : {}),
    ...(commands.length ? { commands } : {}),
    ...(customEmojis.length ? { customEmojis } : {}),
    ...(dateTimes.length ? { dateTimes } : {}),
    ...(hashtags.length ? { hashtags } : {}),
    ...(links.length ? { links } : {}),
    ...(markdown ? { markdown } : {}),
    ...(mentions.length ? { mentions } : {}),
    ...(phones.length ? { phones } : {}),
  };
}

function forwardFromMessage(msg: TelegramMessage): MessageForward | undefined {
  const origin = msg.forward_origin;
  if (origin) {
    return {
      ...(origin.date != null ? { date: new Date(origin.date * 1000) } : {}),
      ...(origin.chat ? { fromChatId: String(origin.chat.id) } : {}),
      ...(origin.message_id != null
        ? { fromMessageGuid: String(origin.message_id) }
        : {}),
      originType: origin.type,
      ...(origin.sender_user
        ? {
            senderDisplayName:
              origin.sender_user.first_name ?? origin.sender_user.username,
            senderHandle: origin.sender_user.username,
            senderId: String(origin.sender_user.id),
          }
        : {}),
      ...(origin.sender_user_name && !origin.sender_user
        ? { senderDisplayName: origin.sender_user_name }
        : {}),
    };
  }
  if (msg.forward_from || msg.forward_from_chat || msg.forward_date != null) {
    return {
      ...(msg.forward_date != null
        ? { date: new Date(msg.forward_date * 1000) }
        : {}),
      ...(msg.forward_from_chat
        ? { fromChatId: String(msg.forward_from_chat.id) }
        : {}),
      ...(msg.forward_from_message_id != null
        ? { fromMessageGuid: String(msg.forward_from_message_id) }
        : {}),
      ...(msg.forward_from
        ? {
            senderDisplayName:
              msg.forward_from.first_name ?? msg.forward_from.username,
            senderHandle: msg.forward_from.username,
            senderId: String(msg.forward_from.id),
          }
        : {}),
    };
  }
  return;
}

function quoteFromMessage(msg: TelegramMessage): MessageQuote | undefined {
  const quote = msg.quote;
  if (!quote?.text) {
    return;
  }
  const facets = facetsFromText(quote.text, quote.entities);
  return {
    text: quote.text,
    ...(quote.position != null ? { position: quote.position } : {}),
    ...(quote.is_manual ? { isManual: true } : {}),
    ...(facets.markdown ? { markdown: facets.markdown } : {}),
  };
}

function linkPreviewFromMessage(
  msg: TelegramMessage
): MessageLinkPreview | undefined {
  const opts = msg.link_preview_options;
  if (!opts) {
    return;
  }
  return {
    ...(opts.is_disabled ? { disabled: true } : {}),
    ...(opts.url ? { url: opts.url } : {}),
    ...(opts.prefer_large_media ? { preferLargeMedia: true } : {}),
    ...(opts.prefer_small_media ? { preferSmallMedia: true } : {}),
    ...(opts.show_above_text ? { showAboveText: true } : {}),
  };
}

function externalReplyFromMessage(
  msg: TelegramMessage
): MessageExternalReply | undefined {
  const external = msg.external_reply;
  if (!external) {
    return;
  }
  return {
    ...(external.chat ? { chat: chatRef(external.chat) } : {}),
    ...(external.message_id != null
      ? { messageGuid: String(external.message_id) }
      : {}),
    ...(external.origin?.type ? { originType: external.origin.type } : {}),
    ...(external.has_media_spoiler ? { hasMediaSpoiler: true } : {}),
  };
}

function markupFromMessage(msg: TelegramMessage): ReplyMarkup | undefined {
  const rows = msg.reply_markup?.inline_keyboard;
  if (!rows?.length) {
    return;
  }
  return {
    type: "inline",
    inlineKeyboard: rows.map((row) =>
      row.map((button) => ({
        text: button.text,
        ...(button.callback_data
          ? { callbackData: button.callback_data }
          : {}),
        ...(button.callback_game != null ? { callbackGame: true } : {}),
        ...(button.copy_text?.text ? { copyText: button.copy_text.text } : {}),
        ...(button.login_url
          ? {
              loginUrl: {
                url: button.login_url.url,
                ...(button.login_url.forward_text
                  ? { forwardText: button.login_url.forward_text }
                  : {}),
                ...(button.login_url.bot_username
                  ? { botUsername: button.login_url.bot_username }
                  : {}),
                ...(button.login_url.request_write_access
                  ? { requestWriteAccess: true }
                  : {}),
              },
            }
          : {}),
        ...(button.pay ? { pay: true } : {}),
        ...(button.url ? { url: button.url } : {}),
        ...(button.web_app?.url ? { webApp: { url: button.web_app.url } } : {}),
        ...(button.switch_inline_query != null
          ? { switchInlineQuery: button.switch_inline_query }
          : {}),
        ...(button.switch_inline_query_current_chat != null
          ? {
              switchInlineQueryCurrentChat:
                button.switch_inline_query_current_chat,
            }
          : {}),
        ...(button.switch_inline_query_chosen_chat
          ? {
              switchInlineQueryChosenChat: {
                ...(button.switch_inline_query_chosen_chat.query != null
                  ? { query: button.switch_inline_query_chosen_chat.query }
                  : {}),
                ...(button.switch_inline_query_chosen_chat.allow_user_chats
                  ? { allowUserChats: true }
                  : {}),
                ...(button.switch_inline_query_chosen_chat.allow_bot_chats
                  ? { allowBotChats: true }
                  : {}),
                ...(button.switch_inline_query_chosen_chat.allow_group_chats
                  ? { allowGroupChats: true }
                  : {}),
                ...(button.switch_inline_query_chosen_chat.allow_channel_chats
                  ? { allowChannelChats: true }
                  : {}),
              },
            }
          : {}),
      }))
    ),
  };
}

function giftEventFromTelegram(raw: unknown): GiftEventInfo {
  const g = raw as {
    gift?: { id?: string };
    owned_gift_id?: string;
    convert_star_count?: number;
    prepaid_upgrade_star_count?: number;
    is_upgrade_separate?: boolean;
    can_be_upgraded?: boolean;
    text?: string;
    entities?: TelegramMessageEntity[];
    is_private?: boolean;
    unique_gift_number?: number;
  };
  return {
    giftId: g.gift?.id ?? "",
    ...(g.owned_gift_id ? { ownedGiftId: g.owned_gift_id } : {}),
    ...(g.convert_star_count != null
      ? { convertStarCount: g.convert_star_count }
      : {}),
    ...(g.prepaid_upgrade_star_count != null
      ? { prepaidUpgradeStarCount: g.prepaid_upgrade_star_count }
      : {}),
    ...(g.is_upgrade_separate != null
      ? { isUpgradeSeparate: g.is_upgrade_separate }
      : {}),
    ...(g.can_be_upgraded != null ? { canBeUpgraded: g.can_be_upgraded } : {}),
    ...(g.text ? { text: g.text } : {}),
    ...(g.entities ? { entities: entitiesFromTelegram(g.entities) } : {}),
    ...(g.is_private != null ? { isPrivate: g.is_private } : {}),
    ...(g.unique_gift_number != null
      ? { uniqueGiftNumber: g.unique_gift_number }
      : {}),
  };
}

function pollOptionEventFromTelegram(raw: unknown): {
  optionPersistentId: string;
  optionText: string;
  optionTextEntities?: MessageEntity[];
} {
  const o = raw as {
    option_persistent_id?: string;
    option_text?: string;
    option_text_entities?: TelegramMessageEntity[];
  };
  return {
    optionPersistentId: o.option_persistent_id ?? "",
    optionText: o.option_text ?? "",
    ...(o.option_text_entities
      ? { optionTextEntities: entitiesFromTelegram(o.option_text_entities) }
      : {}),
  };
}

function systemEventFromMessage(
  msg: TelegramMessage
): MessageSystemEvent | undefined {
  if (msg.new_chat_members?.length) {
    return {
      type: "members_added",
      users: msg.new_chat_members
        .map((user) => skylineUser(user))
        .filter((user): user is User => Boolean(user)),
    };
  }
  if (msg.left_chat_member) {
    const user = skylineUser(msg.left_chat_member);
    if (user) {
      return { type: "member_left", user };
    }
  }
  if (msg.chat_owner_left != null) {
    const evt = msg.chat_owner_left as { new_owner?: TelegramUser };
    const owner = evt.new_owner ? skylineUser(evt.new_owner) : undefined;
    return { type: "owner_left", ...(owner ? { newOwner: owner } : {}) };
  }
  if (msg.chat_owner_changed != null) {
    const evt = msg.chat_owner_changed as { new_owner?: TelegramUser };
    const owner = evt.new_owner ? skylineUser(evt.new_owner) : undefined;
    if (owner) {
      return { type: "owner_changed", newOwner: owner };
    }
  }
  if (msg.new_chat_title != null) {
    return { type: "title_changed", title: msg.new_chat_title };
  }
  if (msg.new_chat_photo) {
    return { type: "photo_changed" };
  }
  if (msg.delete_chat_photo) {
    return { type: "photo_deleted" };
  }
  if (msg.group_chat_created) {
    return { type: "group_created" };
  }
  if (msg.supergroup_chat_created) {
    return { type: "supergroup_created" };
  }
  if (msg.channel_chat_created) {
    return { type: "channel_created" };
  }
  if (msg.message_auto_delete_timer_changed != null) {
    const evt = msg.message_auto_delete_timer_changed as {
      message_auto_delete_time?: number;
    };
    return {
      type: "auto_delete_timer_changed",
      messageAutoDeleteTime: evt.message_auto_delete_time ?? 0,
    };
  }
  if (msg.migrate_to_chat_id != null) {
    return { type: "migrated_to", chatId: String(msg.migrate_to_chat_id) };
  }
  if (msg.migrate_from_chat_id != null) {
    return { type: "migrated_from", chatId: String(msg.migrate_from_chat_id) };
  }
  if (msg.pinned_message) {
    const pinned = msg.pinned_message as { message_id?: number };
    return {
      type: "message_pinned",
      ...(pinned.message_id != null
        ? { messageGuid: String(pinned.message_id) }
        : {}),
    };
  }
  if (msg.successful_payment) {
    const payment = msg.successful_payment;
    const orderInfo = orderInfoFromTelegram(payment.order_info);
    return {
      type: "successful_payment",
      currency: payment.currency,
      invoicePayload: payment.invoice_payload,
      totalAmount: payment.total_amount,
      ...(payment.is_first_recurring != null
        ? { isFirstRecurring: payment.is_first_recurring }
        : {}),
      ...(payment.is_recurring != null
        ? { isRecurring: payment.is_recurring }
        : {}),
      ...(orderInfo ? { orderInfo } : {}),
      ...(payment.shipping_option_id
        ? { shippingOptionId: payment.shipping_option_id }
        : {}),
      ...(payment.subscription_expiration_date != null
        ? { subscriptionExpirationDate: payment.subscription_expiration_date }
        : {}),
      ...(payment.telegram_payment_charge_id
        ? { telegramPaymentChargeId: payment.telegram_payment_charge_id }
        : {}),
      ...(payment.provider_payment_charge_id
        ? { providerPaymentChargeId: payment.provider_payment_charge_id }
        : {}),
    };
  }
  if (msg.refunded_payment) {
    const payment = msg.refunded_payment;
    return {
      type: "refunded_payment",
      currency: payment.currency,
      totalAmount: payment.total_amount,
      ...(payment.invoice_payload
        ? { invoicePayload: payment.invoice_payload }
        : {}),
      ...(payment.telegram_payment_charge_id
        ? { telegramPaymentChargeId: payment.telegram_payment_charge_id }
        : {}),
      ...(payment.provider_payment_charge_id
        ? { providerPaymentChargeId: payment.provider_payment_charge_id }
        : {}),
    };
  }
  if (msg.users_shared) {
    return {
      type: "users_shared",
      users: (msg.users_shared.users ?? [])
        .map((user) => skylineUser(user))
        .filter((user): user is User => Boolean(user)),
      ...(msg.users_shared.request_id != null
        ? { requestId: String(msg.users_shared.request_id) }
        : {}),
    };
  }
  if (msg.chat_shared) {
    return {
      type: "chat_shared",
      chatId: String(msg.chat_shared.chat_id),
      ...(msg.chat_shared.request_id != null
        ? { requestId: String(msg.chat_shared.request_id) }
        : {}),
    };
  }
  if (msg.gift != null) {
    return { type: "gift", ...giftEventFromTelegram(msg.gift) };
  }
  if (msg.unique_gift != null) {
    const g = msg.unique_gift as {
      gift?: { name?: string; base_name?: string };
      origin?: string;
      owned_gift_id?: string;
      last_resale_currency?: string;
      last_resale_amount?: number;
      transfer_star_count?: number;
      next_transfer_date?: number;
    };
    return {
      type: "unique_gift",
      origin: g.origin ?? "",
      ...(g.gift?.name ?? g.gift?.base_name
        ? { giftName: g.gift?.name ?? g.gift?.base_name }
        : {}),
      ...(g.owned_gift_id ? { ownedGiftId: g.owned_gift_id } : {}),
      ...(g.last_resale_currency
        ? { lastResaleCurrency: g.last_resale_currency }
        : {}),
      ...(g.last_resale_amount != null
        ? { lastResaleAmount: g.last_resale_amount }
        : {}),
      ...(g.transfer_star_count != null
        ? { transferStarCount: g.transfer_star_count }
        : {}),
      ...(g.next_transfer_date != null
        ? { nextTransferDate: g.next_transfer_date }
        : {}),
    };
  }
  if (msg.gift_upgrade_sent != null) {
    return {
      type: "gift_upgrade_sent",
      ...giftEventFromTelegram(msg.gift_upgrade_sent),
    };
  }
  if (msg.connected_website) {
    return { type: "connected_website", domain: msg.connected_website };
  }
  if (msg.write_access_allowed != null) {
    const w = msg.write_access_allowed as {
      from_request?: boolean;
      web_app_name?: string;
      from_attachment_menu?: boolean;
    };
    return {
      type: "write_access_allowed",
      ...(w.from_request != null ? { fromRequest: w.from_request } : {}),
      ...(w.web_app_name ? { webAppName: w.web_app_name } : {}),
      ...(w.from_attachment_menu != null
        ? { fromAttachmentMenu: w.from_attachment_menu }
        : {}),
    };
  }
  if (msg.passport_data != null) {
    const p = msg.passport_data as { data?: { type?: string }[] };
    return {
      type: "passport_data",
      elementTypes: (p.data ?? [])
        .map((el) => el.type)
        .filter((t): t is string => Boolean(t)),
    };
  }
  if (msg.proximity_alert_triggered != null) {
    const a = msg.proximity_alert_triggered as {
      traveler?: TelegramUser;
      watcher?: TelegramUser;
      distance?: number;
    };
    const traveler = a.traveler ? skylineUser(a.traveler) : undefined;
    const watcher = a.watcher ? skylineUser(a.watcher) : undefined;
    return {
      type: "proximity_alert",
      distance: a.distance ?? 0,
      ...(traveler ? { traveler } : {}),
      ...(watcher ? { watcher } : {}),
    };
  }
  if (msg.boost_added != null) {
    const boost = msg.boost_added as { boost_count?: number };
    return {
      type: "boost_added",
      ...(boost.boost_count != null ? { boostCount: boost.boost_count } : {}),
    };
  }
  if (msg.chat_background_set != null) {
    const bg = msg.chat_background_set as { type?: { type?: string } };
    return {
      type: "chat_background_set",
      ...(bg.type?.type ? { backgroundType: bg.type.type } : {}),
    };
  }
  if (msg.checklist_tasks_done != null) {
    const c = msg.checklist_tasks_done as {
      marked_as_done_task_ids?: number[];
      marked_as_not_done_task_ids?: number[];
    };
    return {
      type: "checklist_tasks_done",
      ...(c.marked_as_done_task_ids
        ? { markedAsDoneTaskIds: c.marked_as_done_task_ids }
        : {}),
      ...(c.marked_as_not_done_task_ids
        ? { markedAsNotDoneTaskIds: c.marked_as_not_done_task_ids }
        : {}),
    };
  }
  if (msg.checklist_tasks_added != null) {
    const c = msg.checklist_tasks_added as {
      tasks?: { id?: string | number; text?: string }[];
    };
    return {
      type: "checklist_tasks_added",
      tasks: (c.tasks ?? []).map((task) => ({
        ...(task.id != null ? { id: String(task.id) } : {}),
        ...(task.text ? { text: task.text } : {}),
      })),
    };
  }
  if (msg.community_chat_added != null) {
    const c = msg.community_chat_added as {
      community?: { id?: string | number; name?: string };
    };
    return {
      type: "community_chat_added",
      community: {
        id: String(c.community?.id ?? ""),
        name: c.community?.name ?? "",
      },
    };
  }
  if (msg.community_chat_removed != null) {
    return { type: "community_chat_removed" };
  }
  if (msg.direct_message_price_changed != null) {
    const d = msg.direct_message_price_changed as {
      are_direct_messages_enabled?: boolean;
      direct_message_star_count?: number;
    };
    return {
      type: "direct_message_price_changed",
      areDirectMessagesEnabled: d.are_direct_messages_enabled ?? false,
      ...(d.direct_message_star_count != null
        ? { directMessageStarCount: d.direct_message_star_count }
        : {}),
    };
  }
  if (msg.forum_topic_created) {
    const topic = msg.forum_topic_created;
    return {
      type: "forum_topic_created",
      ...(topic.name ? { name: topic.name } : {}),
      ...(topic.icon_color != null ? { iconColor: topic.icon_color } : {}),
      ...(topic.icon_custom_emoji_id
        ? { iconCustomEmojiId: topic.icon_custom_emoji_id }
        : {}),
    };
  }
  if (msg.forum_topic_edited) {
    const topic = msg.forum_topic_edited;
    return {
      type: "forum_topic_edited",
      ...(topic.name ? { name: topic.name } : {}),
      ...(topic.icon_custom_emoji_id
        ? { iconCustomEmojiId: topic.icon_custom_emoji_id }
        : {}),
    };
  }
  if (msg.forum_topic_closed != null) {
    return { type: "forum_topic_closed" };
  }
  if (msg.forum_topic_reopened != null) {
    return { type: "forum_topic_reopened" };
  }
  if (msg.general_forum_topic_hidden != null) {
    return { type: "general_forum_topic_hidden" };
  }
  if (msg.general_forum_topic_unhidden != null) {
    return { type: "general_forum_topic_unhidden" };
  }
  if (msg.giveaway_created != null) {
    const g = msg.giveaway_created as { prize_star_count?: number };
    return {
      type: "giveaway_created",
      ...(g.prize_star_count != null
        ? { prizeStarCount: g.prize_star_count }
        : {}),
    };
  }
  if (msg.giveaway_completed != null) {
    const g = msg.giveaway_completed as {
      winner_count?: number;
      unclaimed_prize_count?: number;
      is_star_giveaway?: boolean;
    };
    return {
      type: "giveaway_completed",
      winnerCount: g.winner_count ?? 0,
      ...(g.unclaimed_prize_count != null
        ? { unclaimedPrizeCount: g.unclaimed_prize_count }
        : {}),
      ...(g.is_star_giveaway != null
        ? { isStarGiveaway: g.is_star_giveaway }
        : {}),
    };
  }
  if (msg.managed_bot_created != null) {
    const m = msg.managed_bot_created as { bot?: TelegramUser };
    const bot = m.bot ? skylineUser(m.bot) : undefined;
    if (bot) {
      return { type: "managed_bot_created", bot };
    }
  }
  if (msg.paid_message_price_changed != null) {
    const p = msg.paid_message_price_changed as {
      paid_message_star_count?: number;
    };
    return {
      type: "paid_message_price_changed",
      paidMessageStarCount: p.paid_message_star_count ?? 0,
    };
  }
  if (msg.poll_option_added != null) {
    return {
      type: "poll_option_added",
      ...pollOptionEventFromTelegram(msg.poll_option_added),
    };
  }
  if (msg.poll_option_deleted != null) {
    return {
      type: "poll_option_deleted",
      ...pollOptionEventFromTelegram(msg.poll_option_deleted),
    };
  }
  if (msg.suggested_post_approved != null) {
    const s = msg.suggested_post_approved as {
      price?: { currency?: string; amount?: number };
      send_date?: number;
    };
    return {
      type: "suggested_post_approved",
      sendDate: s.send_date ?? 0,
      ...(s.price
        ? {
            price: {
              currency: s.price.currency ?? "",
              amount: s.price.amount ?? 0,
            },
          }
        : {}),
    };
  }
  if (msg.suggested_post_approval_failed != null) {
    const s = msg.suggested_post_approval_failed as {
      price?: { currency?: string; amount?: number };
    };
    return {
      type: "suggested_post_approval_failed",
      price: {
        currency: s.price?.currency ?? "",
        amount: s.price?.amount ?? 0,
      },
    };
  }
  if (msg.suggested_post_declined != null) {
    const s = msg.suggested_post_declined as { comment?: string };
    return {
      type: "suggested_post_declined",
      ...(s.comment ? { comment: s.comment } : {}),
    };
  }
  if (msg.suggested_post_paid != null) {
    const s = msg.suggested_post_paid as {
      currency?: string;
      amount?: number;
      star_amount?: { amount?: number; nanostar_amount?: number };
    };
    return {
      type: "suggested_post_paid",
      currency: s.currency ?? "",
      ...(s.amount != null ? { amount: s.amount } : {}),
      ...(s.star_amount
        ? {
            starAmount: {
              amount: s.star_amount.amount ?? 0,
              ...(s.star_amount.nanostar_amount != null
                ? { nanostarAmount: s.star_amount.nanostar_amount }
                : {}),
            },
          }
        : {}),
    };
  }
  if (msg.suggested_post_refunded != null) {
    const s = msg.suggested_post_refunded as { reason?: string };
    return {
      type: "suggested_post_refunded",
      reason: s.reason ?? "",
    };
  }
  if (msg.video_chat_scheduled) {
    return {
      type: "video_chat_scheduled",
      ...(msg.video_chat_scheduled.start_date != null
        ? { startDate: msg.video_chat_scheduled.start_date }
        : {}),
    };
  }
  if (msg.video_chat_started != null) {
    return { type: "video_chat_started" };
  }
  if (msg.video_chat_ended) {
    return {
      type: "video_chat_ended",
      ...(msg.video_chat_ended.duration != null
        ? { duration: msg.video_chat_ended.duration }
        : {}),
    };
  }
  if (msg.video_chat_participants_invited) {
    return {
      type: "video_chat_participants_invited",
      users: (msg.video_chat_participants_invited.users ?? [])
        .map((user) => skylineUser(user))
        .filter((user): user is User => Boolean(user)),
    };
  }
  if (msg.web_app_data) {
    return {
      type: "web_app_data",
      data: msg.web_app_data.data,
      ...(msg.web_app_data.button_text
        ? { buttonText: msg.web_app_data.button_text }
        : {}),
    };
  }
  return;
}

/** Extra content kinds beyond the classic media mapper. */
function extraContentFromMessage(msg: TelegramMessage): Content | undefined {
  if (msg.rich_message != null) {
    const rich = msg.rich_message as {
      html?: string;
      markdown?: string;
      text?: string;
    };
    return {
      type: "rich_message",
      ...(rich.html ? { html: rich.html } : {}),
      ...(rich.markdown ? { markdown: rich.markdown } : {}),
      ...(rich.text ? { text: rich.text } : {}),
    };
  }
  if (msg.checklist) {
    const checklist = msg.checklist as {
      title?: string;
      tasks?: { id?: string | number; text?: string }[];
      others_can_add_tasks?: boolean;
      others_can_mark_tasks_as_done?: boolean;
    };
    return {
      type: "checklist",
      title: checklist.title,
      items: (checklist.tasks ?? []).map((task) => ({
        ...(task.id != null ? { id: String(task.id) } : {}),
        text: task.text ?? "",
      })),
      ...(checklist.others_can_add_tasks != null
        ? { othersCanAddTasks: checklist.others_can_add_tasks }
        : {}),
      ...(checklist.others_can_mark_tasks_as_done != null
        ? { othersCanMarkTasksAsDone: checklist.others_can_mark_tasks_as_done }
        : {}),
    };
  }
  if (msg.paid_media) {
    const paid = msg.paid_media as {
      star_count?: number;
      paid_media?: { type?: string }[];
    };
    return {
      type: "paid_media",
      starCount: paid.star_count ?? 0,
      media: [],
      payload: undefined,
    };
  }
  if (msg.story) {
    const story = msg.story as { chat?: TelegramChat; id?: number };
    return {
      type: "story",
      storyId: String(story.id ?? ""),
      ...(story.chat ? { chatId: String(story.chat.id) } : {}),
    };
  }
  if (msg.giveaway_winners != null) {
    return {
      type: "giveaway_winners",
      payload:
        (asJsonValue(msg.giveaway_winners) as Record<
          string,
          string | number | boolean | null
        >) ?? undefined,
    };
  }
  if (msg.giveaway != null) {
    return {
      type: "giveaway",
      payload:
        (asJsonValue(msg.giveaway) as Record<
          string,
          string | number | boolean | null
        >) ?? undefined,
    };
  }
  return;
}
