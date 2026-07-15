/**
 * Ideal Skyline developer experience for every Telegram Bot API method.
 * Product code should use `surface`; rare Bot API ops use `custom({ method, params })`.
 */

export type TelegramDxTier =
  | "unified-content"
  | "unified-channel"
  | "unified-signal"
  | "webhook"
  | "bot-profile"
  | "escape";

export interface TelegramApiDx {
  method: string;
  note: string;
  surface: string;
  tier: TelegramDxTier;
}

export const TELEGRAM_API_DX: TelegramApiDx[] = [
  {
    "method": "addStickerToSet",
    "surface": "channel.stickers.addToSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "answerCallbackQuery",
    "surface": "channel.answerCallback + app.on(callback)",
    "note": "Callbacks",
    "tier": "unified-signal"
  },
  {
    "method": "answerChatJoinRequestQuery",
    "surface": "channel.webApp.answerJoinRequest",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "answerGuestQuery",
    "surface": "channel.webApp.answerGuest",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "answerInlineQuery",
    "surface": "channel.answerInline + app.on(inline)",
    "note": "Inline",
    "tier": "unified-signal"
  },
  {
    "method": "answerPreCheckoutQuery",
    "surface": "channel.answerShipping/PreCheckout + app.on",
    "note": "Payments in",
    "tier": "unified-signal"
  },
  {
    "method": "answerShippingQuery",
    "surface": "channel.answerShipping/PreCheckout + app.on",
    "note": "Payments in",
    "tier": "unified-signal"
  },
  {
    "method": "answerWebAppQuery",
    "surface": "channel.answerWebApp / channel.webApp.answer",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "approveChatJoinRequest",
    "surface": "channel.approveJoin / declineJoin + app.on(joinRequest)",
    "note": "Join",
    "tier": "unified-signal"
  },
  {
    "method": "approveSuggestedPost",
    "surface": "channel.posts.approve",
    "note": "Suggested posts",
    "tier": "unified-channel"
  },
  {
    "method": "banChatMember",
    "surface": "channel.remove",
    "note": "Ban",
    "tier": "unified-channel"
  },
  {
    "method": "banChatSenderChat",
    "surface": "channel.banSender",
    "note": "Admin",
    "tier": "unified-channel"
  },
  {
    "method": "close",
    "surface": "channel.profile.close",
    "note": "Lifecycle",
    "tier": "unified-channel"
  },
  {
    "method": "closeForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "closeGeneralForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "convertGiftToStars",
    "surface": "channel.business.convertGiftToStars",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "copyMessage",
    "surface": "channel.send(copy)",
    "note": "Copy",
    "tier": "unified-content"
  },
  {
    "method": "copyMessages",
    "surface": "channel.send(copyMany(...))",
    "note": "Copy",
    "tier": "unified-content"
  },
  {
    "method": "createChatInviteLink",
    "surface": "channel.invite.*",
    "note": "Invites",
    "tier": "unified-channel"
  },
  {
    "method": "createChatSubscriptionInviteLink",
    "surface": "channel.invite.createSubscription",
    "note": "Invite",
    "tier": "unified-channel"
  },
  {
    "method": "createForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "createInvoiceLink",
    "surface": "channel.invoiceLink",
    "note": "Stars",
    "tier": "unified-channel"
  },
  {
    "method": "createNewStickerSet",
    "surface": "channel.stickers.createSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "declineChatJoinRequest",
    "surface": "channel.approveJoin / declineJoin + app.on(joinRequest)",
    "note": "Join",
    "tier": "unified-signal"
  },
  {
    "method": "declineSuggestedPost",
    "surface": "channel.posts.decline",
    "note": "Suggested posts",
    "tier": "unified-channel"
  },
  {
    "method": "deleteAllMessageReactions",
    "surface": "channel.clearReactions",
    "note": "Reactions",
    "tier": "unified-channel"
  },
  {
    "method": "deleteBusinessMessages",
    "surface": "channel.business.deleteMessages",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "deleteChatPhoto",
    "surface": "channel.avatar",
    "note": "Photo",
    "tier": "unified-channel"
  },
  {
    "method": "deleteChatStickerSet",
    "surface": "channel.stickers.clearChatSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "deleteEphemeralMessage",
    "surface": "channel.ephemeral.delete",
    "note": "Ephemeral",
    "tier": "unified-channel"
  },
  {
    "method": "deleteForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "deleteMessage",
    "surface": "channel.unsend",
    "note": "Delete",
    "tier": "unified-channel"
  },
  {
    "method": "deleteMessageReaction",
    "surface": "channel.removeReaction",
    "note": "Reactions",
    "tier": "unified-channel"
  },
  {
    "method": "deleteMessages",
    "surface": "channel.unsendMany",
    "note": "Bulk delete",
    "tier": "unified-channel"
  },
  {
    "method": "deleteMyCommands",
    "surface": "channel.commands.clear",
    "note": "Commands",
    "tier": "unified-channel"
  },
  {
    "method": "deleteStickerFromSet",
    "surface": "channel.stickers.deleteFromSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "deleteStickerSet",
    "surface": "channel.stickers.deleteSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "deleteStory",
    "surface": "channel.stories.delete",
    "note": "Stories",
    "tier": "unified-channel"
  },
  {
    "method": "deleteWebhook",
    "surface": "telegram.config webhook + createWebhookHandler",
    "note": "Prod inbound",
    "tier": "webhook"
  },
  {
    "method": "editChatInviteLink",
    "surface": "channel.invite.*",
    "note": "Invites",
    "tier": "unified-channel"
  },
  {
    "method": "editChatSubscriptionInviteLink",
    "surface": "channel.invite.editSubscription",
    "note": "Invite",
    "tier": "unified-channel"
  },
  {
    "method": "editEphemeralMessageCaption",
    "surface": "channel.ephemeral.editCaption",
    "note": "Ephemeral",
    "tier": "unified-channel"
  },
  {
    "method": "editEphemeralMessageMedia",
    "surface": "channel.ephemeral.editMedia",
    "note": "Ephemeral",
    "tier": "unified-channel"
  },
  {
    "method": "editEphemeralMessageReplyMarkup",
    "surface": "channel.ephemeral.editMarkup",
    "note": "Ephemeral",
    "tier": "unified-channel"
  },
  {
    "method": "editEphemeralMessageText",
    "surface": "channel.ephemeral.editText",
    "note": "Ephemeral",
    "tier": "unified-channel"
  },
  {
    "method": "editForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "editGeneralForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageCaption",
    "surface": "channel.edit(guid, { caption })",
    "note": "Edit caption",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageChecklist",
    "surface": "channel.edit(guid, { checklist })",
    "note": "Checklist",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageLiveLocation",
    "surface": "shareLocation({livePeriod})",
    "note": "Live loc",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageMedia",
    "surface": "channel.edit(guid, { media })",
    "note": "Edit media",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageReplyMarkup",
    "surface": "channel.edit(guid, { markup })",
    "note": "Edit keyboard",
    "tier": "unified-channel"
  },
  {
    "method": "editMessageText",
    "surface": "channel.edit / message.edit",
    "note": "Edit text",
    "tier": "unified-channel"
  },
  {
    "method": "editStory",
    "surface": "channel.stories.edit",
    "note": "Stories",
    "tier": "unified-channel"
  },
  {
    "method": "editUserStarSubscription",
    "surface": "channel.profile.editStarSubscription",
    "note": "Stars",
    "tier": "unified-channel"
  },
  {
    "method": "exportChatInviteLink",
    "surface": "channel.invite.*",
    "note": "Invites",
    "tier": "unified-channel"
  },
  {
    "method": "forwardMessage",
    "surface": "channel.send(forward)",
    "note": "Forward",
    "tier": "unified-content"
  },
  {
    "method": "forwardMessages",
    "surface": "channel.send(forwardMany(...))",
    "note": "Forward",
    "tier": "unified-content"
  },
  {
    "method": "getAvailableGifts",
    "surface": "channel.business.availableGifts",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getBusinessAccountGifts",
    "surface": "channel.business.gifts",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getBusinessAccountStarBalance",
    "surface": "channel.business.starBalance",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getBusinessConnection",
    "surface": "channel.business.connection",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getChat",
    "surface": "channel.info / channel.getDisplayName / channel.contact",
    "note": "Chat",
    "tier": "unified-channel"
  },
  {
    "method": "getChatAdministrators",
    "surface": "channel.group.admins",
    "note": "Group",
    "tier": "unified-channel"
  },
  {
    "method": "getChatGifts",
    "surface": "channel.business.chatGifts",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getChatMember",
    "surface": "channel.getMember",
    "note": "Members",
    "tier": "unified-channel"
  },
  {
    "method": "getChatMemberCount",
    "surface": "channel.group.memberCount",
    "note": "Group",
    "tier": "unified-channel"
  },
  {
    "method": "getChatMenuButton",
    "surface": "channel.profile.getMenuButton",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getCustomEmojiStickers",
    "surface": "channel.stickers.getCustomEmoji",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "getFile",
    "surface": "attachment.read / getAttachment",
    "note": "Download",
    "tier": "unified-channel"
  },
  {
    "method": "getForumTopicIconStickers",
    "surface": "channel.topic.iconStickers",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "getGameHighScores",
    "surface": "channel.game.highScores",
    "note": "Game",
    "tier": "unified-channel"
  },
  {
    "method": "getManagedBotAccessSettings",
    "surface": "channel.business.managedAccessSettings",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getManagedBotToken",
    "surface": "channel.business.managedToken",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getMe",
    "surface": "channel.profile.me",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getMyCommands",
    "surface": "channel.commands.get",
    "note": "Bot commands",
    "tier": "unified-channel"
  },
  {
    "method": "getMyDefaultAdministratorRights",
    "surface": "channel.profile.getDefaultAdminRights",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getMyDescription",
    "surface": "channel.profile.getDescription",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getMyName",
    "surface": "channel.profile.getName",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getMyShortDescription",
    "surface": "channel.profile.getShortDescription",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getMyStarBalance",
    "surface": "channel.profile.starBalance",
    "note": "Stars",
    "tier": "unified-channel"
  },
  {
    "method": "getStarTransactions",
    "surface": "channel.profile.starTransactions",
    "note": "Stars",
    "tier": "unified-channel"
  },
  {
    "method": "getStickerSet",
    "surface": "channel.stickers.getSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "getUpdates",
    "surface": "long-poll automatic",
    "note": "Dev inbound",
    "tier": "webhook"
  },
  {
    "method": "getUserChatBoosts",
    "surface": "channel.profile.getUserBoosts",
    "note": "Boosts",
    "tier": "unified-channel"
  },
  {
    "method": "getUserGifts",
    "surface": "channel.business.userGifts",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "getUserPersonalChatMessages",
    "surface": "channel.getPersonalMessages",
    "note": "Personal",
    "tier": "unified-channel"
  },
  {
    "method": "getUserProfileAudios",
    "surface": "channel.profile.getUserAudios",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getUserProfilePhotos",
    "surface": "channel.profile.getUserPhotos",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "getWebhookInfo",
    "surface": "telegram.config webhook + createWebhookHandler",
    "note": "Prod inbound",
    "tier": "webhook"
  },
  {
    "method": "giftPremiumSubscription",
    "surface": "channel.business.giftPremium",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "hideGeneralForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "leaveChat",
    "surface": "channel.leave",
    "note": "Leave",
    "tier": "unified-channel"
  },
  {
    "method": "logOut",
    "surface": "channel.profile.logOut",
    "note": "Lifecycle",
    "tier": "unified-channel"
  },
  {
    "method": "pinChatMessage",
    "surface": "channel.pin / unpin",
    "note": "Pins",
    "tier": "unified-channel"
  },
  {
    "method": "postStory",
    "surface": "channel.stories.post",
    "note": "Stories",
    "tier": "unified-channel"
  },
  {
    "method": "promoteChatMember",
    "surface": "channel.promote",
    "note": "Promote",
    "tier": "unified-channel"
  },
  {
    "method": "readBusinessMessage",
    "surface": "channel.business.readMessage",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "refundStarPayment",
    "surface": "channel.refundPayment",
    "note": "Payments",
    "tier": "unified-channel"
  },
  {
    "method": "removeBusinessAccountProfilePhoto",
    "surface": "channel.business.removeProfilePhoto",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "removeChatVerification",
    "surface": "channel.business.removeChatVerification",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "removeMyProfilePhoto",
    "surface": "channel.profile.avatar('clear')",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "removeUserVerification",
    "surface": "channel.business.removeUserVerification",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "reopenForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "reopenGeneralForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "replaceManagedBotToken",
    "surface": "channel.business.replaceManagedToken",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "replaceStickerInSet",
    "surface": "channel.stickers.replaceInSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "repostStory",
    "surface": "channel.stories.repost",
    "note": "Stories",
    "tier": "unified-channel"
  },
  {
    "method": "restrictChatMember",
    "surface": "channel.restrict",
    "note": "Restrict",
    "tier": "unified-channel"
  },
  {
    "method": "revokeChatInviteLink",
    "surface": "channel.invite.*",
    "note": "Invites",
    "tier": "unified-channel"
  },
  {
    "method": "savePreparedInlineMessage",
    "surface": "channel.webApp.savePreparedInline",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "savePreparedKeyboardButton",
    "surface": "channel.webApp.savePreparedKeyboard",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "sendAnimation",
    "surface": "channel.send(animation(...))",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendAudio",
    "surface": "channel.send(attachment|voice) + isSticker/isVideoNote/isAnimation",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendChatAction",
    "surface": "channel.typing(action)",
    "note": "Presence",
    "tier": "unified-channel"
  },
  {
    "method": "sendChatJoinRequestWebApp",
    "surface": "channel.webApp.sendJoinRequest",
    "note": "WebApp",
    "tier": "unified-channel"
  },
  {
    "method": "sendChecklist",
    "surface": "channel.send(checklist(...))",
    "note": "Checklist",
    "tier": "unified-content"
  },
  {
    "method": "sendContact",
    "surface": "channel.send(contactCard)",
    "note": "Contacts",
    "tier": "unified-content"
  },
  {
    "method": "sendDice",
    "surface": "channel.send(dice)",
    "note": "Dice",
    "tier": "unified-content"
  },
  {
    "method": "sendDocument",
    "surface": "channel.send(attachment|voice) + isSticker/isVideoNote/isAnimation",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendGame",
    "surface": "channel.send(game)",
    "note": "Game",
    "tier": "unified-content"
  },
  {
    "method": "sendGift",
    "surface": "channel.send(gift(...))",
    "note": "Gifts",
    "tier": "unified-content"
  },
  {
    "method": "sendInvoice",
    "surface": "channel.send(invoice)",
    "note": "Invoice",
    "tier": "unified-content"
  },
  {
    "method": "sendLivePhoto",
    "surface": "channel.send(livePhoto(...))",
    "note": "Live photo",
    "tier": "unified-content"
  },
  {
    "method": "sendLocation",
    "surface": "channel.send(location) / shareLocation",
    "note": "Location",
    "tier": "unified-content"
  },
  {
    "method": "sendMediaGroup",
    "surface": "channel.send(mediaAlbum(...))",
    "note": "Album",
    "tier": "unified-content"
  },
  {
    "method": "sendMessage",
    "surface": "channel.send(text|markdown|richlink|app|keyboard)",
    "note": "Primary messaging",
    "tier": "unified-content"
  },
  {
    "method": "sendMessageDraft",
    "surface": "channel.ephemeral.sendDraft",
    "note": "Draft",
    "tier": "unified-channel"
  },
  {
    "method": "sendPaidMedia",
    "surface": "channel.send(paidMedia(...))",
    "note": "Paid media",
    "tier": "unified-content"
  },
  {
    "method": "sendPhoto",
    "surface": "channel.send(attachment|voice) + isSticker/isVideoNote/isAnimation",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendPoll",
    "surface": "channel.send(poll)",
    "note": "Polls",
    "tier": "unified-content"
  },
  {
    "method": "sendRichMessage",
    "surface": "channel.send(richMessage(...))",
    "note": "Rich",
    "tier": "unified-content"
  },
  {
    "method": "sendRichMessageDraft",
    "surface": "channel.ephemeral.sendRichDraft",
    "note": "Draft",
    "tier": "unified-channel"
  },
  {
    "method": "sendSticker",
    "surface": "channel.send(sticker(...))",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendVenue",
    "surface": "channel.send(venue(...)) / location(title,address)",
    "note": "Venue",
    "tier": "unified-content"
  },
  {
    "method": "sendVideo",
    "surface": "channel.send(attachment|voice) + isSticker/isVideoNote/isAnimation",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendVideoNote",
    "surface": "channel.send(videoNote(...))",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "sendVoice",
    "surface": "channel.send(attachment|voice) + isSticker/isVideoNote/isAnimation",
    "note": "Media",
    "tier": "unified-content"
  },
  {
    "method": "setBusinessAccountBio",
    "surface": "channel.business.setBio",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setBusinessAccountGiftSettings",
    "surface": "channel.business.setGiftSettings",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setBusinessAccountName",
    "surface": "channel.business.setName",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setBusinessAccountProfilePhoto",
    "surface": "channel.business.setProfilePhoto",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setBusinessAccountUsername",
    "surface": "channel.business.setUsername",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setChatAdministratorCustomTitle",
    "surface": "channel.setAdminTitle",
    "note": "Admin",
    "tier": "unified-channel"
  },
  {
    "method": "setChatDescription",
    "surface": "channel.setDescription",
    "note": "Description",
    "tier": "unified-channel"
  },
  {
    "method": "setChatMemberTag",
    "surface": "channel.setMemberTag",
    "note": "Admin",
    "tier": "unified-channel"
  },
  {
    "method": "setChatMenuButton",
    "surface": "channel.profile.setMenuButton",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setChatPermissions",
    "surface": "channel.setPermissions",
    "note": "Admin",
    "tier": "unified-channel"
  },
  {
    "method": "setChatPhoto",
    "surface": "channel.avatar",
    "note": "Photo",
    "tier": "unified-channel"
  },
  {
    "method": "setChatStickerSet",
    "surface": "channel.stickers.setChatSet",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setChatTitle",
    "surface": "channel.rename",
    "note": "Title",
    "tier": "unified-channel"
  },
  {
    "method": "setCustomEmojiStickerSetThumbnail",
    "surface": "channel.stickers.setCustomEmojiSetThumbnail",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setGameScore",
    "surface": "channel.game.setScore",
    "note": "Game",
    "tier": "unified-channel"
  },
  {
    "method": "setManagedBotAccessSettings",
    "surface": "channel.business.setManagedAccessSettings",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "setMessageReaction",
    "surface": "channel.react",
    "note": "Reactions",
    "tier": "unified-channel"
  },
  {
    "method": "setMyCommands",
    "surface": "channel.commands.set",
    "note": "Bot commands",
    "tier": "unified-channel"
  },
  {
    "method": "setMyDefaultAdministratorRights",
    "surface": "channel.profile.setDefaultAdminRights",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setMyDescription",
    "surface": "channel.profile.setDescription",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setMyName",
    "surface": "channel.profile.setName",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setMyProfilePhoto",
    "surface": "channel.profile.avatar",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setMyShortDescription",
    "surface": "channel.profile.setShortDescription",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setPassportDataErrors",
    "surface": "channel.profile.setPassportErrors",
    "note": "Passport",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerEmojiList",
    "surface": "channel.stickers.setEmojiList",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerKeywords",
    "surface": "channel.stickers.setKeywords",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerMaskPosition",
    "surface": "channel.stickers.setMaskPosition",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerPositionInSet",
    "surface": "channel.stickers.setPosition",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerSetThumbnail",
    "surface": "channel.stickers.setSetThumbnail",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setStickerSetTitle",
    "surface": "channel.stickers.setSetTitle",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "setUserEmojiStatus",
    "surface": "channel.profile.setEmojiStatus",
    "note": "Profile",
    "tier": "unified-channel"
  },
  {
    "method": "setWebhook",
    "surface": "telegram.config webhook + createWebhookHandler",
    "note": "Prod inbound",
    "tier": "webhook"
  },
  {
    "method": "stopMessageLiveLocation",
    "surface": "channel.stopLocation(guid)",
    "note": "Stop live loc",
    "tier": "unified-channel"
  },
  {
    "method": "stopPoll",
    "surface": "channel.poll.stop",
    "note": "Stop poll",
    "tier": "unified-channel"
  },
  {
    "method": "transferBusinessAccountStars",
    "surface": "channel.business.transferStars",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "transferGift",
    "surface": "channel.business.transferGift",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "unbanChatMember",
    "surface": "channel.unban",
    "note": "Unban",
    "tier": "unified-channel"
  },
  {
    "method": "unbanChatSenderChat",
    "surface": "channel.unbanSender",
    "note": "Admin",
    "tier": "unified-channel"
  },
  {
    "method": "unhideGeneralForumTopic",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "unpinAllChatMessages",
    "surface": "channel.pin / unpin",
    "note": "Pins",
    "tier": "unified-channel"
  },
  {
    "method": "unpinAllForumTopicMessages",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "unpinAllGeneralForumTopicMessages",
    "surface": "channel.topic.*",
    "note": "Forum",
    "tier": "unified-channel"
  },
  {
    "method": "unpinChatMessage",
    "surface": "channel.pin / unpin",
    "note": "Pins",
    "tier": "unified-channel"
  },
  {
    "method": "upgradeGift",
    "surface": "channel.business.upgradeGift",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "uploadStickerFile",
    "surface": "channel.stickers.uploadFile",
    "note": "Stickers",
    "tier": "unified-channel"
  },
  {
    "method": "verifyChat",
    "surface": "channel.business.verifyChat",
    "note": "Business",
    "tier": "unified-channel"
  },
  {
    "method": "verifyUser",
    "surface": "channel.business.verifyUser",
    "note": "Business",
    "tier": "unified-channel"
  }
] as const;

export function dxForMethod(method: string): TelegramApiDx | undefined {
  return TELEGRAM_API_DX.find((row) => row.method === method);
}
