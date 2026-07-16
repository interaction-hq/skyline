import type {
  AttachmentSend,
  Content,
  ContentInput,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import type {
  BusinessConnectionInfo,
  BusinessOps,
  Channel,
  ChatInfo,
  ChatInfoTelegram,
  ChatInviteLink,
  ChatMember,
  EphemeralOps,
  GameHighScore,
  GiftsPage,
  Message,
  MessageEdit,
  OwnedGift,
  Platform,
  PostsOps,
  PreparedInlineResult,
  PreparedKeyboardResult,
  ReactionTypeInfo,
  StickerInfo,
  StickerOps,
  StickerSet,
  StoryContent,
  StoryOps,
  StoryRef,
  TransactionPartnerInfo,
  User,
  WebAppOps,
} from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  contentSugar,
  messageFromSend,
  mimeToMediaName,
  readMediaBytes,
  sendWithFallbacks,
  withResponding,
} from "@skyline-ts/core/host";
import {
  type TelegramMessage,
  type TelegramMessageEntity,
  type TelegramPoll,
  TelegramClient,
  asTelegramParams,
  createTelegramWebhookHandler,
  ensureTelegramWebhook,
  inlineQueryResultToTelegram,
  linkPreviewToTelegram,
  replyMarkupToTelegram,
  startTelegramPolling,
} from "./client.js";
import {
  botIdFromToken,
  telegramDedicatedLines,
  type TelegramConfig,
  type TelegramDedicatedConfig,
} from "./config.js";
import {
  dispatchTelegramUpdate,
  entitiesFromTelegram,
  getCachedPoll,
  messageFromTelegram,
  rememberPollFromTelegram,
} from "./inbound.js";
import {
  isAllowedReactionEmoji,
  normalizeReactionEmoji,
  sendContent,
} from "./send.js";

function telegramUser(user: {
  first_name?: string;
  id: number;
  username?: string;
}): User {
  return {
    displayName: user.first_name ?? user.username,
    handle: user.username,
    id: String(user.id),
  };
}

interface TgGeo {
  latitude: number;
  longitude: number;
}

interface TgChatFullInfo {
  accent_color_id?: number;
  accepted_gift_types?: {
    limited_gifts?: boolean;
    premium_subscription?: boolean;
    unique_gifts?: boolean;
    unlimited_gifts?: boolean;
  };
  active_usernames?: string[];
  available_reactions?: {
    custom_emoji_id?: string;
    emoji?: string;
    type: string;
  }[];
  background_custom_emoji_id?: string;
  bio?: string;
  birthdate?: { day: number; month: number; year?: number };
  business_intro?: {
    message?: string;
    sticker?: {
      emoji?: string;
      file_id: string;
      is_animated?: boolean;
      is_video?: boolean;
      set_name?: string;
    };
    title?: string;
  };
  business_location?: { address: string; location?: TgGeo };
  business_opening_hours?: {
    opening_hours?: { closing_minute: number; opening_minute: number }[];
    time_zone_name: string;
  };
  can_send_paid_media?: boolean;
  can_set_sticker_set?: boolean;
  community?: { id: number; name: string };
  custom_emoji_sticker_set_name?: string;
  description?: string;
  emoji_status_custom_emoji_id?: string;
  emoji_status_expiration_date?: number;
  first_name?: string;
  first_profile_audio?: {
    duration?: number;
    file_id: string;
    file_unique_id?: string;
    mime_type?: string;
    performer?: string;
    title?: string;
  };
  guard_bot?: { first_name?: string; id: number; username?: string };
  has_aggressive_anti_spam_enabled?: boolean;
  has_hidden_members?: boolean;
  has_private_forwards?: boolean;
  has_protected_content?: boolean;
  has_restricted_voice_and_video_messages?: boolean;
  has_visible_history?: boolean;
  id: number;
  invite_link?: string;
  is_direct_messages?: boolean;
  is_forum?: boolean;
  join_by_request?: boolean;
  join_to_send_messages?: boolean;
  last_name?: string;
  linked_chat_id?: number;
  location?: { address: string; location: TgGeo };
  max_reaction_count?: number;
  message_auto_delete_time?: number;
  paid_message_star_count?: number;
  parent_chat?: TgChatFullInfo;
  permissions?: Record<string, boolean | undefined>;
  personal_chat?: TgChatFullInfo;
  photo?: {
    big_file_id: string;
    big_file_unique_id: string;
    small_file_id: string;
    small_file_unique_id: string;
  };
  pinned_message?: TelegramMessage;
  profile_accent_color_id?: number;
  profile_background_custom_emoji_id?: string;
  rating?: {
    current_level_rating: number;
    level: number;
    next_level_rating?: number;
    rating: number;
  };
  slow_mode_delay?: number;
  sticker_set_name?: string;
  title?: string;
  type: string;
  unique_gift_colors?: {
    dark_theme_main_color: number;
    dark_theme_other_colors: number[];
    light_theme_main_color: number;
    light_theme_other_colors: number[];
    model_custom_emoji_id: string;
    symbol_custom_emoji_id: string;
  };
  unrestrict_boost_count?: number;
  username?: string;
}

function reactionTypeInfoFromTelegram(raw: {
  custom_emoji_id?: string;
  emoji?: string;
  type: string;
}): ReactionTypeInfo {
  if (raw.type === "custom_emoji") {
    return { customEmojiId: raw.custom_emoji_id ?? "", type: "custom_emoji" };
  }
  if (raw.type === "paid") {
    return { type: "paid" };
  }
  return { emoji: raw.emoji ?? "", type: "emoji" };
}

/** Map Telegram `ChatFullInfo` (from getChat) into the unified `ChatInfo`. */
function chatInfoFromTelegram(
  client: TelegramClient,
  channel: Channel,
  raw: TgChatFullInfo
): ChatInfo {
  const g = raw.accepted_gift_types;
  const telegram: ChatInfoTelegram = {
    acceptedGiftTypes: g
      ? {
          limitedGifts: Boolean(g.limited_gifts),
          premiumSubscription: Boolean(g.premium_subscription),
          unlimitedGifts: Boolean(g.unlimited_gifts),
          uniqueGifts: Boolean(g.unique_gifts),
        }
      : undefined,
    accentColorId: raw.accent_color_id,
    activeUsernames: raw.active_usernames,
    availableReactions: Array.isArray(raw.available_reactions)
      ? raw.available_reactions.map(reactionTypeInfoFromTelegram)
      : undefined,
    backgroundCustomEmojiId: raw.background_custom_emoji_id,
    birthdate: raw.birthdate
      ? {
          day: raw.birthdate.day,
          month: raw.birthdate.month,
          year: raw.birthdate.year,
        }
      : undefined,
    businessIntro: raw.business_intro
      ? {
          message: raw.business_intro.message,
          sticker: raw.business_intro.sticker
            ? {
                emoji: raw.business_intro.sticker.emoji,
                fileId: raw.business_intro.sticker.file_id,
                isAnimated: raw.business_intro.sticker.is_animated,
                isVideo: raw.business_intro.sticker.is_video,
                setName: raw.business_intro.sticker.set_name,
              }
            : undefined,
          title: raw.business_intro.title,
        }
      : undefined,
    businessLocation: raw.business_location
      ? {
          address: raw.business_location.address,
          location: raw.business_location.location
            ? {
                latitude: raw.business_location.location.latitude,
                longitude: raw.business_location.location.longitude,
              }
            : undefined,
        }
      : undefined,
    businessOpeningHours: raw.business_opening_hours
      ? {
          openingHours: (
            raw.business_opening_hours.opening_hours ?? []
          ).map((interval: { closing_minute: number; opening_minute: number }) => ({
            closingMinute: interval.closing_minute,
            openingMinute: interval.opening_minute,
          })),
          timeZoneName: raw.business_opening_hours.time_zone_name,
        }
      : undefined,
    canSendPaidMedia: raw.can_send_paid_media,
    community: raw.community
      ? { id: String(raw.community.id), name: raw.community.name }
      : undefined,
    customEmojiStickerSetName: raw.custom_emoji_sticker_set_name,
    emojiStatusCustomEmojiId: raw.emoji_status_custom_emoji_id,
    emojiStatusExpirationDate: raw.emoji_status_expiration_date,
    firstProfileAudio: raw.first_profile_audio
      ? {
          duration: raw.first_profile_audio.duration,
          fileId: raw.first_profile_audio.file_id,
          fileUniqueId: raw.first_profile_audio.file_unique_id,
          mimeType: raw.first_profile_audio.mime_type,
          performer: raw.first_profile_audio.performer,
          title: raw.first_profile_audio.title,
        }
      : undefined,
    guardBot: raw.guard_bot ? telegramUser(raw.guard_bot) : undefined,
    hasPrivateForwards: raw.has_private_forwards,
    hasRestrictedVoiceAndVideoMessages:
      raw.has_restricted_voice_and_video_messages,
    isDirectMessages: raw.is_direct_messages,
    maxReactionCount: raw.max_reaction_count,
    paidMessageStarCount: raw.paid_message_star_count,
    parentChat: raw.parent_chat
      ? chatInfoFromTelegram(client, channel, raw.parent_chat)
      : undefined,
    personalChat: raw.personal_chat
      ? chatInfoFromTelegram(client, channel, raw.personal_chat)
      : undefined,
    profileAccentColorId: raw.profile_accent_color_id,
    profileBackgroundCustomEmojiId: raw.profile_background_custom_emoji_id,
    rating: raw.rating
      ? {
          currentLevelRating: raw.rating.current_level_rating,
          level: raw.rating.level,
          nextLevelRating: raw.rating.next_level_rating,
          rating: raw.rating.rating,
        }
      : undefined,
    uniqueGiftColors: raw.unique_gift_colors
      ? {
          darkThemeMainColor: raw.unique_gift_colors.dark_theme_main_color,
          darkThemeOtherColors: raw.unique_gift_colors.dark_theme_other_colors,
          lightThemeMainColor: raw.unique_gift_colors.light_theme_main_color,
          lightThemeOtherColors: raw.unique_gift_colors.light_theme_other_colors,
          modelCustomEmojiId: raw.unique_gift_colors.model_custom_emoji_id,
          symbolCustomEmojiId: raw.unique_gift_colors.symbol_custom_emoji_id,
        }
      : undefined,
    unrestrictBoostCount: raw.unrestrict_boost_count,
  };
  const pinned = raw.pinned_message
    ? messageFromTelegram(channel, client, raw.pinned_message, "")
    : undefined;
  return {
    bio: raw.bio,
    canSetStickerSet: raw.can_set_sticker_set,
    description: raw.description,
    firstName: raw.first_name,
    hasAggressiveAntiSpamEnabled: raw.has_aggressive_anti_spam_enabled,
    hasHiddenMembers: raw.has_hidden_members,
    hasProtectedContent: raw.has_protected_content,
    hasVisibleHistory: raw.has_visible_history,
    id: String(raw.id),
    inviteLink: raw.invite_link,
    isForum: raw.is_forum,
    joinByRequest: raw.join_by_request,
    joinToSendMessages: raw.join_to_send_messages,
    lastName: raw.last_name,
    linkedChatId:
      raw.linked_chat_id != null ? String(raw.linked_chat_id) : undefined,
    location: raw.location
      ? {
          address: raw.location.address,
          location: {
            latitude: raw.location.location.latitude,
            longitude: raw.location.location.longitude,
          },
        }
      : undefined,
    messageAutoDeleteTime: raw.message_auto_delete_time,
    permissions: raw.permissions
      ? {
          canAddWebPagePreviews: raw.permissions.can_add_web_page_previews,
          canChangeInfo: raw.permissions.can_change_info,
          canInviteUsers: raw.permissions.can_invite_users,
          canManageTopics: raw.permissions.can_manage_topics,
          canPinMessages: raw.permissions.can_pin_messages,
          canSendAudios: raw.permissions.can_send_audios,
          canSendDocuments: raw.permissions.can_send_documents,
          canSendMessages: raw.permissions.can_send_messages,
          canSendOtherMessages: raw.permissions.can_send_other_messages,
          canSendPhotos: raw.permissions.can_send_photos,
          canSendPolls: raw.permissions.can_send_polls,
          canSendVideoNotes: raw.permissions.can_send_video_notes,
          canSendVideos: raw.permissions.can_send_videos,
          canSendVoiceNotes: raw.permissions.can_send_voice_notes,
        }
      : undefined,
    photo: raw.photo
      ? {
          bigFileId: raw.photo.big_file_id,
          bigFileUniqueId: raw.photo.big_file_unique_id,
          smallFileId: raw.photo.small_file_id,
          smallFileUniqueId: raw.photo.small_file_unique_id,
        }
      : undefined,
    pinnedMessage: pinned,
    slowModeDelay: raw.slow_mode_delay,
    stickerSetName: raw.sticker_set_name,
    telegram,
    title: raw.title,
    type: raw.type,
    username: raw.username,
  };
}

interface TgChatInviteLink {
  creates_join_request?: boolean;
  creator?: { first_name?: string; id: number; username?: string };
  expire_date?: number;
  invite_link: string;
  is_primary?: boolean;
  is_revoked?: boolean;
  member_limit?: number;
  name?: string;
  pending_join_request_count?: number;
  subscription_period?: number;
  subscription_price?: number;
}

function inviteLinkFromTelegram(raw: TgChatInviteLink): ChatInviteLink {
  return {
    createsJoinRequest: Boolean(raw.creates_join_request),
    creator: telegramUser(raw.creator ?? { id: 0 }),
    expireDate: raw.expire_date,
    inviteLink: raw.invite_link,
    isPrimary: Boolean(raw.is_primary),
    isRevoked: Boolean(raw.is_revoked),
    memberLimit: raw.member_limit,
    name: raw.name,
    pendingJoinRequestCount: raw.pending_join_request_count,
    subscriptionPeriod: raw.subscription_period,
    subscriptionPrice: raw.subscription_price,
  };
}

interface TgChatMember {
  can_add_web_page_previews?: boolean;
  can_be_edited?: boolean;
  can_change_info?: boolean;
  can_delete_messages?: boolean;
  can_delete_stories?: boolean;
  can_edit_messages?: boolean;
  can_edit_stories?: boolean;
  can_edit_tag?: boolean;
  can_invite_users?: boolean;
  can_manage_chat?: boolean;
  can_manage_direct_messages?: boolean;
  can_manage_tags?: boolean;
  can_manage_topics?: boolean;
  can_manage_video_chats?: boolean;
  can_pin_messages?: boolean;
  can_post_messages?: boolean;
  can_post_stories?: boolean;
  can_promote_members?: boolean;
  can_react_to_messages?: boolean;
  can_restrict_members?: boolean;
  can_send_audios?: boolean;
  can_send_documents?: boolean;
  can_send_messages?: boolean;
  can_send_other_messages?: boolean;
  can_send_photos?: boolean;
  can_send_polls?: boolean;
  can_send_video_notes?: boolean;
  can_send_videos?: boolean;
  can_send_voice_notes?: boolean;
  custom_title?: string;
  is_anonymous?: boolean;
  is_member?: boolean;
  status: string;
  tag?: string;
  until_date?: number;
  user: { first_name?: string; id: number; username?: string };
}

function chatMemberFromTelegram(raw: TgChatMember): ChatMember {
  const user = telegramUser(raw.user);
  switch (raw.status) {
    case "creator":
      return {
        customTitle: raw.custom_title,
        isAnonymous: Boolean(raw.is_anonymous),
        status: "creator",
        user,
      };
    case "administrator":
      return {
        canBeEdited: Boolean(raw.can_be_edited),
        canChangeInfo: Boolean(raw.can_change_info),
        canDeleteMessages: Boolean(raw.can_delete_messages),
        canDeleteStories: Boolean(raw.can_delete_stories),
        canEditMessages: raw.can_edit_messages,
        canEditStories: Boolean(raw.can_edit_stories),
        canInviteUsers: Boolean(raw.can_invite_users),
        canManageChat: Boolean(raw.can_manage_chat),
        canManageDirectMessages: raw.can_manage_direct_messages,
        canManageTags: raw.can_manage_tags,
        canManageTopics: raw.can_manage_topics,
        canManageVideoChats: Boolean(raw.can_manage_video_chats),
        canPinMessages: raw.can_pin_messages,
        canPostMessages: raw.can_post_messages,
        canPostStories: Boolean(raw.can_post_stories),
        canPromoteMembers: Boolean(raw.can_promote_members),
        canRestrictMembers: Boolean(raw.can_restrict_members),
        customTitle: raw.custom_title,
        isAnonymous: Boolean(raw.is_anonymous),
        status: "administrator",
        user,
      };
    case "restricted":
      return {
        canAddWebPagePreviews: Boolean(raw.can_add_web_page_previews),
        canChangeInfo: Boolean(raw.can_change_info),
        canEditTag: Boolean(raw.can_edit_tag),
        canInviteUsers: Boolean(raw.can_invite_users),
        canManageTopics: Boolean(raw.can_manage_topics),
        canPinMessages: Boolean(raw.can_pin_messages),
        canReactToMessages: Boolean(raw.can_react_to_messages),
        canSendAudios: Boolean(raw.can_send_audios),
        canSendDocuments: Boolean(raw.can_send_documents),
        canSendMessages: Boolean(raw.can_send_messages),
        canSendOtherMessages: Boolean(raw.can_send_other_messages),
        canSendPhotos: Boolean(raw.can_send_photos),
        canSendPolls: Boolean(raw.can_send_polls),
        canSendVideoNotes: Boolean(raw.can_send_video_notes),
        canSendVideos: Boolean(raw.can_send_videos),
        canSendVoiceNotes: Boolean(raw.can_send_voice_notes),
        isMember: Boolean(raw.is_member),
        status: "restricted",
        tag: raw.tag,
        untilDate: raw.until_date ?? 0,
        user,
      };
    case "kicked":
      return { status: "kicked", untilDate: raw.until_date ?? 0, user };
    case "left":
      return { status: "left", user };
    default:
      return { status: "member", tag: raw.tag, untilDate: raw.until_date, user };
  }
}

interface TgTransactionPartner {
  chat?: { id: number };
  commission_per_mille?: number;
  gift?: { id?: string | number };
  invoice_payload?: string;
  paid_media_payload?: string;
  premium_subscription_duration?: number;
  request_count?: number;
  sponsor_user?: { id: number };
  subscription_period?: number;
  transaction_type?: string;
  type: string;
  user?: { first_name?: string; id: number; username?: string };
  withdrawal_state?: { date?: number; type: string; url?: string };
}

function transactionPartnerFromTelegram(
  raw?: TgTransactionPartner
): TransactionPartnerInfo | undefined {
  if (!raw) {
    return;
  }
  return {
    chatId: raw.chat != null ? String(raw.chat.id) : undefined,
    commissionPerMille: raw.commission_per_mille,
    giftId: raw.gift?.id != null ? String(raw.gift.id) : undefined,
    invoicePayload: raw.invoice_payload,
    paidMediaPayload: raw.paid_media_payload,
    premiumSubscriptionDuration: raw.premium_subscription_duration,
    requestCount: raw.request_count,
    sponsorUserId:
      raw.sponsor_user != null ? String(raw.sponsor_user.id) : undefined,
    subscriptionPeriod: raw.subscription_period,
    transactionType: raw.transaction_type,
    type: raw.type,
    user: raw.user ? telegramUser(raw.user) : undefined,
    withdrawalState: raw.withdrawal_state
      ? {
          date: raw.withdrawal_state.date,
          type: raw.withdrawal_state.type,
          url: raw.withdrawal_state.url,
        }
      : undefined,
  };
}

const webhookHandlers = new Map<
  string,
  (request: Request) => Promise<Response>
>();

/** Fetch handler registered when `telegram.config({ webhookUrl })` is used. */
export function telegramWebhookFetch(
  request: Request,
  botId?: string
): Promise<Response> {
  const handler = botId
    ? webhookHandlers.get(botId)
    : webhookHandlers.values().next().value;
  if (!handler) {
    return Promise.resolve(
      new Response("telegram webhook not configured", { status: 503 })
    );
  }
  return handler(request);
}

function createBinder(host: SkylineHost) {
  const clientFor = (_to: string): TelegramClient => {
    // Lines are keyed by bot id; chat targets (@user / chat_id) are not live keys.
    const line = host.lineForPlatform("telegram");
    const client = line.telegram as TelegramClient | undefined;
    if (!client) {
      throw new Error("telegram client not ready");
    }
    return client;
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const client = clientFor(to);
    const result = await sendContent(client, to, content, sendOpts, (verb) =>
      host.unsupported("telegram", verb)
    );
    if (!result) {
      return;
    }
    const guid = typeof result === "string" ? result : result.guid;
    return messageFromSend(channel, content, guid, {
      albumMessageGuids:
        typeof result === "string" ? undefined : result.albumGuids,
      mediaGroupId: typeof result === "string" ? undefined : result.mediaGroupId,
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: to,
      threadId: sendOpts?.threadId,
    });
  };

  const editMessage = async (
    to: string,
    messageGuid: string,
    update: MessageEdit
  ): Promise<void> => {
    const client = clientFor(to);
    if (typeof update === "string") {
      await client.editMessageText(to, messageGuid, update);
      return;
    }
    if (update.text != null) {
      await client.editMessageText(to, messageGuid, update.text);
    }
    if (update.caption != null) {
      await client.call("editMessageCaption", {
        caption: update.caption,
        chat_id: to,
        message_id: Number(messageGuid),
      });
    }
    if (update.markup !== undefined) {
      await client.call("editMessageReplyMarkup", {
        chat_id: to,
        message_id: Number(messageGuid),
        reply_markup: replyMarkupToTelegram(update.markup),
      });
    }
    if (update.media) {
      const file = update.media;
      const bytes = await readMediaBytes({
        data:
          file.data instanceof ArrayBuffer
            ? new Uint8Array(file.data)
            : file.data,
        path: file.path,
        url: file.url,
      });
      const mime = file.mimeType ?? "application/octet-stream";
      const name = file.name ?? mimeToMediaName(mime, "file");
      const kind = mime.startsWith("video/")
        ? "video"
        : mime.startsWith("image/")
          ? "photo"
          : "document";
      await client.upload(
        "editMessageMedia",
        {
          chat_id: to,
          media: JSON.stringify({
            media: "attach://file",
            type: kind,
          }),
          message_id: Number(messageGuid),
        },
        { bytes, field: "file", filename: name, mimeType: mime }
      );
    }
    if (update.checklist !== undefined) {
      const checklist = update.checklist;
      await client.call("editMessageChecklist", {
        chat_id: to,
        checklist: {
          others_can_add_tasks: checklist.othersCanAddTasks,
          others_can_mark_tasks_as_done: checklist.othersCanMarkTasksAsDone,
          tasks: checklist.items.map((item, index) => ({
            id: item.id ?? String(index + 1),
            text: item.text,
          })),
          title: checklist.title,
        },
        message_id: Number(messageGuid),
      });
    }
  };

  const makeChannel = (to: string): Channel => {
    let channel!: Channel;
    const client = () => clientFor(to);
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, resolved, sendOpts),
        content,
        "telegram"
      );
    const sugar = contentSugar(send);
    const listAdmins = async (opts?: { returnBots?: boolean }) => {
      const admins = await client().call<
        { user: { id: number; username?: string; first_name?: string } }[]
      >("getChatAdministrators", { chat_id: to, return_bots: opts?.returnBots });
      return admins.map((row) => ({
        displayName: row.user.first_name ?? row.user.username,
        handle: row.user.username,
        id: String(row.user.id),
      }));
    };
    channel = {
      ...sugar,
      add: async () =>
        host.unsupported(
          "telegram",
          "add — bots cannot add members; use invite.create / invite.export"
        ),
      answerCallback: (queryId, opts) =>
        client().answerCallbackQuery(queryId, opts).then(() => undefined),
      answerInline: async (queryId, results, opts) => {
        await client().call("answerInlineQuery", {
          inline_query_id: queryId,
          results: results.map(inlineQueryResultToTelegram),
          ...asTelegramParams(opts ?? {}),
        });
      },
      answerPreCheckout: async (queryId, opts) => {
        await client().call("answerPreCheckoutQuery", {
          error_message: opts?.errorMessage,
          ok: opts?.ok ?? !opts?.errorMessage,
          pre_checkout_query_id: queryId,
        });
      },
      answerShipping: async (queryId, opts) => {
        await client().call("answerShippingQuery", {
          error_message: opts.errorMessage,
          ok: opts.ok,
          shipping_options: opts.shippingOptions?.map((option) =>
            asTelegramParams(option)
          ),
          shipping_query_id: queryId,
        });
      },
      answerWebApp: async (queryId, result) => {
        await client().call("answerWebAppQuery", {
          result: inlineQueryResultToTelegram(result),
          web_app_query_id: queryId,
        });
      },
      approveJoin: async (userId) => {
        await client().call("approveChatJoinRequest", {
          chat_id: to,
          user_id: Number(userId),
        });
      },
      background: async () => host.unsupported("telegram", "background"),
      banSender: async (senderChatId) => {
        await client().call("banChatSenderChat", {
          chat_id: to,
          sender_chat_id: Number(senderChatId),
        });
      },
      business: createTelegramBusinessOps(
        (method, params) => client().call(method, params),
        to
      ),
      clearReactions: async (opts) => {
        await client().call("deleteAllMessageReactions", {
          actor_chat_id: opts?.actorChatId
            ? Number(opts.actorChatId)
            : undefined,
          chat_id: to,
          user_id: opts?.userId ? Number(opts.userId) : undefined,
        });
      },
      commands: {
        clear: async (opts) => {
          await client().call(
            "deleteMyCommands",
            asTelegramParams(opts ?? {})
          );
        },
        get: async (opts) => {
          const commands = await client().call<
            { command: string; description: string }[]
          >("getMyCommands", asTelegramParams(opts ?? {}));
          return commands.map((command) => ({
            command: command.command,
            description: command.description,
          }));
        },
        set: async (commands, opts) => {
          await client().call("setMyCommands", {
            commands,
            ...asTelegramParams(opts ?? {}),
          });
        },
      },
      contact: async () => null,
      declineJoin: async (userId) => {
        await client().call("declineChatJoinRequest", {
          chat_id: to,
          user_id: Number(userId),
        });
      },
      edit: (messageGuid, update) => editMessage(to, messageGuid, update),
      ephemeral: createTelegramEphemeralOps(
        (method, params) => client().call(method, params),
        to
      ),
      focusStatus: async () => null,
      game: {
        highScores: async (userId, opts) => {
          const target = opts?.inlineMessageId
            ? { inline_message_id: opts.inlineMessageId }
            : {
                chat_id: to,
                ...(opts?.messageGuid
                  ? { message_id: Number(opts.messageGuid) }
                  : {}),
              };
          const rows = await client().call<
            {
              position: number;
              score: number;
              user: { first_name?: string; id: number; username?: string };
            }[]
          >("getGameHighScores", {
            user_id: Number(userId),
            ...target,
          });
          return rows.map(
            (row): GameHighScore => ({
              position: row.position,
              score: row.score,
              user: telegramUser(row.user),
            })
          );
        },
        setScore: async (userId, score, opts) => {
          await client().call("setGameScore", {
            chat_id: to,
            score,
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
        },
      },
      getAttachment: async (guid) => {
        const bytes = await client().downloadFile(guid);
        return attachmentWithDownload(
          { guid, size: bytes.length },
          {
            read: async () => bytes,
            stream: async () =>
              new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                },
              }),
          }
        );
      },
      getDisplayName: async () => {
        try {
          const chat = await client().getChat(to);
          return chat.title ?? null;
        } catch {
          return null;
        }
      },
      getMember: async (userId) => {
        try {
          const member = await client().call<{
            user: { id: number; username?: string; first_name?: string };
          }>("getChatMember", {
            chat_id: to,
            user_id: Number(userId),
          });
          return {
            displayName: member.user.first_name ?? member.user.username,
            handle: member.user.username,
            id: String(member.user.id),
          };
        } catch {
          return null;
        }
      },
      getMessage: async () => null,
      getPersonalMessages: async (userId, opts) => {
        const result = await client().call<{
          messages?: {
            date?: number;
            message_id: number;
            text?: string;
          }[];
        }>("getUserPersonalChatMessages", {
          user_id: Number(userId),
          limit: opts?.limit,
        });
        return {
          messages: (result.messages ?? []).map((msg) => ({
            messageGuid: String(msg.message_id),
            text: msg.text,
            timestamp:
              msg.date != null ? new Date(msg.date * 1000) : undefined,
          })),
        };
      },
      info: async () => {
        const chat = await client().call<TgChatFullInfo>("getChat", {
          chat_id: to,
        });
        return chatInfoFromTelegram(client(), channel, chat);
      },
      group: {
        add: () =>
          host.unsupported(
            "telegram",
            "group.add — use invite.create / invite.export"
          ),
        admins: listAdmins,
        getIcon: async () => null,
        getName: async () => {
          try {
            const chat = await client().getChat(to);
            return chat.title ?? null;
          } catch {
            return null;
          }
        },
        leave: () => sugar.leave(),
        member: async (handle) => {
          const raw = await client().call<TgChatMember>("getChatMember", {
            chat_id: to,
            user_id: Number(handle),
          });
          return chatMemberFromTelegram(raw);
        },
        memberCount: async () =>
          client().call<number>("getChatMemberCount", { chat_id: to }),
        /** Bot API: administrators (full member lists are not available to bots). */
        participants: listAdmins,
        remove: (handle) => sugar.remove(handle),
        setBackground: async () =>
          host.unsupported("telegram", "group.setBackground"),
        setIcon: (input) => sugar.avatar(input as never),
        setName: (name) => sugar.rename(name),
      },
      invite: {
        create: async (opts) =>
          inviteLinkFromTelegram(
            await client().call<TgChatInviteLink>("createChatInviteLink", {
              chat_id: to,
              ...asTelegramParams(opts ?? {}),
            })
          ),
        createSubscription: async (opts) =>
          inviteLinkFromTelegram(
            await client().call<TgChatInviteLink>(
              "createChatSubscriptionInviteLink",
              { chat_id: to, ...asTelegramParams(opts) }
            )
          ),
        edit: async (inviteLink, opts) =>
          inviteLinkFromTelegram(
            await client().call<TgChatInviteLink>("editChatInviteLink", {
              chat_id: to,
              invite_link: inviteLink,
              ...asTelegramParams(opts ?? {}),
            })
          ),
        editSubscription: async (inviteLink, opts) =>
          inviteLinkFromTelegram(
            await client().call<TgChatInviteLink>(
              "editChatSubscriptionInviteLink",
              {
                chat_id: to,
                invite_link: inviteLink,
                ...asTelegramParams(opts ?? {}),
              }
            )
          ),
        export: async () =>
          client().call<string>("exportChatInviteLink", { chat_id: to }),
        revoke: async (inviteLink) =>
          inviteLinkFromTelegram(
            await client().call<TgChatInviteLink>("revokeChatInviteLink", {
              chat_id: to,
              invite_link: inviteLink,
            })
          ),
      },
      invoiceLink: async (input) => {
        const {
          currency,
          description,
          payload,
          prices,
          providerToken,
          title,
          ...rest
        } = input;
        return client().call<string>("createInvoiceLink", {
          currency,
          description,
          payload,
          prices,
          provider_token: providerToken,
          title,
          ...asTelegramParams(rest),
        });
      },
      listMessages: async () => [],
      pin: async (messageGuid, opts) => {
        await client().call("pinChatMessage", {
          chat_id: to,
          disable_notification: opts?.silent,
          message_id: Number(messageGuid),
        });
      },
      platform: "telegram",
      poll: {
        addOption: async () => host.unsupported("telegram", "poll.addOption"),
        get: async (pollMessageGuid) => getCachedPoll(to, pollMessageGuid),
        stop: async (pollMessageGuid) => {
          const poll = await client().call<TelegramPoll>("stopPoll", {
            chat_id: to,
            message_id: Number(pollMessageGuid),
          });
          rememberPollFromTelegram(to, pollMessageGuid, poll);
        },
        unvote: async () =>
          host.unsupported(
            "telegram",
            "poll.unvote — Bot API cannot cast or revoke votes"
          ),
        vote: async () =>
          host.unsupported(
            "telegram",
            "poll.vote — Bot API cannot cast votes; listen on app.on('poll')"
          ),
      },
      posts: createTelegramPostsOps(
        (method, params) => client().call(method, params),
        to
      ),
      profile: {
        avatar: async (input) => {
          if (input === "clear") {
            await client().call("removeMyProfilePhoto");
            return;
          }
          const bytes = await readMediaBytes({
            data: input.data,
            path: input.path,
          });
          await client().upload(
            "setMyProfilePhoto",
            { photo: { photo: "attach://photo", type: "static" } },
            {
              bytes,
              field: "photo",
              filename: "avatar.jpg",
              mimeType: input.mimeType ?? "image/jpeg",
            }
          );
        },
        close: async () => {
          await client().call("close");
        },
        editStarSubscription: async (userId, opts) => {
          await client().call("editUserStarSubscription", {
            user_id: Number(userId),
            ...asTelegramParams(opts),
          });
        },
        getDefaultAdminRights: async (opts) => {
          const rights = await client().call<{
            can_change_info?: boolean;
            can_delete_messages?: boolean;
            can_delete_stories?: boolean;
            can_edit_messages?: boolean;
            can_edit_stories?: boolean;
            can_invite_users?: boolean;
            can_manage_chat?: boolean;
            can_manage_direct_messages?: boolean;
            can_manage_tags?: boolean;
            can_manage_topics?: boolean;
            can_manage_video_chats?: boolean;
            can_pin_messages?: boolean;
            can_post_messages?: boolean;
            can_post_stories?: boolean;
            can_promote_members?: boolean;
            can_restrict_members?: boolean;
            is_anonymous?: boolean;
          }>("getMyDefaultAdministratorRights", {
            for_channels: opts?.forChannels,
          });
          return {
            canChangeInfo: rights.can_change_info,
            canDeleteMessages: rights.can_delete_messages,
            canDeleteStories: rights.can_delete_stories,
            canEditMessages: rights.can_edit_messages,
            canEditStories: rights.can_edit_stories,
            canInviteUsers: rights.can_invite_users,
            canManageChat: rights.can_manage_chat,
            canManageDirectMessages: rights.can_manage_direct_messages,
            canManageTags: rights.can_manage_tags,
            canManageTopics: rights.can_manage_topics,
            canManageVideoChats: rights.can_manage_video_chats,
            canPinMessages: rights.can_pin_messages,
            canPostMessages: rights.can_post_messages,
            canPostStories: rights.can_post_stories,
            canPromoteMembers: rights.can_promote_members,
            canRestrictMembers: rights.can_restrict_members,
            isAnonymous: rights.is_anonymous,
          };
        },
        getDescription: async (opts) => {
          const res = await client().call<{ description: string }>(
            "getMyDescription",
            asTelegramParams(opts ?? {})
          );
          return { description: res.description };
        },
        getMenuButton: async (opts) => {
          const button = await client().call<{
            text?: string;
            type: "commands" | "web_app" | "default";
            web_app?: { url: string };
          }>("getChatMenuButton", {
            chat_id: opts?.chatId,
          });
          return {
            text: button.text,
            type: button.type,
            webApp: button.web_app,
          };
        },
        getName: async (opts) => {
          const res = await client().call<{ name: string }>(
            "getMyName",
            asTelegramParams(opts ?? {})
          );
          return { name: res.name };
        },
        getShortDescription: async (opts) => {
          const res = await client().call<{ short_description: string }>(
            "getMyShortDescription",
            asTelegramParams(opts ?? {})
          );
          return { shortDescription: res.short_description };
        },
        getUserAudios: async (userId, opts) => {
          const result = await client().call<{
            audios?: {
              duration?: number;
              file_id: string;
              file_size?: number;
              mime_type?: string;
              title?: string;
            }[];
          }>("getUserProfileAudios", {
            limit: opts?.limit,
            offset: opts?.offset,
            user_id: Number(userId),
          });
          return (result.audios ?? []).map((audio) => ({
            duration: audio.duration,
            fileId: audio.file_id,
            fileSize: audio.file_size,
            mimeType: audio.mime_type,
            title: audio.title,
          }));
        },
        getUserBoosts: async (userId) => {
          const result = await client().call<{
            boosts?: {
              add_date?: number;
              boost_id: string;
              expiration_date?: number;
              source?: { user?: { id: number } };
            }[];
          }>("getUserChatBoosts", {
            chat_id: to,
            user_id: Number(userId),
          });
          return {
            boosts: (result.boosts ?? []).map((boost) => ({
              addDate: boost.add_date,
              boostId: boost.boost_id,
              expirationDate: boost.expiration_date,
              userId:
                boost.source?.user != null
                  ? String(boost.source.user.id)
                  : undefined,
            })),
          };
        },
        getUserPhotos: async (userId, opts) => {
          const photos = await client().call<{
            photos: {
              file_id: string;
              file_size?: number;
              height?: number;
              width?: number;
            }[][];
            total_count: number;
          }>("getUserProfilePhotos", {
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
          return {
            photos: photos.photos.map((row) =>
              row.map((p) => ({
                fileId: p.file_id,
                fileSize: p.file_size,
                height: p.height,
                width: p.width,
              }))
            ),
            totalCount: photos.total_count,
          };
        },
        logOut: async () => {
          await client().call("logOut");
        },
        me: async () => {
          const me = await client().call<{
            added_to_attachment_menu?: boolean;
            allows_users_to_create_topics?: boolean;
            can_connect_to_business?: boolean;
            can_join_groups?: boolean;
            can_manage_bots?: boolean;
            can_read_all_group_messages?: boolean;
            first_name: string;
            has_main_web_app?: boolean;
            has_topics_enabled?: boolean;
            id: number;
            is_bot: boolean;
            is_premium?: boolean;
            language_code?: string;
            last_name?: string;
            supports_guest_queries?: boolean;
            supports_inline_queries?: boolean;
            supports_join_request_queries?: boolean;
            username?: string;
          }>("getMe");
          return {
            addedToAttachmentMenu: me.added_to_attachment_menu,
            allowsUsersToCreateTopics: me.allows_users_to_create_topics,
            canConnectToBusiness: me.can_connect_to_business,
            canJoinGroups: me.can_join_groups,
            canManageBots: me.can_manage_bots,
            canReadAllGroupMessages: me.can_read_all_group_messages,
            firstName: me.first_name,
            hasMainWebApp: me.has_main_web_app,
            hasTopicsEnabled: me.has_topics_enabled,
            id: String(me.id),
            isBot: me.is_bot,
            isPremium: me.is_premium,
            languageCode: me.language_code,
            lastName: me.last_name,
            supportsGuestQueries: me.supports_guest_queries,
            supportsInlineQueries: me.supports_inline_queries,
            supportsJoinRequestQueries: me.supports_join_request_queries,
            username: me.username,
          };
        },
        setDefaultAdminRights: async (opts) => {
          await client().call("setMyDefaultAdministratorRights", {
            for_channels: opts?.forChannels,
            rights: opts?.rights
              ? asTelegramParams(opts.rights)
              : undefined,
          });
        },
        setDescription: async (description, opts) => {
          await client().call("setMyDescription", {
            description,
            ...asTelegramParams(opts ?? {}),
          });
        },
        setEmojiStatus: async (userId, opts) => {
          await client().call("setUserEmojiStatus", {
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
        },
        setMenuButton: async (opts) => {
          await client().call(
            "setChatMenuButton",
            asTelegramParams(opts ?? {})
          );
        },
        setName: async (name, opts) => {
          await client().call("setMyName", {
            name,
            ...asTelegramParams(opts ?? {}),
          });
        },
        setPassportErrors: async (userId, errors) => {
          await client().call("setPassportDataErrors", {
            errors: errors.map((e) => asTelegramParams(e)),
            user_id: Number(userId),
          });
        },
        setShortDescription: async (shortDescription, opts) => {
          await client().call("setMyShortDescription", {
            short_description: shortDescription,
            ...asTelegramParams(opts ?? {}),
          });
        },
        starBalance: async () => {
          const balance = await client().call<{
            amount: number;
            nanostar_amount?: number;
          }>("getMyStarBalance");
          return {
            amount: balance.amount,
            nanostarAmount: balance.nanostar_amount,
          };
        },
        starTransactions: async (opts) => {
          const result = await client().call<{
            transactions?: {
              amount: number;
              date: number;
              id: string;
              nanostar_amount?: number;
              receiver?: TgTransactionPartner;
              source?: TgTransactionPartner;
            }[];
          }>("getStarTransactions", {
            limit: opts?.limit,
            offset: opts?.offset,
          });
          return {
            transactions: (result.transactions ?? []).map((tx) => ({
              amount: tx.amount,
              date: tx.date,
              id: tx.id,
              nanostarAmount: tx.nanostar_amount,
              receiver: transactionPartnerFromTelegram(tx.receiver),
              source: transactionPartnerFromTelegram(tx.source),
            })),
          };
        },
      },
      promote: async (userId, rights) => {
        await client().call("promoteChatMember", {
          chat_id: to,
          user_id: Number(userId),
          ...asTelegramParams(rights ?? {}),
        });
      },
      reachable: async () => true,
      react: async (messageGuid, reaction: Reaction, reactOpts) => {
        if (reactOpts?.remove) {
          await client().setMessageReaction(to, messageGuid, null);
          return;
        }
        const emoji = normalizeReactionEmoji(reaction);
        if (!isAllowedReactionEmoji(emoji)) {
          host.unsupported("telegram", `reaction emoji "${reaction}"`);
        }
        await client().setMessageReaction(to, messageGuid, emoji, {
          isBig: reactOpts?.big,
        });
      },
      messageStatus: async () => null,
      read: async () => {},
      readReceipt: async () => {},
      refundPayment: async (opts) => {
        await client().call("refundStarPayment", {
          telegram_payment_charge_id: opts.chargeId,
          user_id: Number(opts.userId),
        });
      },
      removeReaction: async (messageGuid, opts) => {
        await client().call("deleteMessageReaction", {
          chat_id: to,
          message_id: Number(messageGuid),
          ...asTelegramParams(opts ?? {}),
        });
      },
      responding: (fn) => withResponding(channel, fn),
      restrict: async (userId, opts) => {
        await client().call("restrictChatMember", {
          chat_id: to,
          permissions: asTelegramParams(opts.permissions),
          until_date: opts.untilDate,
          use_independent_chat_permissions:
            opts.useIndependentChatPermissions,
          user_id: Number(userId),
        });
      },
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async (file: AttachmentSend, sendOpts) =>
        send(
          {
            data:
              file.data instanceof ArrayBuffer
                ? new Uint8Array(file.data)
                : file.data,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
            mimeType: file.mimeType,
            name: file.name,
            path: file.path,
            type: "attachment",
            url: file.url,
          },
          sendOpts
        ),
      sendFiles: async (files, sendOpts) => {
        if (files.length === 0) {
          throw new Error("sendFiles: needs at least one file");
        }
        if (files.length === 1) {
          return channel.sendFile(files[0]!, sendOpts);
        }
        if (files.length > 10) {
          throw new Error("sendFiles: Telegram albums support 2–10 items");
        }
        return send(
          {
            items: files.map((file) => ({
              data:
                file.data instanceof ArrayBuffer
                  ? new Uint8Array(file.data)
                  : file.data,
              mimeType: file.mimeType,
              name: file.name,
              path: file.path,
              url: file.url,
            })),
            type: "media_album",
          },
          sendOpts
        );
      },
      setAdminTitle: async (userId, customTitle) => {
        await client().call("setChatAdministratorCustomTitle", {
          chat_id: to,
          custom_title: customTitle,
          user_id: Number(userId),
        });
      },
      setDescription: async (description) => {
        await client().call("setChatDescription", {
          chat_id: to,
          description,
        });
      },
      setMemberTag: async (userId, tag, opts) => {
        await client().call("setChatMemberTag", {
          chat_id: to,
          tag,
          user_id: Number(userId),
          ...asTelegramParams(opts ?? {}),
        });
      },
      setPermissions: async (opts) => {
        const permissions =
          "permissions" in opts && opts.permissions
            ? opts.permissions
            : opts;
        const useIndependent =
          "useIndependentChatPermissions" in opts
            ? opts.useIndependentChatPermissions
            : undefined;
        await client().call("setChatPermissions", {
          chat_id: to,
          permissions: asTelegramParams(permissions),
          use_independent_chat_permissions: useIndependent,
        });
      },
      shareContactCard: async () =>
        host.unsupported(
          "telegram",
          "shareContactCard — use contact() / contactCard()"
        ),
      stickers: createTelegramStickerOps(
        (method, params) => client().call(method, params),
        to,
        (method, params, file) => client().upload(method, params, file)
      ),
      stories: createTelegramStoryOps(
        (method, params) => client().call(method, params),
        (method, params, file) => client().upload(method, params, file),
        to
      ),
      shareLocation: async (opts) => {
        if (opts?.latitude == null || opts?.longitude == null) {
          host.unsupported(
            "telegram",
            "shareLocation without latitude/longitude"
          );
        }
        await send({
          address: opts!.address,
          latitude: opts!.latitude!,
          livePeriod: opts!.livePeriod ?? opts!.durationSeconds,
          longitude: opts!.longitude!,
          title: opts!.title,
          type: "location",
        });
      },
      stopLocation: async (messageGuid) => {
        if (!messageGuid) {
          host.unsupported(
            "telegram",
            "stopLocation without a messageGuid (pass the live-location message's guid)"
          );
        }
        await client().call("stopMessageLiveLocation", {
          chat_id: to,
          message_id: Number(messageGuid),
        });
      },
      updateLocation: async (messageGuid, opts) => {
        await client().call("editMessageLiveLocation", {
          chat_id: to,
          heading: opts.heading,
          horizontal_accuracy: opts.horizontalAccuracy,
          latitude: opts.latitude,
          live_period: opts.livePeriod,
          longitude: opts.longitude,
          message_id: Number(messageGuid),
          proximity_alert_radius: opts.proximityAlertRadius,
        });
      },
      to,
      topic: {
        close: async (threadId) => {
          await client().call("closeForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        closeGeneral: async () => {
          await client().call("closeGeneralForumTopic", { chat_id: to });
        },
        create: async (name, opts) => {
          const topic = await client().call<{ message_thread_id: number }>(
            "createForumTopic",
            {
              chat_id: to,
              name,
              ...asTelegramParams(opts ?? {}),
            }
          );
          return { threadId: String(topic.message_thread_id) };
        },
        delete: async (threadId) => {
          await client().call("deleteForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        edit: async (threadId, opts) => {
          await client().call("editForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
            ...asTelegramParams(opts ?? {}),
          });
        },
        editGeneral: async (name) => {
          await client().call("editGeneralForumTopic", {
            chat_id: to,
            name,
          });
        },
        hideGeneral: async () => {
          await client().call("hideGeneralForumTopic", { chat_id: to });
        },
        iconStickers: async () => {
          const stickers = await client().call<
            {
              custom_emoji_id?: string;
              emoji?: string;
              file_id: string;
            }[]
          >("getForumTopicIconStickers");
          return stickers.map((sticker) => ({
            customEmojiId: sticker.custom_emoji_id,
            emoji: sticker.emoji,
            fileId: sticker.file_id,
          }));
        },
        reopen: async (threadId) => {
          await client().call("reopenForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        reopenGeneral: async () => {
          await client().call("reopenGeneralForumTopic", { chat_id: to });
        },
        unhideGeneral: async () => {
          await client().call("unhideGeneralForumTopic", { chat_id: to });
        },
        unpinAll: async (threadId) => {
          if (threadId != null) {
            await client().call("unpinAllForumTopicMessages", {
              chat_id: to,
              message_thread_id: Number(threadId),
            });
            return;
          }
          await client().call("unpinAllGeneralForumTopicMessages", {
            chat_id: to,
          });
        },
      },
      typing: async (onOrAction = true) => {
        if (onOrAction === false) {
          return;
        }
        const action = typeof onOrAction === "string" ? onOrAction : "typing";
        await client().sendChatAction(to, action);
      },
      webApp: createTelegramWebAppOps((method, params) =>
        client().call(method, params)
      ),
      unban: async (userId, opts) => {
        await client().call("unbanChatMember", {
          chat_id: to,
          only_if_banned: opts?.onlyIfBanned,
          user_id: Number(userId),
        });
      },
      unbanSender: async (senderChatId) => {
        await client().call("unbanChatSenderChat", {
          chat_id: to,
          sender_chat_id: Number(senderChatId),
        });
      },
      unpin: async (messageGuid) => {
        if (messageGuid) {
          await client().call("unpinChatMessage", {
            chat_id: to,
            message_id: Number(messageGuid),
          });
          return;
        }
        await client().call("unpinAllChatMessages", { chat_id: to });
      },
      unsend: async (messageGuid) => {
        await client().deleteMessage(to, messageGuid);
      },
      unsendMany: async (messageGuids) => {
        await client().call("deleteMessages", {
          chat_id: to,
          message_ids: messageGuids.map(Number),
        });
      },
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.telegram) {
      return;
    }
    const botToken = line.telegram.botToken;
    const botId = botIdFromToken(botToken);
    const key = line.phone || botId;
    const client = new TelegramClient({
      baseUrl: line.telegram.baseUrl,
      botToken,
    });
    const includeRaw = Boolean(line.telegram?.includeRaw);
    const onUpdate = (update: Parameters<typeof dispatchTelegramUpdate>[5]) => {
      dispatchTelegramUpdate(
        host,
        makeChannel,
        client,
        botId,
        key,
        update,
        includeRaw
      );
    };

    const webhookUrl = line.telegram.webhookUrl;
    const webhookSecret = line.telegram.webhookSecret;
    if (webhookUrl) {
      void ensureTelegramWebhook(client, webhookUrl, {
        certificate: line.telegram.webhookCertificate,
        ipAddress: line.telegram.webhookIpAddress,
        maxConnections: line.telegram.webhookMaxConnections,
        secretToken: webhookSecret,
      });
      webhookHandlers.set(
        botId,
        createTelegramWebhookHandler({
          onUpdate,
          secretToken: webhookSecret,
        })
      );
      host.live.set(key, {
        includeRaw,
        platform: "telegram",
        streams: [],
        telegram: client,
      });
      host.ready.add(key);
      return;
    }

    const poll = startTelegramPolling(client, { onUpdate });
    host.live.set(key, {
      includeRaw,
      platform: "telegram",
      streams: [poll],
      telegram: client,
    });
    host.ready.add(key);
  };

  return {
    platform: "telegram" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      telegramDedicatedLines(config as TelegramDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: TelegramConfig): void {
  host.register(createBinder(host));
}

type TelegramOwnedGift = {
  can_be_transferred?: boolean;
  can_be_upgraded?: boolean;
  convert_star_count?: number;
  entities?: TelegramMessageEntity[];
  gift?: { id?: string | number; star_count?: number };
  is_private?: boolean;
  is_saved?: boolean;
  is_upgrade_separate?: boolean;
  next_transfer_date?: number;
  owned_gift_id?: string;
  prepaid_upgrade_star_count?: number;
  send_date?: number;
  sender_user?: { id: number };
  text?: string;
  transfer_star_count?: number;
  type?: string;
  unique_gift_number?: number;
  was_refunded?: boolean;
};

function ownedGiftFromTelegram(gift: TelegramOwnedGift): OwnedGift {
  return {
    canBeTransferred: gift.can_be_transferred,
    canBeUpgraded: gift.can_be_upgraded,
    convertStarCount: gift.convert_star_count,
    entities: entitiesFromTelegram(gift.entities),
    giftId: String(gift.gift?.id ?? ""),
    isPrivate: gift.is_private,
    isSaved: gift.is_saved,
    isUpgradeSeparate: gift.is_upgrade_separate,
    nextTransferDate: gift.next_transfer_date,
    ownedGiftId: gift.owned_gift_id,
    prepaidUpgradeStarCount: gift.prepaid_upgrade_star_count,
    sendDate: gift.send_date,
    senderUserId:
      gift.sender_user != null ? String(gift.sender_user.id) : undefined,
    starCount: gift.gift?.star_count,
    text: gift.text,
    transferStarCount: gift.transfer_star_count,
    type: gift.type,
    uniqueGiftNumber: gift.unique_gift_number,
    wasRefunded: gift.was_refunded,
  };
}

function giftsPageFromTelegram(result: {
  gifts?: TelegramOwnedGift[];
  next_offset?: string;
  total_count?: number;
}): GiftsPage {
  return {
    gifts: (result.gifts ?? []).map(ownedGiftFromTelegram),
    nextOffset: result.next_offset,
    totalCount: result.total_count,
  };
}

type Call = TelegramClient["call"];

type TelegramSticker = {
  custom_emoji_id?: string;
  emoji?: string;
  file_id: string;
  file_size?: number;
  file_unique_id?: string;
  height?: number;
  is_animated?: boolean;
  is_video?: boolean;
  mask_position?: {
    point: "forehead" | "eyes" | "mouth" | "chin";
    scale: number;
    x_shift: number;
    y_shift: number;
  };
  needs_repainting?: boolean;
  premium_animation?: { file_id: string; file_unique_id?: string };
  set_name?: string;
  thumbnail?: {
    file_id: string;
    file_size?: number;
    file_unique_id?: string;
    height?: number;
    width?: number;
  };
  type?: "regular" | "mask" | "custom_emoji";
  width?: number;
};

function stickerInfo(sticker: TelegramSticker): StickerInfo {
  return {
    customEmojiId: sticker.custom_emoji_id,
    emoji: sticker.emoji,
    fileId: sticker.file_id,
    fileSize: sticker.file_size,
    fileUniqueId: sticker.file_unique_id,
    height: sticker.height,
    isAnimated: sticker.is_animated,
    isVideo: sticker.is_video,
    maskPosition: sticker.mask_position
      ? {
          point: sticker.mask_position.point,
          scale: sticker.mask_position.scale,
          xShift: sticker.mask_position.x_shift,
          yShift: sticker.mask_position.y_shift,
        }
      : undefined,
    needsRepainting: sticker.needs_repainting,
    premiumAnimation: sticker.premium_animation
      ? {
          fileId: sticker.premium_animation.file_id,
          fileUniqueId: sticker.premium_animation.file_unique_id,
        }
      : undefined,
    setName: sticker.set_name,
    thumbnail: sticker.thumbnail
      ? {
          fileId: sticker.thumbnail.file_id,
          fileSize: sticker.thumbnail.file_size,
          fileUniqueId: sticker.thumbnail.file_unique_id,
          height: sticker.thumbnail.height,
          width: sticker.thumbnail.width,
        }
      : undefined,
    type: sticker.type,
    width: sticker.width,
  };
}

function storyRef(result: {
  chat?: { id: number };
  id?: number;
  story_id?: number;
}): StoryRef {
  const storyId = result.story_id ?? result.id;
  return {
    chatId: result.chat != null ? String(result.chat.id) : undefined,
    storyId: storyId != null ? String(storyId) : "",
  };
}

export function createTelegramStickerOps(
  call: Call,
  chatId: string,
  upload: TelegramClient["upload"]
): StickerOps {
  return {
    addToSet: async (input) => {
      await call("addStickerToSet", asTelegramParams(input));
    },
    clearChatSet: async () => {
      await call("deleteChatStickerSet", { chat_id: chatId });
    },
    createSet: async (input) => {
      await call("createNewStickerSet", asTelegramParams(input));
    },
    deleteFromSet: async (sticker) => {
      await call("deleteStickerFromSet", { sticker });
    },
    deleteSet: async (name) => {
      await call("deleteStickerSet", { name });
    },
    getCustomEmoji: async (customEmojiIds) => {
      const stickers = await call<TelegramSticker[]>(
        "getCustomEmojiStickers",
        { custom_emoji_ids: customEmojiIds }
      );
      return stickers.map(stickerInfo);
    },
    getSet: async (name) => {
      const set = await call<{
        is_animated?: boolean;
        is_video?: boolean;
        name: string;
        sticker_type?: string;
        stickers: TelegramSticker[];
        title: string;
      }>("getStickerSet", { name });
      const mapped: StickerSet = {
        isAnimated: set.is_animated,
        isVideo: set.is_video,
        name: set.name,
        stickerType: set.sticker_type,
        stickers: set.stickers.map(stickerInfo),
        title: set.title,
      };
      return mapped;
    },
    replaceInSet: async (input) => {
      await call("replaceStickerInSet", asTelegramParams(input));
    },
    setChatSet: async (name) => {
      await call("setChatStickerSet", {
        chat_id: chatId,
        sticker_set_name: name,
      });
    },
    setCustomEmojiSetThumbnail: async (input) => {
      await call(
        "setCustomEmojiStickerSetThumbnail",
        asTelegramParams(input)
      );
    },
    setEmojiList: async (sticker, emojiList) => {
      await call("setStickerEmojiList", {
        emoji_list: emojiList,
        sticker,
      });
    },
    setKeywords: async (sticker, keywords) => {
      await call("setStickerKeywords", { keywords, sticker });
    },
    setMaskPosition: async (sticker, maskPosition) => {
      await call("setStickerMaskPosition", {
        mask_position: asTelegramParams(maskPosition),
        sticker,
      });
    },
    setPosition: async (sticker, position) => {
      await call("setStickerPositionInSet", { position, sticker });
    },
    setSetThumbnail: async (input) => {
      await call("setStickerSetThumbnail", asTelegramParams(input));
    },
    setSetTitle: async (name, title) => {
      await call("setStickerSetTitle", { name, title });
    },
    uploadFile: async (input) => {
      const bytes = await readMediaBytes({
        data: input.data,
        path: input.path,
        url: input.url,
      });
      const file = await upload<{ file_id: string }>(
        "uploadStickerFile",
        { sticker_format: input.stickerFormat, user_id: input.userId },
        {
          bytes,
          field: "sticker",
          filename: input.name ?? "sticker.webp",
          mimeType: input.mimeType ?? "image/webp",
        }
      );
      return { fileId: file.file_id };
    },
  };
}

async function storyContentToUpload(content: StoryContent): Promise<{
  file: { bytes: Uint8Array; field: string; filename: string; mimeType?: string };
  json: Record<string, unknown>;
}> {
  const field = "story_media";
  if (content.type === "photo") {
    const bytes = await readMediaBytes({
      data: content.photo.data,
      path: content.photo.path,
      url: content.photo.url,
    });
    return {
      file: {
        bytes,
        field,
        filename: "story.jpg",
        mimeType: content.photo.mimeType ?? "image/jpeg",
      },
      json: { photo: `attach://${field}`, type: "photo" },
    };
  }
  const bytes = await readMediaBytes({
    data: content.video.data,
    path: content.video.path,
    url: content.video.url,
  });
  return {
    file: {
      bytes,
      field,
      filename: "story.mp4",
      mimeType: content.video.mimeType ?? "video/mp4",
    },
    json: {
      cover_frame_timestamp: content.coverFrameTimestamp,
      duration: content.duration,
      is_animation: content.isAnimation,
      type: "video",
      video: `attach://${field}`,
    },
  };
}

export function createTelegramStoryOps(
  call: Call,
  upload: TelegramClient["upload"],
  chatId: string
): StoryOps {
  return {
    delete: async (storyId, opts) => {
      await call("deleteStory", {
        business_connection_id: opts?.businessConnectionId,
        chat_id: chatId,
        story_id: Number(storyId),
      });
    },
    edit: async (storyId, input) => {
      const { content, ...rest } = input;
      if (!content) {
        await call("editStory", {
          chat_id: chatId,
          story_id: Number(storyId),
          ...asTelegramParams(rest),
        });
        return;
      }
      const { file, json } = await storyContentToUpload(content);
      await upload(
        "editStory",
        {
          chat_id: chatId,
          content: json,
          story_id: Number(storyId),
          ...asTelegramParams(rest),
        },
        file
      );
    },
    post: async (input) => {
      const { content, ...rest } = input;
      const { file, json } = await storyContentToUpload(content);
      return storyRef(
        await upload<{ chat?: { id: number }; id?: number; story_id?: number }>(
          "postStory",
          { chat_id: chatId, content: json, ...asTelegramParams(rest) },
          file
        )
      );
    },
    repost: async (input) =>
      storyRef(
        await call("repostStory", {
          chat_id: chatId,
          ...asTelegramParams(input),
        })
      ),
  };
}

export function createTelegramBusinessOps(
  call: Call,
  chatId: string
): BusinessOps {
  return {
    availableGifts: async () => {
      const result = await call<{
        gifts?: {
          background?: {
            center_color: number;
            edge_color: number;
            text_color: number;
          };
          has_colors?: boolean;
          id: string | number;
          is_premium?: boolean;
          personal_remaining_count?: number;
          personal_total_count?: number;
          publisher_chat?: { id: number };
          remaining_count?: number;
          star_count?: number;
          sticker?: TelegramSticker;
          total_count?: number;
          unique_gift_variant_count?: number;
          upgrade_star_count?: number;
        }[];
      }>("getAvailableGifts");
      return {
        gifts: (result.gifts ?? []).map((gift) => ({
          background: gift.background
            ? {
                centerColor: gift.background.center_color,
                edgeColor: gift.background.edge_color,
                textColor: gift.background.text_color,
              }
            : undefined,
          hasColors: gift.has_colors,
          id: String(gift.id),
          isPremium: gift.is_premium,
          personalRemainingCount: gift.personal_remaining_count,
          personalTotalCount: gift.personal_total_count,
          publisherChatId:
            gift.publisher_chat != null
              ? String(gift.publisher_chat.id)
              : undefined,
          remainingCount: gift.remaining_count,
          starCount: gift.star_count,
          sticker: gift.sticker ? stickerInfo(gift.sticker) : undefined,
          totalCount: gift.total_count,
          uniqueGiftVariantCount: gift.unique_gift_variant_count,
          upgradeStarCount: gift.upgrade_star_count,
        })),
      };
    },
    chatGifts: async (opts) =>
      giftsPageFromTelegram(
        await call("getChatGifts", {
          chat_id: chatId,
          ...asTelegramParams(opts ?? {}),
        })
      ),
    connection: async (businessConnectionId) => {
      const conn = await call<{
        can_reply?: boolean;
        date?: number;
        id: string;
        is_enabled?: boolean;
        user?: { id: number };
      }>("getBusinessConnection", {
        business_connection_id: businessConnectionId,
      });
      const mapped: BusinessConnectionInfo = {
        canReply: conn.can_reply,
        date: conn.date,
        id: conn.id,
        isEnabled: conn.is_enabled,
        userId: conn.user != null ? String(conn.user.id) : undefined,
      };
      return mapped;
    },
    convertGiftToStars: async (input) => {
      await call("convertGiftToStars", asTelegramParams(input));
    },
    deleteMessages: async (messageIds, opts) => {
      await call("deleteBusinessMessages", {
        business_connection_id: opts.businessConnectionId,
        message_ids: messageIds.map(Number),
      });
    },
    giftPremium: async (input) => {
      await call("giftPremiumSubscription", asTelegramParams(input));
    },
    gifts: async (opts) =>
      giftsPageFromTelegram(
        await call("getBusinessAccountGifts", asTelegramParams(opts))
      ),
    managedAccessSettings: async (userId) => {
      const settings = await call<{
        added_users?: {
          first_name?: string;
          id: number;
          language_code?: string;
          username?: string;
        }[];
        is_access_restricted: boolean;
      }>("getManagedBotAccessSettings", { user_id: Number(userId) });
      return {
        addedUsers: (settings.added_users ?? []).map((user) => ({
          displayName: user.first_name ?? user.username,
          handle: user.username,
          id: String(user.id),
          languageCode: user.language_code,
        })),
        isAccessRestricted: settings.is_access_restricted,
      };
    },
    managedToken: async (userId) => {
      const result = await call<string | { token?: string }>(
        "getManagedBotToken",
        { user_id: Number(userId) }
      );
      if (typeof result === "string") {
        return { token: result };
      }
      return { token: result.token ?? "" };
    },
    readMessage: async (messageId, opts) => {
      await call("readBusinessMessage", {
        business_connection_id: opts.businessConnectionId,
        message_id: Number(messageId),
      });
    },
    removeChatVerification: async (opts) => {
      await call("removeChatVerification", asTelegramParams(opts ?? {}));
    },
    removeProfilePhoto: async (opts) => {
      await call(
        "removeBusinessAccountProfilePhoto",
        asTelegramParams(opts)
      );
    },
    removeUserVerification: async (userId) => {
      await call("removeUserVerification", { user_id: Number(userId) });
    },
    replaceManagedToken: async (userId) => {
      const result = await call<string | { token?: string }>(
        "replaceManagedBotToken",
        { user_id: Number(userId) }
      );
      if (typeof result === "string") {
        return { token: result };
      }
      return { token: result.token ?? "" };
    },
    setBio: async (bio, opts) => {
      await call("setBusinessAccountBio", {
        bio,
        business_connection_id: opts.businessConnectionId,
      });
    },
    setGiftSettings: async (input) => {
      await call("setBusinessAccountGiftSettings", asTelegramParams(input));
    },
    setManagedAccessSettings: async (input) => {
      await call("setManagedBotAccessSettings", {
        added_user_ids: input.addedUserIds?.map(Number),
        is_access_restricted: input.isAccessRestricted,
        user_id: Number(input.userId),
      });
    },
    setName: async (input) => {
      await call("setBusinessAccountName", asTelegramParams(input));
    },
    setProfilePhoto: async (input) => {
      await call("setBusinessAccountProfilePhoto", asTelegramParams(input));
    },
    setUsername: async (username, opts) => {
      await call("setBusinessAccountUsername", {
        business_connection_id: opts.businessConnectionId,
        username,
      });
    },
    starBalance: async (opts) => {
      const balance = await call<{
        amount: number;
        nanostar_amount?: number;
      }>("getBusinessAccountStarBalance", asTelegramParams(opts));
      return {
        amount: balance.amount,
        nanostarAmount: balance.nanostar_amount,
      };
    },
    transferGift: async (input) => {
      await call("transferGift", asTelegramParams(input));
    },
    transferStars: async (input) => {
      await call("transferBusinessAccountStars", asTelegramParams(input));
    },
    upgradeGift: async (input) => {
      await call("upgradeGift", asTelegramParams(input));
    },
    userGifts: async (userId, opts) =>
      giftsPageFromTelegram(
        await call("getUserGifts", {
          user_id: Number(userId),
          ...asTelegramParams(opts ?? {}),
        })
      ),
    verifyChat: async (opts) => {
      await call("verifyChat", asTelegramParams(opts ?? {}));
    },
    verifyUser: async (userId, opts) => {
      await call("verifyUser", {
        user_id: Number(userId),
        ...asTelegramParams(opts ?? {}),
      });
    },
  };
}

export function createTelegramWebAppOps(call: Call): WebAppOps {
  return {
    answerGuest: async (queryId, result) => {
      const res = await call<{ inline_message_id: string }>(
        "answerGuestQuery",
        {
          guest_query_id: queryId,
          result: inlineQueryResultToTelegram(result),
        }
      );
      return { inlineMessageId: res.inline_message_id };
    },
    answerJoinRequest: async (queryId, result) => {
      await call("answerChatJoinRequestQuery", {
        chat_join_request_query_id: queryId,
        result,
      });
    },
    savePreparedInline: async (input) => {
      const result = await call<{
        expiration_date?: number;
        id: string;
      }>("savePreparedInlineMessage", {
        allow_bot_chats: input.allowBotChats,
        allow_channel_chats: input.allowChannelChats,
        allow_group_chats: input.allowGroupChats,
        allow_user_chats: input.allowUserChats,
        result: inlineQueryResultToTelegram(input.result),
        user_id: Number(input.userId),
      });
      const mapped: PreparedInlineResult = {
        expirationDate: result.expiration_date,
        id: result.id,
      };
      return mapped;
    },
    savePreparedKeyboard: async (input) => {
      const result = await call<{
        expiration_date?: number;
        id: string;
      }>("savePreparedKeyboardButton", {
        button: asTelegramParams(input.button),
        user_id: Number(input.userId),
      });
      const mapped: PreparedKeyboardResult = {
        expirationDate: result.expiration_date,
        id: result.id,
      };
      return mapped;
    },
    sendJoinRequest: async (input) => {
      await call("sendChatJoinRequestWebApp", {
        chat_join_request_query_id: input.queryId,
        web_app_url: input.webAppUrl,
      });
    },
  };
}

export function createTelegramEphemeralOps(
  call: Call,
  chatId: string
): EphemeralOps {
  return {
    delete: async (receiverUserId, ephemeralMessageId) => {
      await call("deleteEphemeralMessage", {
        chat_id: chatId,
        ephemeral_message_id: Number(ephemeralMessageId),
        receiver_user_id: Number(receiverUserId),
      });
    },
    editCaption: async (receiverUserId, ephemeralMessageId, caption, opts) => {
      await call("editEphemeralMessageCaption", {
        caption,
        chat_id: chatId,
        ephemeral_message_id: Number(ephemeralMessageId),
        receiver_user_id: Number(receiverUserId),
        ...asTelegramParams(opts ?? {}),
      });
    },
    editMarkup: async (receiverUserId, ephemeralMessageId, markup) => {
      await call("editEphemeralMessageReplyMarkup", {
        chat_id: chatId,
        ephemeral_message_id: Number(ephemeralMessageId),
        receiver_user_id: Number(receiverUserId),
        reply_markup: replyMarkupToTelegram(markup),
      });
    },
    editMedia: async (receiverUserId, ephemeralMessageId, media, opts) => {
      await call("editEphemeralMessageMedia", {
        chat_id: chatId,
        ephemeral_message_id: Number(ephemeralMessageId),
        media: {
          media: media.fileId ?? media.url,
          type: media.type,
        },
        receiver_user_id: Number(receiverUserId),
        ...(opts?.replyMarkup
          ? { reply_markup: replyMarkupToTelegram(opts.replyMarkup) }
          : {}),
      });
    },
    editText: async (receiverUserId, ephemeralMessageId, text, opts) => {
      await call("editEphemeralMessageText", {
        chat_id: chatId,
        entities: opts?.entities?.map((entity) => asTelegramParams(entity)),
        ephemeral_message_id: Number(ephemeralMessageId),
        link_preview_options: linkPreviewToTelegram(opts?.linkPreview),
        parse_mode: opts?.parseMode,
        receiver_user_id: Number(receiverUserId),
        reply_markup: opts?.replyMarkup
          ? replyMarkupToTelegram(opts.replyMarkup)
          : undefined,
        text,
      });
    },
    sendDraft: async (draftId, text, opts) => {
      await call("sendMessageDraft", {
        chat_id: Number(chatId),
        draft_id: draftId,
        entities: opts?.entities?.map((entity) => asTelegramParams(entity)),
        message_thread_id:
          opts?.threadId != null ? Number(opts.threadId) : undefined,
        parse_mode: opts?.parseMode,
        text,
      });
    },
    sendRichDraft: async (draftId, richMessage, opts) => {
      await call("sendRichMessageDraft", {
        chat_id: Number(chatId),
        draft_id: draftId,
        message_thread_id:
          opts?.threadId != null ? Number(opts.threadId) : undefined,
        rich_message: {
          html: richMessage.html,
          is_rtl: richMessage.isRtl,
          markdown: richMessage.markdown,
          skip_entity_detection: richMessage.skipEntityDetection,
        },
      });
    },
  };
}

export function createTelegramPostsOps(
  call: Call,
  chatId: string
): PostsOps {
  return {
    approve: async (messageGuid, opts) => {
      await call("approveSuggestedPost", {
        chat_id: chatId,
        message_id: Number(messageGuid),
        ...asTelegramParams(opts ?? {}),
      });
    },
    decline: async (messageGuid, opts) => {
      await call("declineSuggestedPost", {
        chat_id: chatId,
        message_id: Number(messageGuid),
        ...asTelegramParams(opts ?? {}),
      });
    },
  };
}
