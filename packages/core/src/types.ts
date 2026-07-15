import type {
  AttachmentSend,
  AvatarInput,
  Content,
  ContentInput,
  InlineKeyboardButton,
  LinkPreviewOptions,
  MemberInput,
  MessageEntity,
  Reaction,
  ReplyMarkup,
  SendOptions,
} from "./content/index.js";

export interface LocaleOptions {
  languageCode?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface BotCommandScope {
  type:
    | "default"
    | "all_private_chats"
    | "all_group_chats"
    | "all_chat_administrators"
    | "chat"
    | "chat_administrators"
    | "chat_member";
  chatId?: string | number;
  userId?: string | number;
}

export interface CommandScopeOptions {
  languageCode?: string;
  scope?: BotCommandScope;
}

export interface ChatPermissions {
  canAddWebPagePreviews?: boolean;
  canChangeInfo?: boolean;
  canEditTag?: boolean;
  canInviteUsers?: boolean;
  canManageTopics?: boolean;
  canPinMessages?: boolean;
  canReactToMessages?: boolean;
  canSendAudios?: boolean;
  canSendDocuments?: boolean;
  canSendMessages?: boolean;
  canSendOtherMessages?: boolean;
  canSendPhotos?: boolean;
  canSendPolls?: boolean;
  canSendVideoNotes?: boolean;
  canSendVideos?: boolean;
  canSendVoiceNotes?: boolean;
}

export interface AdminRights {
  canChangeInfo?: boolean;
  canDeleteMessages?: boolean;
  canDeleteStories?: boolean;
  canEditMessages?: boolean;
  canEditStories?: boolean;
  canInviteUsers?: boolean;
  canManageChat?: boolean;
  canManageDirectMessages?: boolean;
  canManageTags?: boolean;
  canManageTopics?: boolean;
  canManageVideoChats?: boolean;
  canPinMessages?: boolean;
  canPostMessages?: boolean;
  canPostStories?: boolean;
  canPromoteMembers?: boolean;
  canRestrictMembers?: boolean;
  isAnonymous?: boolean;
}

export interface RestrictMemberOptions {
  permissions: ChatPermissions;
  untilDate?: number;
  useIndependentChatPermissions?: boolean;
}

export interface SetPermissionsOptions {
  permissions: ChatPermissions;
  useIndependentChatPermissions?: boolean;
}

export interface InviteCreateOptions {
  createsJoinRequest?: boolean;
  expireDate?: number;
  memberLimit?: number;
  name?: string;
}

export interface InviteEditOptions {
  createsJoinRequest?: boolean;
  expireDate?: number;
  memberLimit?: number;
  name?: string;
}

export interface InviteSubscriptionCreateOptions {
  name?: string;
  subscriptionPeriod: number;
  subscriptionPrice: number;
}

export interface InviteSubscriptionEditOptions {
  name?: string;
}

export interface TopicCreateOptions {
  iconColor?: number;
  iconCustomEmojiId?: string;
}

export interface TopicEditOptions {
  iconCustomEmojiId?: string;
  name?: string;
}

export interface MenuButton {
  text?: string;
  type: "commands" | "web_app" | "default";
  webApp?: { url: string };
}

export interface SetMenuButtonOptions {
  chatId?: string | number;
  menuButton?: MenuButton;
}

export interface GetMenuButtonOptions {
  chatId?: string | number;
}

export interface EditStarSubscriptionOptions {
  isCanceled: boolean;
  telegramPaymentChargeId: string;
}

export interface SetEmojiStatusOptions {
  emojiStatusCustomEmojiId?: string;
  emojiStatusExpirationDate?: number;
}

export interface StarTransactionsOptions {
  limit?: number;
  offset?: number;
}

export interface BotIdentity {
  addedToAttachmentMenu?: boolean;
  allowsUsersToCreateTopics?: boolean;
  canConnectToBusiness?: boolean;
  canJoinGroups?: boolean;
  canManageBots?: boolean;
  canReadAllGroupMessages?: boolean;
  firstName: string;
  hasMainWebApp?: boolean;
  hasTopicsEnabled?: boolean;
  id: string;
  isBot: boolean;
  isPremium?: boolean;
  languageCode?: string;
  lastName?: string;
  supportsGuestQueries?: boolean;
  supportsInlineQueries?: boolean;
  supportsJoinRequestQueries?: boolean;
  username?: string;
}

export interface NamedText {
  name?: string;
  text?: string;
}

export interface ProfilePhotos {
  photos: { fileId: string; fileSize?: number; height?: number; width?: number }[][];
  totalCount: number;
}

export interface StarAmount {
  amount: number;
  nanostarAmount?: number;
}

export interface RevenueWithdrawalState {
  date?: number;
  type: "pending" | "succeeded" | "failed" | (string & {});
  url?: string;
}

/** A counterparty in a Star transaction (user, chat, ad platform, …). */
export interface TransactionPartnerInfo {
  chatId?: string;
  commissionPerMille?: number;
  giftId?: string;
  invoicePayload?: string;
  paidMediaPayload?: string;
  premiumSubscriptionDuration?: number;
  requestCount?: number;
  sponsorUserId?: string;
  subscriptionPeriod?: number;
  transactionType?: string;
  type: string;
  user?: User;
  withdrawalState?: RevenueWithdrawalState;
}

export interface StarTransaction {
  amount: number;
  date: number;
  id: string;
  nanostarAmount?: number;
  receiver?: TransactionPartnerInfo;
  source?: TransactionPartnerInfo;
}

export interface StarTransactionsPage {
  transactions: StarTransaction[];
}

export interface GiftBackground {
  centerColor: number;
  edgeColor: number;
  textColor: number;
}

export interface GiftInfo {
  background?: GiftBackground;
  hasColors?: boolean;
  id: string;
  isPremium?: boolean;
  personalRemainingCount?: number;
  personalTotalCount?: number;
  publisherChatId?: string;
  remainingCount?: number;
  starCount?: number;
  sticker?: StickerInfo;
  totalCount?: number;
  uniqueGiftVariantCount?: number;
  upgradeStarCount?: number;
}

export interface OwnedGift {
  canBeTransferred?: boolean;
  canBeUpgraded?: boolean;
  convertStarCount?: number;
  entities?: MessageEntity[];
  giftId: string;
  isPrivate?: boolean;
  isSaved?: boolean;
  isUpgradeSeparate?: boolean;
  nextTransferDate?: number;
  ownedGiftId?: string;
  prepaidUpgradeStarCount?: number;
  sendDate?: number;
  senderUserId?: string;
  starCount?: number;
  text?: string;
  transferStarCount?: number;
  type?: string;
  uniqueGiftNumber?: number;
  wasRefunded?: boolean;
}

export interface GiftsPage {
  gifts: OwnedGift[];
  nextOffset?: string;
  totalCount?: number;
}

export interface UserBoost {
  addDate?: number;
  boostId: string;
  expirationDate?: number;
  userId?: string;
}

export interface UserBoosts {
  boosts: UserBoost[];
}

export interface UserAudio {
  duration?: number;
  fileId: string;
  fileSize?: number;
  mimeType?: string;
  title?: string;
}

export interface TopicIconSticker {
  customEmojiId?: string;
  emoji?: string;
  fileId: string;
}

export interface PreparedInlineResult {
  id: string;
  expirationDate?: number;
}

export interface PreparedKeyboardResult {
  id: string;
  expirationDate?: number;
}

export interface ProfilePhotoInput {
  fileId?: string;
  url?: string;
}

export interface EphemeralMediaInput {
  fileId?: string;
  mimeType?: string;
  type: "photo" | "video" | "document" | "animation";
  url?: string;
}

export interface GameScoreOptions {
  disableEditMessage?: boolean;
  force?: boolean;
  inlineMessageId?: string;
  messageGuid?: string;
}

export interface GameHighScoresOptions {
  inlineMessageId?: string;
  userId?: string;
}

export interface MaskPosition {
  point: "forehead" | "eyes" | "mouth" | "chin";
  scale: number;
  xShift: number;
  yShift: number;
}

export interface InputSticker {
  emojiList: string[];
  format: "static" | "animated" | "video";
  keywords?: string[];
  maskPosition?: MaskPosition;
  /** file_id, attach://, or upload token depending on prior upload. */
  sticker: string;
}

export interface StickerSetCreateInput {
  name: string;
  needsRepainting?: boolean;
  stickerType?: "regular" | "mask" | "custom_emoji";
  stickers: InputSticker[];
  title: string;
  userId: string;
}

export interface StickerAddInput {
  name: string;
  sticker: InputSticker;
  userId: string;
}

export interface StickerReplaceInput {
  name: string;
  oldSticker: string;
  sticker: InputSticker;
  userId: string;
}

export interface StickerUploadInput {
  sticker: string;
  stickerFormat: "static" | "animated" | "video";
  userId: string;
}

export interface StickerSetThumbnailInput {
  format?: "static" | "animated" | "video";
  name: string;
  thumbnail?: string;
  userId: string;
}

export interface CustomEmojiSetThumbnailInput {
  customEmojiId?: string;
  name: string;
}

export interface StickerSet {
  isAnimated?: boolean;
  isVideo?: boolean;
  name: string;
  stickerType?: string;
  stickers: StickerInfo[];
  title: string;
}

export interface StoryContentPhoto {
  photo: string;
  type: "photo";
}

export interface StoryContentVideo {
  coverFrameTimestamp?: number;
  type: "video";
  video: string;
}

export type StoryContent = StoryContentPhoto | StoryContentVideo;

export interface StoryArea {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface StoryPostInput {
  activePeriod: number;
  areas?: StoryArea[];
  businessConnectionId: string;
  caption?: string;
  captionEntities?: MessageEntity[];
  content: StoryContent;
  parseMode?: "HTML" | "MarkdownV2";
  postToChatPage?: boolean;
  protectContent?: boolean;
}

export interface StoryEditInput {
  areas?: StoryArea[];
  businessConnectionId?: string;
  caption?: string;
  captionEntities?: MessageEntity[];
  content?: StoryContent;
  parseMode?: "HTML" | "MarkdownV2";
}

export interface StoryDeleteOptions {
  businessConnectionId?: string;
}

export interface StoryRepostInput {
  businessConnectionId?: string;
  fromChatId: string | number;
  fromStoryId: number;
  postToChatPage?: boolean;
}

export interface BusinessConnectionIdOptions {
  businessConnectionId: string;
}

export interface BusinessGiftsOptions {
  businessConnectionId: string;
  /** Drop gifts held on the blockchain (TON). */
  excludeFromBlockchain?: boolean;
  /** Drop limited-supply gifts that cannot be upgraded. */
  excludeLimitedNonUpgradable?: boolean;
  /** Drop limited-supply gifts that can be upgraded to unique. */
  excludeLimitedUpgradable?: boolean;
  excludeSaved?: boolean;
  excludeUnique?: boolean;
  excludeUnlimited?: boolean;
  excludeUnsaved?: boolean;
  limit?: number;
  offset?: string;
  sortByPrice?: boolean;
}

export interface ChatGiftsOptions {
  excludeFromBlockchain?: boolean;
  excludeLimitedNonUpgradable?: boolean;
  excludeLimitedUpgradable?: boolean;
  excludeSaved?: boolean;
  excludeUnique?: boolean;
  excludeUnlimited?: boolean;
  excludeUnsaved?: boolean;
  limit?: number;
  offset?: string;
  sortByPrice?: boolean;
}

export interface UserGiftsOptions {
  excludeFromBlockchain?: boolean;
  excludeLimitedNonUpgradable?: boolean;
  excludeLimitedUpgradable?: boolean;
  excludeUnique?: boolean;
  excludeUnlimited?: boolean;
  limit?: number;
  offset?: string;
  sortByPrice?: boolean;
}

export interface ConvertGiftInput {
  businessConnectionId: string;
  ownedGiftId: string;
}

export interface TransferGiftInput {
  businessConnectionId: string;
  newOwnerChatId: string | number;
  ownedGiftId: string;
  starCount?: number;
}

export interface UpgradeGiftInput {
  businessConnectionId: string;
  keepOriginalDetails?: boolean;
  ownedGiftId: string;
  starCount?: number;
}

export interface TransferStarsInput {
  businessConnectionId: string;
  starCount: number;
}

export interface GiftPremiumInput {
  monthCount: number;
  starCount: number;
  text?: string;
  textEntities?: MessageEntity[];
  textParseMode?: string;
  userId: string;
}

export interface BusinessNameInput {
  businessConnectionId: string;
  firstName: string;
  lastName?: string;
}

export interface BusinessProfilePhotoInput {
  businessConnectionId: string;
  isPublic?: boolean;
  photo: ProfilePhotoInput;
}

export interface BusinessGiftSettingsInput {
  businessConnectionId: string;
  showGiftButton: boolean;
  acceptedGiftTypes: {
    limitedGifts?: boolean;
    premiumSubscription?: boolean;
    uniqueGifts?: boolean;
    unlimitedGifts?: boolean;
  };
}

/** Access settings of a managed bot (Bot API `BotAccessSettings`). */
export interface ManagedAccessSettings {
  /** Users allowed to interact when access is restricted. */
  addedUsers: User[];
  /** Whether the managed bot is restricted to `addedUsers`. */
  isAccessRestricted: boolean;
}

export interface SetManagedAccessInput {
  /** Users allowed to interact while restricted. */
  addedUserIds?: string[];
  /** Restrict the managed bot to `addedUserIds`. */
  isAccessRestricted: boolean;
  /** Managed bot's user id. */
  userId: string;
}

export interface VerifyChatOptions {
  chatId?: string | number;
  customDescription?: string;
}

export interface VerifyUserOptions {
  customDescription?: string;
}

export interface JoinRequestWebAppInput {
  /** The `chat_join_request_query_id` from the Mini App. */
  queryId: string;
  /** Mini App URL to open for the join request. */
  webAppUrl: string;
}

export interface ParseModeOptions {
  entities?: MessageEntity[];
  parseMode?: "HTML" | "MarkdownV2";
}

export interface EphemeralEditOptions extends ParseModeOptions {
  linkPreview?: boolean | LinkPreviewOptions;
  replyMarkup?: ReplyMarkup;
}

export interface EphemeralMediaOptions {
  replyMarkup?: ReplyMarkup;
}

export interface DraftOptions {
  entities?: MessageEntity[];
  parseMode?: "HTML" | "MarkdownV2";
  threadId?: number | string;
}

export interface RichDraftOptions {
  threadId?: number | string;
}

export interface RichMessageBody {
  html?: string;
  isRtl?: boolean;
  markdown?: string;
  skipEntityDetection?: boolean;
}

export interface SuggestedPostOptions {
  /** Rejection reason shown to the author (declineSuggestedPost). */
  comment?: string;
  sendDate?: number;
}

export interface InlineAnswerOptions {
  button?: { text: string; webApp?: { url: string }; startParameter?: string };
  cacheTime?: number;
  isPersonal?: boolean;
  nextOffset?: string;
  switchPmParameter?: string;
  switchPmText?: string;
}

export interface InlineQueryResultArticle {
  description?: string;
  id: string;
  inputMessageContent: {
    messageText: string;
    parseMode?: "HTML" | "MarkdownV2";
  };
  replyMarkup?: ReplyMarkup;
  thumbnailUrl?: string;
  title: string;
  type: "article";
  url?: string;
}

export interface InlineQueryResultPhoto {
  caption?: string;
  description?: string;
  id: string;
  photoUrl: string;
  thumbnailUrl?: string;
  title?: string;
  type: "photo";
}

export interface InlineQueryResultGif {
  caption?: string;
  gifUrl: string;
  id: string;
  thumbnailUrl?: string;
  title?: string;
  type: "gif";
}

export interface InlineQueryResultMpeg4Gif {
  caption?: string;
  id: string;
  mpeg4Url: string;
  thumbnailUrl?: string;
  title?: string;
  type: "mpeg4_gif";
}

export interface InlineQueryResultVideo {
  caption?: string;
  description?: string;
  id: string;
  mimeType: string;
  thumbnailUrl: string;
  title: string;
  type: "video";
  videoUrl: string;
}

export interface InlineQueryResultAudio {
  audioUrl: string;
  caption?: string;
  id: string;
  performer?: string;
  title: string;
  type: "audio";
}

export interface InlineQueryResultVoice {
  caption?: string;
  id: string;
  title: string;
  type: "voice";
  voiceUrl: string;
}

export interface InlineQueryResultDocument {
  caption?: string;
  documentUrl: string;
  id: string;
  mimeType: string;
  title: string;
  type: "document";
}

export interface InlineQueryResultLocation {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  type: "location";
}

export interface InlineQueryResultVenue {
  address: string;
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  type: "venue";
}

export interface InlineQueryResultContact {
  firstName: string;
  id: string;
  lastName?: string;
  phoneNumber: string;
  type: "contact";
}

export interface InlineQueryResultGame {
  gameShortName: string;
  id: string;
  type: "game";
}

export interface InlineQueryResultCached {
  caption?: string;
  id: string;
  title?: string;
  type:
    | "cached_photo"
    | "cached_gif"
    | "cached_mpeg4_gif"
    | "cached_sticker"
    | "cached_document"
    | "cached_video"
    | "cached_voice"
    | "cached_audio";
  fileId: string;
}

export type InlineQueryResult =
  | InlineQueryResultArticle
  | InlineQueryResultPhoto
  | InlineQueryResultGif
  | InlineQueryResultMpeg4Gif
  | InlineQueryResultVideo
  | InlineQueryResultAudio
  | InlineQueryResultVoice
  | InlineQueryResultDocument
  | InlineQueryResultLocation
  | InlineQueryResultVenue
  | InlineQueryResultContact
  | InlineQueryResultGame
  | InlineQueryResultCached;

export interface PreparedInlineInput {
  allowUserChats?: boolean;
  allowBotChats?: boolean;
  allowGroupChats?: boolean;
  allowChannelChats?: boolean;
  result: InlineQueryResult;
  userId: string;
}

export interface PreparedKeyboardInput {
  button: InlineKeyboardButton;
  userId: string;
}

export interface ShippingOption {
  id: string;
  prices: { amount: number; label: string }[];
  title: string;
}

export interface ShippingAddress {
  city: string;
  countryCode: string;
  postCode: string;
  state: string;
  streetLine1: string;
  streetLine2: string;
}

export interface ChecklistEdit {
  items: { id?: string; text: string }[];
  othersCanAddTasks?: boolean;
  othersCanMarkTasksAsDone?: boolean;
  title?: string;
}

export interface PersonalMessagesOptions {
  limit?: number;
}

export interface PersonalChatMessage {
  messageGuid: string;
  text?: string;
  timestamp?: Date;
}

export interface PersonalMessagesPage {
  messages: PersonalChatMessage[];
}

export interface RemoveReactionOptions {
  /** Restrict removal to a reaction added on behalf of this chat. */
  actorChatId?: string;
  /** Restrict removal to a reaction added by this user. */
  userId?: string;
}

export interface MemberTagOptions {
  customEmojiId?: string;
}

export interface ChatPhotoInfo {
  bigFileId: string;
  bigFileUniqueId: string;
  smallFileId: string;
  smallFileUniqueId: string;
}

export interface Birthdate {
  day: number;
  month: number;
  year?: number;
}

export interface BusinessIntro {
  message?: string;
  sticker?: StickerInfo;
  title?: string;
}

export interface BusinessOpeningHoursInterval {
  closingMinute: number;
  openingMinute: number;
}

export interface BusinessOpeningHours {
  openingHours: BusinessOpeningHoursInterval[];
  timeZoneName: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface BusinessLocation {
  address: string;
  location?: GeoPoint;
}

export interface ChatLocationInfo {
  address: string;
  location: GeoPoint;
}

export interface AcceptedGiftTypes {
  limitedGifts: boolean;
  premiumSubscription: boolean;
  unlimitedGifts: boolean;
  uniqueGifts: boolean;
}

export type ReactionTypeInfo =
  | { customEmojiId: string; type: "custom_emoji" }
  | { emoji: string; type: "emoji" }
  | { type: "paid" };

export interface UserRating {
  currentLevelRating: number;
  level: number;
  nextLevelRating?: number;
  rating: number;
}

export interface UniqueGiftColors {
  darkThemeMainColor: number;
  darkThemeOtherColors: number[];
  lightThemeMainColor: number;
  lightThemeOtherColors: number[];
  modelCustomEmojiId: string;
  symbolCustomEmojiId: string;
}

export interface Community {
  id: string;
  name: string;
}

export interface AudioInfo {
  duration?: number;
  fileId: string;
  fileUniqueId?: string;
  mimeType?: string;
  performer?: string;
  title?: string;
}

/** Telegram-specific chat fields; broadly-applicable ones live on `ChatInfo`. */
export interface ChatInfoTelegram {
  acceptedGiftTypes?: AcceptedGiftTypes;
  accentColorId?: number;
  activeUsernames?: string[];
  availableReactions?: ReactionTypeInfo[];
  backgroundCustomEmojiId?: string;
  birthdate?: Birthdate;
  businessIntro?: BusinessIntro;
  businessLocation?: BusinessLocation;
  businessOpeningHours?: BusinessOpeningHours;
  canSendPaidMedia?: boolean;
  community?: Community;
  customEmojiStickerSetName?: string;
  emojiStatusCustomEmojiId?: string;
  emojiStatusExpirationDate?: number;
  firstProfileAudio?: AudioInfo;
  guardBot?: User;
  hasPrivateForwards?: boolean;
  hasRestrictedVoiceAndVideoMessages?: boolean;
  isDirectMessages?: boolean;
  maxReactionCount?: number;
  paidMessageStarCount?: number;
  parentChat?: ChatInfo;
  personalChat?: ChatInfo;
  profileAccentColorId?: number;
  profileBackgroundCustomEmojiId?: string;
  rating?: UserRating;
  uniqueGiftColors?: UniqueGiftColors;
  unrestrictBoostCount?: number;
}

export interface ChatInfo {
  bio?: string;
  canSetStickerSet?: boolean;
  description?: string;
  firstName?: string;
  hasAggressiveAntiSpamEnabled?: boolean;
  hasHiddenMembers?: boolean;
  hasProtectedContent?: boolean;
  hasVisibleHistory?: boolean;
  id: string;
  inviteLink?: string;
  isForum?: boolean;
  joinByRequest?: boolean;
  joinToSendMessages?: boolean;
  lastName?: string;
  linkedChatId?: string;
  location?: ChatLocationInfo;
  messageAutoDeleteTime?: number;
  permissions?: ChatPermissions;
  photo?: ChatPhotoInfo;
  pinnedMessage?: Message;
  slowModeDelay?: number;
  stickerSetName?: string;
  /** Telegram-only chat detail. */
  telegram?: ChatInfoTelegram;
  title?: string;
  type: string;
  username?: string;
}

export interface PassportElementError {
  elementHash?: string;
  fileHashes?: string[];
  message: string;
  source: string;
  type: string;
}



export type Platform =
  | "imessage"
  | "slack"
  | "whatsapp"
  | "whatsapp_business"
  | "terminal"
  | "telegram";

export type ContentType = "text" | "app" | "flow";

export interface TextContent {
  text: string;
  type: "text";
}

export interface AppContent {
  appId?: string;
  caption?: string;
  data: Record<string, string>;
  summary?: string;
  type: "app";
}

export interface PaymentReceipt {
  amount: string;
  currency: string;
  paid: boolean;
  provider: string;
}

export interface FlowContent {
  appId?: string;
  done: boolean;
  payment?: PaymentReceipt;
  screen?: string;
  state: Record<string, string>;
  type: "flow";
}

export type MessageContent = Content | AppContent | FlowContent;

export interface User {
  displayName?: string;
  /** Public handle / username when the platform has one (e.g. Telegram @name). */
  handle?: string;
  id: string;
  /** IETF language tag when the platform exposes it (e.g. `en`). */
  languageCode?: string;
}

/** Provenance when the inbound message is a forward/repost. */
export interface MessageForward {
  date?: Date;
  fromChatId?: string;
  fromMessageGuid?: string;
  originType?: string;
  senderDisplayName?: string;
  senderHandle?: string;
  senderId?: string;
}

/** A URL (or email) referenced in inbound text/caption. */
export interface MessageLink {
  text: string;
  url: string;
}

/** A bot command invoked in inbound text (e.g. `/start payload`). */
export interface MessageCommand {
  args?: string;
  command: string;
}

/** Chat identity (group/channel/DM) without vendor nesting. */
export interface ChatRef {
  handle?: string;
  id: string;
  kind?: "private" | "group" | "supergroup" | "channel" | (string & {});
  title?: string;
}

/** Quoted slice when replying to part of a message. */
export interface MessageQuote {
  isManual?: boolean;
  markdown?: string;
  position?: number;
  text: string;
}

/** Link-preview options / state on an inbound text message. */
export interface MessageLinkPreview {
  disabled?: boolean;
  preferLargeMedia?: boolean;
  preferSmallMedia?: boolean;
  showAboveText?: boolean;
  url?: string;
}

/** Reply that points at a message in another chat/topic. */
export interface MessageExternalReply {
  chat?: ChatRef;
  hasMediaSpoiler?: boolean;
  messageGuid?: string;
  originType?: string;
}

/** Custom emoji span resolved from inbound text/caption. */
export interface MessageCustomEmoji {
  id: string;
  text: string;
}

/** Date/time span resolved from inbound text/caption. */
export interface MessageDateTime {
  format?: string;
  text: string;
  unixTime: number;
}

/**
 * Platform system / service events carried on a Message (members added, payments,
 * forum topics, video chats, …). Discriminated on `type` — agents switch on this
 * instead of reading vendor field names.
 */
export interface GiftEventInfo {
  canBeUpgraded?: boolean;
  convertStarCount?: number;
  entities?: MessageEntity[];
  giftId: string;
  isPrivate?: boolean;
  isUpgradeSeparate?: boolean;
  ownedGiftId?: string;
  prepaidUpgradeStarCount?: number;
  text?: string;
  uniqueGiftNumber?: number;
}

export type MessageSystemEvent =
  | { type: "members_added"; users: User[] }
  | { type: "member_left"; user: User }
  | { type: "owner_left"; newOwner?: User }
  | { type: "owner_changed"; newOwner: User }
  | { type: "title_changed"; title: string }
  | { type: "photo_changed" }
  | { type: "photo_deleted" }
  | { type: "group_created" }
  | { type: "supergroup_created" }
  | { type: "channel_created" }
  | { type: "auto_delete_timer_changed"; messageAutoDeleteTime: number }
  | { type: "migrated_to"; chatId: string }
  | { type: "migrated_from"; chatId: string }
  | { type: "message_pinned"; messageGuid?: string }
  | {
      type: "successful_payment";
      currency: string;
      invoicePayload: string;
      providerPaymentChargeId?: string;
      telegramPaymentChargeId?: string;
      totalAmount: number;
    }
  | {
      type: "refunded_payment";
      currency: string;
      invoicePayload?: string;
      telegramPaymentChargeId?: string;
      totalAmount: number;
    }
  | { type: "users_shared"; users: User[]; requestId?: string }
  | { type: "chat_shared"; chatId: string; requestId?: string }
  | ({ type: "gift" } & GiftEventInfo)
  | ({ type: "gift_upgrade_sent" } & GiftEventInfo)
  | {
      type: "unique_gift";
      giftName?: string;
      origin: string;
      ownedGiftId?: string;
      lastResaleCurrency?: string;
      lastResaleAmount?: number;
      transferStarCount?: number;
      nextTransferDate?: number;
    }
  | { type: "connected_website"; domain: string }
  | {
      type: "write_access_allowed";
      fromRequest?: boolean;
      webAppName?: string;
      fromAttachmentMenu?: boolean;
    }
  | { type: "passport_data"; elementTypes: string[] }
  | {
      type: "proximity_alert";
      traveler?: User;
      watcher?: User;
      distance: number;
    }
  | { type: "boost_added"; boostCount?: number }
  | { type: "chat_background_set"; backgroundType?: string }
  | {
      type: "checklist_tasks_done";
      markedAsDoneTaskIds?: number[];
      markedAsNotDoneTaskIds?: number[];
    }
  | {
      type: "checklist_tasks_added";
      tasks: { id?: string; text?: string }[];
    }
  | { type: "community_chat_added"; community: Community }
  | { type: "community_chat_removed" }
  | {
      type: "direct_message_price_changed";
      areDirectMessagesEnabled: boolean;
      directMessageStarCount?: number;
    }
  | {
      type: "forum_topic_created";
      name?: string;
      iconColor?: number;
      iconCustomEmojiId?: string;
    }
  | {
      type: "forum_topic_edited";
      name?: string;
      iconCustomEmojiId?: string;
    }
  | { type: "forum_topic_closed" }
  | { type: "forum_topic_reopened" }
  | { type: "general_forum_topic_hidden" }
  | { type: "general_forum_topic_unhidden" }
  | { type: "giveaway_created"; prizeStarCount?: number }
  | {
      type: "giveaway_completed";
      winnerCount: number;
      unclaimedPrizeCount?: number;
      isStarGiveaway?: boolean;
    }
  | { type: "managed_bot_created"; bot: User }
  | { type: "paid_message_price_changed"; paidMessageStarCount: number }
  | {
      type: "poll_option_added";
      optionPersistentId: string;
      optionText: string;
      optionTextEntities?: MessageEntity[];
    }
  | {
      type: "poll_option_deleted";
      optionPersistentId: string;
      optionText: string;
      optionTextEntities?: MessageEntity[];
    }
  | {
      type: "suggested_post_approved";
      price?: { currency: string; amount: number };
      sendDate: number;
    }
  | {
      type: "suggested_post_approval_failed";
      price: { currency: string; amount: number };
    }
  | { type: "suggested_post_declined"; comment?: string }
  | {
      type: "suggested_post_paid";
      currency: string;
      amount?: number;
      starAmount?: StarAmount;
    }
  | { type: "suggested_post_refunded"; reason: string }
  | { type: "video_chat_scheduled"; startDate?: number }
  | { type: "video_chat_started" }
  | { type: "video_chat_ended"; duration?: number }
  | { type: "video_chat_participants_invited"; users?: User[] }
  | { type: "web_app_data"; buttonText?: string; data: string };

export interface StoryRef {
  chatId?: string;
  storyId: string;
}

export interface GameHighScore {
  position: number;
  score: number;
  user: User;
}

export interface StickerInfo {
  emoji?: string;
  fileId: string;
  isAnimated?: boolean;
  isVideo?: boolean;
  setName?: string;
}

export interface BusinessConnectionInfo {
  canReply?: boolean;
  date?: number;
  id: string;
  isEnabled?: boolean;
  userId?: string;
}

export interface GroupContext {
  chatId: string;
  isGroup: boolean;
  /** Chat kind when the platform distinguishes (group / channel / …). */
  kind?: "private" | "group" | "supergroup" | "channel" | (string & {});
  participant: User;
  participants?: User[];
}

export interface SlackMessageMeta {
  subtype?: string;
  teamId: string;
  threadTs?: string;
  ts?: string;
}

export interface CommandOps {
  clear(opts?: CommandScopeOptions): Promise<void>;
  get(opts?: CommandScopeOptions): Promise<{ command: string; description: string }[]>;
  set(
    commands: { command: string; description: string }[],
    opts?: CommandScopeOptions
  ): Promise<void>;
}

export type MessageEdit =
  | string
  | {
      caption?: string;
      checklist?: ChecklistEdit;
      markup?: ReplyMarkup;
      media?: AttachmentSend;
      text?: string;
    };

export interface MessageAttachment {
  guid: string;
  mimeType?: string;
  name?: string;
  read(): Promise<Uint8Array>;
  size?: number;
  stream(): Promise<ReadableStream<Uint8Array>>;
  transferName?: string;
}

/** Direct-messages topic when the chat is a channel DM thread. */
export interface DirectMessagesTopic {
  topicId: number | string;
  name?: string;
}

/** Suggested-post parameters on a channel DM message. */
export interface SuggestedPostInfo {
  state?: string;
  price?: { currency?: string; amount?: number };
  sendDate?: number;
}

export interface Message {
  attachments?: MessageAttachment[];
  authorSignature?: string;
  businessConnectionId?: string;
  /** Cashtags in text/caption (e.g. `$TICKER`), without `$`. */
  cashtags?: string[];
  channel: Channel;
  /** Bot commands in text (e.g. `/start hello` → `{ command: "start", args: "hello" }`). */
  commands?: MessageCommand[];
  content: MessageContent;
  customEmojis?: MessageCustomEmoji[];
  dateTimes?: MessageDateTime[];
  /** Channel direct-messages topic this message belongs to. */
  directMessagesTopic?: DirectMessagesTopic;
  direction: "inbound" | "outbound";
  edit(content: ContentInput): Promise<void>;
  editTimestamp?: Date;
  effectId?: string;
  ephemeralMessageId?: string;
  externalReply?: MessageExternalReply;
  /** Present when this message is a forward/repost. */
  forward?: MessageForward;
  group?: GroupContext;
  /**
   * For guest-bot replies: who/which chat triggered the guest bot.
   * Prefer typed fields over reading vendor wire shapes.
   */
  guestBotCaller?: { chat?: ChatRef; user?: User };
  guestQueryId?: string;
  guid?: string;
  hasMediaSpoiler?: boolean;
  hasProtectedContent?: boolean;
  /** Hashtags in text/caption, without `#`. */
  hashtags?: string[];
  isAutomaticForward?: boolean;
  isFromMe: boolean;
  isFromOffline?: boolean;
  isPaidPost?: boolean;
  isTopicMessage?: boolean;
  linkPreview?: MessageLinkPreview;
  /** URLs / text-links / emails extracted from text/caption. */
  links?: MessageLink[];
  /**
   * Text/caption with formatting as Markdown when the platform had rich
   * spans (bold/italic/code/links). Prefer this over inventing vendor entity arrays.
   */
  markdown?: string;
  /** Inline/reply keyboard attached to the inbound message. */
  markup?: ReplyMarkup;
  /** Album / media-group id when several attachments were sent together. */
  mediaGroupId?: string;
  /** @mentions / text-mentions resolved to Skyline users where possible. */
  mentions?: User[];
  paidStarCount?: number;
  /** Phone numbers extracted from text/caption. */
  phones?: string[];
  platform: Platform;
  quote?: MessageQuote;
  /**
   * Opt-in wire snapshot of the platform update/message (JSON-safe).
   * Off by default so the hot path stays small for agents; enable per provider
   * (e.g. `telegram.config({ includeRaw: true })`) for debug/observability.
   */
  raw?: JsonValue;
  react(
    reaction: Reaction,
    opts?: { big?: boolean; remove?: boolean }
  ): Promise<void>;
  read(): Promise<void>;
  receiver?: User;
  reply(content: ContentInput, opts?: SendOptions): Promise<Message | undefined>;
  replyTo?: {
    checklistTaskId?: number;
    messageGuid: string;
    partIndex?: number;
    pollOptionId?: string;
    senderHandle?: string;
    senderId?: string;
    storyId?: string;
    text?: string;
  };
  sender: User;
  senderBoostCount?: number;
  senderBusinessBot?: User;
  /** When the message was sent on behalf of a chat (anonymous admin / channel). */
  senderChat?: ChatRef;
  senderTag?: string;
  /** Carrier / wire service label (e.g. iMessage). Not a chat system event. */
  service?: string;
  showCaptionAboveMedia?: boolean;
  slack?: SlackMessageMeta;
  /** Suggested-post info when this is a channel DM suggested post. */
  suggestedPostInfo?: SuggestedPostInfo;
  /** Chat system/service event (members, payments, topics, video chats, …). */
  systemEvent?: MessageSystemEvent;
  /** Forum / topic thread id when the platform has one (flat field, not nested). */
  threadId?: string | number;
  timestamp: Date;
  unsend(): Promise<void>;
  /** Handle of a bot this message was sent via, when the platform exposes it. */
  viaHandle?: string;
  viaUser?: User;
}

export interface ReactionSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  reaction: string;
  removed: boolean;
  sender: User;
  timestamp: Date;
}

export interface TypingSignal {
  group?: GroupContext;
  platform: Platform;
  sender: User;
  timestamp: Date;
  typing: boolean;
}

export interface ReadSignal {
  group?: GroupContext;
  platform: Platform;
  sender: User;
  timestamp: Date;
}

export interface EditSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  sender: User;
  text: string;
  timestamp: Date;
}

export interface UnsendSignal {
  group?: GroupContext;
  messageGuid: string;
  platform: Platform;
  sender: User;
  timestamp: Date;
}

export interface SendErrorSignal {
  code?: string;
  message?: string;
  platform: Platform;
  timestamp: Date;
  to: string;
}

export interface GroupChangeSignal {
  backgroundChanged?: boolean;
  backgroundRemoved?: boolean;
  chatId: string;
  iconChanged?: boolean;
  iconRemoved?: boolean;
  participantAdded?: string;
  participantRemoved?: string;
  platform: Platform;
  renamedTo?: string;
  timestamp: Date;
}

export interface PollChangeSignal {
  action: "answer" | "update" | "closed" | string;
  chatId: string;
  isClosed?: boolean;
  optionIds?: number[];
  options?: { text: string; voterCount: number }[];
  platform: Platform;
  pollId?: string;
  pollMessageGuid: string;
  question?: string;
  timestamp: Date;
  userId?: string;
}

export interface CallbackSignal {
  data: string;
  group?: GroupContext;
  messageGuid?: string;
  platform: Platform;
  queryId: string;
  sender: User;
  timestamp: Date;
}

export interface InlineSignal {
  /** Set when the user picked a result (`chosen_inline_result`). */
  chosenResultId?: string;
  offset?: string;
  platform: Platform;
  query: string;
  queryId: string;
  sender: User;
  timestamp: Date;
}

export interface JoinRequestSignal {
  chatId: string;
  platform: Platform;
  sender: User;
  timestamp: Date;
  userChatId?: string;
}

export interface ShippingSignal {
  from: User;
  invoicePayload: string;
  platform: Platform;
  queryId: string;
  shippingAddress: ShippingAddress;
  timestamp: Date;
}

export interface PreCheckoutSignal {
  currency: string;
  from: User;
  invoicePayload: string;
  platform: Platform;
  queryId: string;
  timestamp: Date;
  totalAmount: number;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Catch-all for platform updates that don't have a dedicated Skyline signal yet.
 * Prefer typed signals (`callback`, `edited`, …) when available.
 */
export interface PlatformSignal {
  kind: string;
  payload: JsonValue;
  platform: Platform;
  timestamp: Date;
  updateId?: number;
}

export interface BoostSignal {
  boostId?: string;
  chatId: string;
  platform: Platform;
  removed: boolean;
  timestamp: Date;
  userId?: string;
}

export interface BusinessSignal {
  connectionId?: string;
  kind: "connection" | "deleted_messages";
  messageIds?: string[];
  platform: Platform;
  timestamp: Date;
  userId?: string;
}

export interface PurchaseSignal {
  currency?: string;
  payload?: string;
  platform: Platform;
  sender?: User;
  starCount?: number;
  timestamp: Date;
}

export interface ReactionCountSignal {
  chatId: string;
  messageGuid?: string;
  platform: Platform;
  reactions: { emoji?: string; type: string; totalCount: number }[];
  timestamp: Date;
}

export interface ManagedSignal {
  platform: Platform;
  timestamp: Date;
  userId?: string;
}

export interface SubscriptionSignal {
  platform: Platform;
  timestamp: Date;
  untilDate?: number;
  userId?: string;
}

export interface SignalMap {
  boost: BoostSignal;
  business: BusinessSignal;
  callback: CallbackSignal;
  edited: EditSignal;
  error: SendErrorSignal;
  group: GroupChangeSignal;
  inline: InlineSignal;
  joinRequest: JoinRequestSignal;
  managed: ManagedSignal;
  platform: PlatformSignal;
  poll: PollChangeSignal;
  preCheckout: PreCheckoutSignal;
  purchase: PurchaseSignal;
  reaction: ReactionSignal;
  reactionCount: ReactionCountSignal;
  read: ReadSignal;
  shipping: ShippingSignal;
  subscription: SubscriptionSignal;
  typing: TypingSignal;
  unsent: UnsendSignal;
}

export type SignalName = keyof SignalMap;

/** @deprecated Prefer `Message` from `channel.send()`. Kept for transitional typing. */
export interface SendReceipt {
  guid?: string;
  sentAt: Date;
}

export type VisualAssetInput =
  | { data?: Uint8Array; mimeType?: string; path?: string }
  | "clear";

export type ChatAction =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "find_location"
  | "record_video_note"
  | "upload_video_note"
  | (string & {});

export interface ChatInviteLink {
  createsJoinRequest: boolean;
  creator: User;
  expireDate?: number;
  inviteLink: string;
  isPrimary: boolean;
  isRevoked: boolean;
  memberLimit?: number;
  name?: string;
  pendingJoinRequestCount?: number;
  subscriptionPeriod?: number;
  subscriptionPrice?: number;
}

export interface InviteOps {
  create(opts?: InviteCreateOptions): Promise<ChatInviteLink>;
  createSubscription(
    opts: InviteSubscriptionCreateOptions
  ): Promise<ChatInviteLink>;
  edit(inviteLink: string, opts?: InviteEditOptions): Promise<ChatInviteLink>;
  editSubscription(
    inviteLink: string,
    opts?: InviteSubscriptionEditOptions
  ): Promise<ChatInviteLink>;
  /** Primary invite link for the chat (replaces any previous primary link). */
  export(): Promise<string>;
  revoke(inviteLink: string): Promise<ChatInviteLink>;
}

export interface InvoiceLinkInput {
  currency: string;
  description: string;
  isFlexible?: boolean;
  maxTipAmount?: number;
  needEmail?: boolean;
  needName?: boolean;
  needPhoneNumber?: boolean;
  needShippingAddress?: boolean;
  payload: string;
  photoHeight?: number;
  photoSize?: number;
  photoUrl?: string;
  photoWidth?: number;
  prices: { amount: number; label: string }[];
  providerData?: string;
  providerToken?: string;
  suggestedTipAmounts?: number[];
  title: string;
}

export interface TopicOps {
  close(threadId: number | string): Promise<void>;
  closeGeneral(): Promise<void>;
  create(
    name: string,
    opts?: TopicCreateOptions
  ): Promise<{ threadId: string }>;
  delete(threadId: number | string): Promise<void>;
  edit(threadId: number | string, opts?: TopicEditOptions): Promise<void>;
  hideGeneral(): Promise<void>;
  iconStickers(): Promise<TopicIconSticker[]>;
  reopen(threadId: number | string): Promise<void>;
  reopenGeneral(): Promise<void>;
  unhideGeneral(): Promise<void>;
  unpinAll(threadId?: number | string): Promise<void>;
}

/** Bot / agent identity (name, about, menu button, stars). */
export interface ProfileOps {
  avatar(input: VisualAssetInput): Promise<void>;
  close(): Promise<void>;
  editStarSubscription(
    userId: string,
    opts: EditStarSubscriptionOptions
  ): Promise<void>;
  getDefaultAdminRights(opts?: {
    forChannels?: boolean;
  }): Promise<AdminRights>;
  getDescription(opts?: LocaleOptions): Promise<{ description: string }>;
  getMenuButton(opts?: GetMenuButtonOptions): Promise<MenuButton>;
  getName(opts?: LocaleOptions): Promise<{ name: string }>;
  getShortDescription(
    opts?: LocaleOptions
  ): Promise<{ shortDescription: string }>;
  getUserAudios(
    userId: string,
    opts?: PaginationOptions
  ): Promise<UserAudio[]>;
  getUserBoosts(userId: string): Promise<UserBoosts>;
  getUserPhotos(
    userId: string,
    opts?: PaginationOptions
  ): Promise<ProfilePhotos>;
  logOut(): Promise<void>;
  me(): Promise<BotIdentity>;
  setDefaultAdminRights(opts?: {
    forChannels?: boolean;
    rights?: AdminRights;
  }): Promise<void>;
  setDescription(description: string, opts?: LocaleOptions): Promise<void>;
  setEmojiStatus(
    userId: string,
    opts?: SetEmojiStatusOptions
  ): Promise<void>;
  setMenuButton(opts?: SetMenuButtonOptions): Promise<void>;
  setName(name: string, opts?: LocaleOptions): Promise<void>;
  setPassportErrors(
    userId: string,
    errors: PassportElementError[]
  ): Promise<void>;
  setShortDescription(
    shortDescription: string,
    opts?: LocaleOptions
  ): Promise<void>;
  starBalance(): Promise<StarAmount>;
  starTransactions(opts?: StarTransactionsOptions): Promise<StarTransactionsPage>;
}

export interface GameOps {
  highScores(
    messageGuid: string,
    opts?: GameHighScoresOptions
  ): Promise<GameHighScore[]>;
  setScore(
    userId: string,
    score: number,
    opts?: GameScoreOptions
  ): Promise<void>;
}

/** Sticker packs + per-chat sticker set. */
export interface StickerOps {
  addToSet(input: StickerAddInput): Promise<void>;
  clearChatSet(): Promise<void>;
  createSet(input: StickerSetCreateInput): Promise<void>;
  deleteFromSet(sticker: string): Promise<void>;
  deleteSet(name: string): Promise<void>;
  getCustomEmoji(customEmojiIds: string[]): Promise<StickerInfo[]>;
  getSet(name: string): Promise<StickerSet>;
  replaceInSet(input: StickerReplaceInput): Promise<void>;
  setChatSet(name: string): Promise<void>;
  setCustomEmojiSetThumbnail(
    input: CustomEmojiSetThumbnailInput
  ): Promise<void>;
  setEmojiList(sticker: string, emojiList: string[]): Promise<void>;
  setKeywords(sticker: string, keywords: string[]): Promise<void>;
  setMaskPosition(sticker: string, maskPosition: MaskPosition): Promise<void>;
  setPosition(sticker: string, position: number): Promise<void>;
  setSetThumbnail(input: StickerSetThumbnailInput): Promise<void>;
  setSetTitle(name: string, title: string): Promise<void>;
  uploadFile(input: StickerUploadInput): Promise<{ fileId: string }>;
}

export interface StoryOps {
  delete(
    storyId: string | number,
    opts?: StoryDeleteOptions
  ): Promise<void>;
  edit(storyId: string | number, input: StoryEditInput): Promise<void>;
  post(input: StoryPostInput): Promise<StoryRef>;
  repost(input: StoryRepostInput): Promise<StoryRef>;
}

/** Business connection, gifts, managed bot, verification. */
export interface BusinessOps {
  availableGifts(): Promise<{ gifts: GiftInfo[] }>;
  chatGifts(opts?: ChatGiftsOptions): Promise<GiftsPage>;
  connection(businessConnectionId: string): Promise<BusinessConnectionInfo>;
  convertGiftToStars(input: ConvertGiftInput): Promise<void>;
  deleteMessages(
    messageIds: string[],
    opts: BusinessConnectionIdOptions
  ): Promise<void>;
  giftPremium(input: GiftPremiumInput): Promise<void>;
  gifts(opts: BusinessGiftsOptions): Promise<GiftsPage>;
  managedAccessSettings(userId: string): Promise<ManagedAccessSettings>;
  managedToken(userId: string): Promise<{ token: string }>;
  readMessage(
    messageId: string,
    opts: BusinessConnectionIdOptions
  ): Promise<void>;
  removeChatVerification(opts?: VerifyChatOptions): Promise<void>;
  removeProfilePhoto(opts: BusinessConnectionIdOptions): Promise<void>;
  removeUserVerification(userId: string): Promise<void>;
  replaceManagedToken(userId: string): Promise<{ token: string }>;
  setBio(bio: string, opts: BusinessConnectionIdOptions): Promise<void>;
  setGiftSettings(input: BusinessGiftSettingsInput): Promise<void>;
  setManagedAccessSettings(input: SetManagedAccessInput): Promise<void>;
  setName(input: BusinessNameInput): Promise<void>;
  setProfilePhoto(input: BusinessProfilePhotoInput): Promise<void>;
  setUsername(
    username: string,
    opts: BusinessConnectionIdOptions
  ): Promise<void>;
  starBalance(opts: BusinessConnectionIdOptions): Promise<StarAmount>;
  transferGift(input: TransferGiftInput): Promise<void>;
  transferStars(input: TransferStarsInput): Promise<void>;
  upgradeGift(input: UpgradeGiftInput): Promise<void>;
  userGifts(userId: string, opts?: UserGiftsOptions): Promise<GiftsPage>;
  verifyChat(opts?: VerifyChatOptions): Promise<void>;
  verifyUser(userId: string, opts?: VerifyUserOptions): Promise<void>;
}

export interface WebAppOps {
  /** Answer a Mini App guest query with an inline result. */
  answerGuest(
    queryId: string,
    result: InlineQueryResult
  ): Promise<{ inlineMessageId: string }>;
  /** Answer a Mini App chat-join-request query with a result token. */
  answerJoinRequest(queryId: string, result: string): Promise<void>;
  savePreparedInline(input: PreparedInlineInput): Promise<PreparedInlineResult>;
  savePreparedKeyboard(
    input: PreparedKeyboardInput
  ): Promise<PreparedKeyboardResult>;
  sendJoinRequest(input: JoinRequestWebAppInput): Promise<void>;
}

export interface EphemeralOps {
  delete(receiverUserId: string, ephemeralMessageId: string): Promise<void>;
  editCaption(
    receiverUserId: string,
    ephemeralMessageId: string,
    caption: string,
    opts?: EphemeralEditOptions
  ): Promise<void>;
  editMarkup(
    receiverUserId: string,
    ephemeralMessageId: string,
    markup: ReplyMarkup
  ): Promise<void>;
  editMedia(
    receiverUserId: string,
    ephemeralMessageId: string,
    media: EphemeralMediaInput,
    opts?: EphemeralMediaOptions
  ): Promise<void>;
  editText(
    receiverUserId: string,
    ephemeralMessageId: string,
    text: string,
    opts?: EphemeralEditOptions
  ): Promise<void>;
  sendDraft(
    draftId: number,
    text: string,
    opts?: DraftOptions
  ): Promise<void>;
  sendRichDraft(
    draftId: number,
    richMessage: RichMessageBody,
    opts?: RichDraftOptions
  ): Promise<void>;
}

export interface PostsOps {
  approve(messageGuid: string, opts?: SuggestedPostOptions): Promise<void>;
  decline(messageGuid: string, opts?: SuggestedPostOptions): Promise<void>;
}

export interface Channel {
  add(users: MemberInput): Promise<void>;
  answerCallback(
    queryId: string,
    opts?: { showAlert?: boolean; text?: string; url?: string }
  ): Promise<void>;
  answerInline(
    queryId: string,
    results: InlineQueryResult[],
    opts?: InlineAnswerOptions
  ): Promise<void>;
  answerPreCheckout(
    queryId: string,
    opts?: { errorMessage?: string; ok?: boolean }
  ): Promise<void>;
  answerShipping(
    queryId: string,
    opts: {
      errorMessage?: string;
      ok: boolean;
      shippingOptions?: ShippingOption[];
    }
  ): Promise<void>;
  answerWebApp(queryId: string, result: InlineQueryResult): Promise<void>;
  approveJoin(userId: string): Promise<void>;
  avatar(input: AvatarInput, options?: { mimeType?: string }): Promise<void>;
  background(input: VisualAssetInput): Promise<void>;
  banSender(senderChatId: string): Promise<void>;
  readonly business: BusinessOps;
  /** Remove recent reactions across the chat added by a user or acting chat. */
  clearReactions(opts?: {
    actorChatId?: string;
    userId?: string;
  }): Promise<void>;
  /** Bot command menu (set/get/clear). No-ops / unsupported on non-bot platforms. */
  readonly commands: CommandOps;
  contact(): Promise<Contact | null>;
  declineJoin(userId: string): Promise<void>;
  /** Edit text, or caption / markup / media / checklist via a patch object. */
  edit(messageGuid: string, update: MessageEdit): Promise<void>;
  readonly ephemeral: EphemeralOps;
  focusStatus(): Promise<FocusStatus | null>;
  readonly game: GameOps;
  getAttachment(attachmentGuid: string): Promise<MessageAttachment | null>;
  getDisplayName(): Promise<string | null>;
  getMember(userId: string): Promise<User | null>;
  getMessage(messageGuid: string): Promise<Message | null>;
  getPersonalMessages(
    userId: string,
    opts?: PersonalMessagesOptions
  ): Promise<PersonalMessagesPage>;
  /** Platform chat/conversation metadata. */
  info(): Promise<ChatInfo>;
  readonly group: GroupOps;
  readonly invite: InviteOps;
  /** Create a shareable invoice / payment link (returns URL). */
  invoiceLink(input: InvoiceLinkInput): Promise<string>;
  leave(): Promise<void>;
  listMessages(opts?: ListMessagesOptions): Promise<Message[]>;
  pin(
    messageGuid: string,
    opts?: { silent?: boolean }
  ): Promise<void>;
  readonly platform: Platform;
  readonly poll: PollOps;
  readonly posts: PostsOps;
  /** Bot identity / stars (mirrors `commands` nesting). */
  readonly profile: ProfileOps;
  promote(userId: string, rights?: AdminRights): Promise<void>;
  reachable(): Promise<boolean>;
  react(
    messageGuid: string,
    reaction: Reaction,
    opts?: { big?: boolean; remove?: boolean }
  ): Promise<void>;
  read(): Promise<void>;
  readReceipt(): Promise<void>;
  refundPayment(opts: {
    chargeId: string;
    userId: string;
  }): Promise<void>;
  remove(
    users: MemberInput,
    opts?: { revokeMessages?: boolean; untilDate?: number }
  ): Promise<void>;
  removeReaction(
    messageGuid: string,
    opts?: RemoveReactionOptions
  ): Promise<void>;
  rename(displayName: string): Promise<void>;
  reply(
    messageGuid: string,
    content: ContentInput,
    opts?: SendOptions
  ): Promise<Message | undefined>;
  responding<T>(fn: () => T | Promise<T>): Promise<T>;
  restrict(userId: string, opts: RestrictMemberOptions): Promise<void>;
  send(content: ContentInput, opts?: SendOptions): Promise<Message | undefined>;
  sendFile(
    file: AttachmentSend,
    opts?: SendOptions
  ): Promise<Message | undefined>;
  sendFiles(
    files: AttachmentSend[],
    opts?: SendOptions
  ): Promise<Message | undefined>;
  setAdminTitle(userId: string, customTitle: string): Promise<void>;
  setDescription(description: string): Promise<void>;
  setMemberTag(
    userId: string,
    tag: string,
    opts?: MemberTagOptions
  ): Promise<void>;
  setPermissions(opts: SetPermissionsOptions | ChatPermissions): Promise<void>;
  shareContactCard(): Promise<void>;
  shareLocation(opts?: {
    address?: string;
    durationSeconds?: number;
    latitude?: number;
    livePeriod?: number;
    longitude?: number;
    title?: string;
  }): Promise<void>;
  readonly stickers: StickerOps;
  /** Stop live location. Pass `messageGuid` when the platform requires it. */
  stopLocation(messageGuid?: string): Promise<void>;
  readonly stories: StoryOps;
  readonly to: string;
  readonly topic: TopicOps;
  readonly webApp: WebAppOps;
  /**
   * Activity indicator. `true` / omit = typing; `false` = stop (best-effort);
   * string = richer action where the platform supports it (e.g. upload_photo).
   */
  typing(onOrAction?: boolean | ChatAction): Promise<void>;
  unban(userId: string, opts?: { onlyIfBanned?: boolean }): Promise<void>;
  unbanSender(senderChatId: string): Promise<void>;
  unpin(messageGuid?: string): Promise<void>;
  unsend(messageGuid: string): Promise<void>;
  unsendMany(messageGuids: string[]): Promise<void>;
}

export interface ListMessagesOptions {
  after?: Date;
  before?: Date;
  limit?: number;
  searchText?: string;
}

export interface FocusStatus {
  silenced: boolean;
}

export interface Contact {
  address?: string;
  emails: string[];
  firstName?: string;
  fullName?: string;
  isContact: boolean;
  lastName?: string;
  organization?: string;
  phones: string[];
}

export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface ChatMemberOwner {
  customTitle?: string;
  isAnonymous: boolean;
  status: "creator";
  user: User;
}

export interface ChatMemberAdministrator {
  canBeEdited: boolean;
  canChangeInfo: boolean;
  canDeleteMessages: boolean;
  canDeleteStories: boolean;
  canEditMessages?: boolean;
  canEditStories: boolean;
  canInviteUsers: boolean;
  canManageChat: boolean;
  canManageDirectMessages?: boolean;
  canManageTags?: boolean;
  canManageTopics?: boolean;
  canManageVideoChats: boolean;
  canPinMessages?: boolean;
  canPostMessages?: boolean;
  canPostStories: boolean;
  canPromoteMembers: boolean;
  canRestrictMembers: boolean;
  customTitle?: string;
  isAnonymous: boolean;
  status: "administrator";
  user: User;
}

export interface ChatMemberRegular {
  status: "member";
  tag?: string;
  untilDate?: number;
  user: User;
}

export interface ChatMemberRestricted {
  canAddWebPagePreviews: boolean;
  canChangeInfo: boolean;
  canEditTag: boolean;
  canInviteUsers: boolean;
  canManageTopics: boolean;
  canPinMessages: boolean;
  canReactToMessages: boolean;
  canSendAudios: boolean;
  canSendDocuments: boolean;
  canSendMessages: boolean;
  canSendOtherMessages: boolean;
  canSendPhotos: boolean;
  canSendPolls: boolean;
  canSendVideoNotes: boolean;
  canSendVideos: boolean;
  canSendVoiceNotes: boolean;
  isMember: boolean;
  status: "restricted";
  tag?: string;
  untilDate: number;
  user: User;
}

export interface ChatMemberLeft {
  status: "left";
  user: User;
}

export interface ChatMemberBanned {
  status: "kicked";
  untilDate: number;
  user: User;
}

export type ChatMember =
  | ChatMemberAdministrator
  | ChatMemberBanned
  | ChatMemberLeft
  | ChatMemberOwner
  | ChatMemberRegular
  | ChatMemberRestricted;

export interface GroupOps {
  add(handle: string): Promise<void>;
  /** Chat administrators (bots often only see this roster). */
  admins(opts?: { returnBots?: boolean }): Promise<User[]>;
  getIcon(): Promise<Uint8Array | null>;
  getName(): Promise<string | null>;
  leave(): Promise<void>;
  /** Full membership record (status + rights) for one member. */
  member(handle: string): Promise<ChatMember | null>;
  memberCount(): Promise<number>;
  participants(): Promise<User[]>;
  remove(handle: string): Promise<void>;
  setBackground(input: VisualAssetInput): Promise<void>;
  setIcon(input: VisualAssetInput): Promise<void>;
  setName(name: string): Promise<void>;
}

export interface PollOps {
  addOption(pollMessageGuid: string, optionText: string): Promise<void>;
  get(pollMessageGuid: string): Promise<PollInfo | null>;
  /** Close / stop a poll the bot owns. */
  stop(pollMessageGuid: string): Promise<void>;
  unvote(pollMessageGuid: string): Promise<void>;
  vote(pollMessageGuid: string, optionIdentifier: string): Promise<void>;
}

export interface PollMediaInfo {
  fileId?: string;
  fileUniqueId?: string;
  kind:
    | "animation"
    | "audio"
    | "document"
    | "link"
    | "live_photo"
    | "location"
    | "photo"
    | "sticker"
    | "venue"
    | "video";
  link?: string;
  location?: GeoPoint;
  title?: string;
}

export interface PollInfoOption {
  creatorHandle?: string;
  id?: string;
  media?: PollMediaInfo;
  text: string;
  voterCount?: number;
}

export interface PollInfoTelegram {
  countryCodes?: string[];
  descriptionEntities?: MessageEntity[];
  explanationEntities?: MessageEntity[];
  explanationMedia?: PollMediaInfo;
  media?: PollMediaInfo;
  membersOnly?: boolean;
  questionEntities?: MessageEntity[];
}

export interface PollInfo {
  allowsMultipleAnswers?: boolean;
  allowsRevoting?: boolean;
  chatId: string;
  closeDate?: number;
  correctOptionIds?: number[];
  description?: string;
  explanation?: string;
  id?: string;
  isAnonymous?: boolean;
  isClosed?: boolean;
  openPeriod?: number;
  options: PollInfoOption[];
  pollMessageGuid: string;
  /** Telegram-only poll detail. */
  telegram?: PollInfoTelegram;
  title: string;
  totalVoterCount?: number;
  type?: "quiz" | "regular";
  votes: { optionId: string; participant?: string }[];
}

export interface SkylineApp {
  channel(target: string | ChannelTarget): Channel;
  close(): Promise<void>;
  createChat(
    participants: string[],
    opts?: { platform?: Platform }
  ): Promise<Channel>;
  createFaceTimeLink(opts?: {
    handles?: string[];
    platform?: Platform;
  }): Promise<{ url: string }>;
  incoming: AsyncIterable<[Channel, Message]>;
  on<K extends SignalName>(
    event: K,
    handler: (signal: SignalMap[K], channel: Channel) => void
  ): () => void;
  ready: Set<string>;
}

export interface ChannelTarget {
  platform?: Platform;
  teamId?: string;
  to: string;
}

export interface ResolvedLine {
  address: string;
  business?: {
    phoneNumberId: string;
    accessToken: string;
    apiVersion?: string;
  };
  phone: string;
  slack?: {
    accessToken?: string;
    appToken?: string;
    botToken?: string;
    endpoint?: string;
    signingSecret?: string;
    team?: {
      appId: string;
      botUserId: string;
      grantedScopes: string[];
      teamName: string;
    };
    teamId?: string;
  };
  telegram?: {
    baseUrl?: string;
    botToken: string;
    /** Attach JSON-safe wire payloads on inbound `message.raw` (off by default). */
    includeRaw?: boolean;
    /** Public-key certificate (PEM) for a self-signed webhook endpoint. */
    webhookCertificate?: string;
    /** Fixed IP the webhook connects from (bypasses DNS resolution). */
    webhookIpAddress?: string;
    /** Max simultaneous HTTPS connections for webhook delivery (1–100). */
    webhookMaxConnections?: number;
    /** When set, the binder registers a Bot API webhook and skips long-polling. */
    webhookSecret?: string;
    webhookUrl?: string;
  };
  token: string;
}

export type ProviderConfig = {
  platform: Platform;
  mode?: "cloud" | "dedicated" | "local";
  [key: string]: unknown;
};
