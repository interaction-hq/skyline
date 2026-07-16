# Changelog

All notable changes to `skyline-ts` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **New provider `@skyline-ts/discord`** — Discord via the Gateway (WebSocket, self-managed heartbeat / resume / jittered backoff) for inbound and the REST API for outbound, mapped onto the unified Channel / Content / signal surface. Configure with `discord.config({ botToken })` or cloud `projectId` / `projectSecret`. Send text / markdown / attachments / voice / albums, reply, edit, delete, react, pin, typing, list/get messages, rename channels, and remove/ban guild members; inbound messages, reactions, edits, deletes, and typing arrive as unified `app.incoming` + `app.on(...)`. Discord-only fields under `message.discord`.
- **New provider `@skyline-ts/line`** — LINE Messaging API. Inbound over the signed webhook (`x-line-signature` verified); outbound uses the reply token inside the response window and push otherwise (automatic). Send text and image/video/audio (by hosted url); mount `lineWebhookFetch` on your server. LINE-only fields under `message.line`.
- **New provider `@skyline-ts/googlechat`** — Google Chat. Inbound over the app webhook (Google bearer-JWT verified against Google's certs); outbound over the Chat REST API with service-account OAuth (JWT-bearer exchange, cached). Send text/markdown, reply in-thread, edit, delete; mount `googlechatWebhookFetch`. Google-Chat-only fields under `message.googlechat`.
- **New provider `@skyline-ts/teams`** — Microsoft Teams (Bot Framework). Inbound over the Activities webhook (JWT verified against the Bot Framework JWKS); outbound over the Bot Connector REST API with client-credentials OAuth. Captures the conversation reference from inbound Activities for sends; send text/markdown, reply, edit, delete; mount `teamsWebhookFetch`. Teams-only fields under `message.teams`.

## [0.7.0] - 2026-07-17

### Added
- `channel.updateLocation(messageGuid, { latitude, longitude, livePeriod?, horizontalAccuracy?, heading?, proximityAlertRadius? })` — move an in-flight live location (`editMessageLiveLocation`). Other providers throw `unsupported`.
- `Message.albumMessageGuids` — for albums (`sendMediaGroup`), the guids of every item sent together (in order; `guid` is the first), plus `Message.mediaGroupId` on the outbound message. Lets callers edit/delete individual album items instead of only the first.
- New `OrderInfo` type (`name` / `phoneNumber` / `email` / `shippingAddress`) shared by the payment success/pre-checkout shapes.
- `InvoiceLinkInput` reaches full `createInvoiceLink` parity: `businessConnectionId`, `subscriptionPeriod` (Stars subscriptions), `sendPhoneNumberToProvider`, `sendEmailToProvider`.

### Changed
- **`stickers.uploadFile` input is now a file, not a string** (breaking): `uploadFile({ data | path | url, mimeType?, name?, stickerFormat, userId })`. The previous `{ sticker: string }` shape could never upload bytes.
- Package `repository` metadata now points to `github.com/interaction-hq/skyline`.

### Fixed
- **`stickers.uploadFile` now actually uploads** — it was sending JSON (`"inputFile is not specified"`); it now does a real multipart upload. Verified live end-to-end alongside the full set lifecycle (create → add → reorder → setEmojiList → setKeywords → replace → setTitle → setThumbnail → deleteFromSet → deleteSet).
- **`profile.avatar(...)` (`setMyProfilePhoto`) now works** — it was dead code (it branched on a `type` field that `VisualAssetInput` never has, so every real photo fell through to `unsupported`, and even the matched path sent JSON). It now reads the asset and does a real multipart upload. `profile.avatar("clear")` (`removeMyProfilePhoto`) unchanged. Verified live.
- `sendMediaGroup` previously dropped items `2..N` of its return array, surfacing only the first message id. All item ids are now returned via `message.albumMessageGuids`.
- **Payment inbound shapes now match the Bot API 10.2 spec (were shallow):** `successful_payment` system event gained `subscriptionExpirationDate`, `isRecurring`, `isFirstRecurring`, `shippingOptionId`, `orderInfo`; `refunded_payment` gained `providerPaymentChargeId`; the `preCheckout` signal gained `shippingOptionId` + `orderInfo`. Stars `createInvoiceLink` (incl. subscriptions) and the `answerShipping` / `answerPreCheckout` / `refundPayment` wire shapes verified live.

## [0.6.0] - 2026-07-15

### Added
- **Full Bot API `Message` parity (inbound)** as first-class Skyline fields: text facets (`mentions` / `links` / `commands` / `hashtags` / `cashtags` / `phones` / `customEmojis` / `dateTimes` / `markdown`), reply/forward (`replyTo` / `quote` / `externalReply` / `forward` / `linkPreview` / `markup`), identity/flags (`senderChat` / `businessConnectionId` / `effectId` / `mediaGroupId` / `threadId` / `suggestedPostInfo` / `directMessagesTopic` / `guestBotCaller` / …), and `systemEvent` for every service message kind (members, payments, forum topics, video chats, gifts, giveaways, web_app_data, …).
- Content kinds elevated on inbound: `live_photo`, `story`, `giveaway` / `giveaway_winners`, `checklist`, `paid_media`, `rich_message`, plus sticker/animation/video-note flags on `attachment`.
- Full common send-option parity on `SendOptions` (applies to every send): `businessConnectionId`, `allowPaidBroadcast`, `messageEffectId`, object-form `linkPreview` (`disabled`/`url`/`preferLargeMedia`/`preferSmallMedia`/`showAboveText`), reply `quote` (+ `allowSendingWithoutReply`), `directMessagesTopicId`.
- Inline keyboard button parity: `loginUrl`, `copyText`, `pay`, `callbackGame`, `switchInlineQueryChosenChat` (inbound + outbound).
- First-class media metadata on `AttachmentContent` (`MediaMeta`): `width` / `height` / `duration` / `length` / `thumbnail` / `cover` / `performer` / `title` / `supportsStreaming` / `hasSpoiler` / `showCaptionAboveMedia` / `disableContentTypeDetection` / `startTimestamp`, plus `duration` on `VoiceContent`. Sent through and read back on every media kind (photo / video / audio / document / animation / voice / video note), including thumbnail upload. Attachment `caption` is now sent (was dropped).
- Venue send parity on `LocationContent`: `foursquareId` / `foursquareType` / `googlePlaceId` / `googlePlaceType`.
- Opt-in wire snapshot: `telegram.config({ includeRaw: true })` → `message.raw` (JSON-safe). Default stays lean for the agent hot path.
- Verified full send-param parity against **Bot API 10.2** (all 185 methods) via a mechanical spec diff. New fields now typed and wired: `receiverUserId` + `suggestedPost` on `SendOptions` (every send), `videoStartTimestamp` on forward/copy, `removeCaption` on copy-many, `isFlexible` on invoices.
- `PollContent` reaches full `sendPoll` parity: `questionParseMode` / `questionEntities`, `allowsRevoting`, `shuffleOptions`, `allowAddingOptions`, `hideResultsUntilCloses`, `membersOnly`, `countryCodes`, `correctOptionIds`, `explanationParseMode` / `explanationEntities` / `explanationMedia`, `description` / `descriptionParseMode` / `descriptionEntities`, and `media`. Options are sent as `InputPollOption`.
- Gift-query filters completed on `getChatGifts` / `getUserGifts` / `getBusinessAccountGifts`: `excludeUnsaved`, `excludeLimitedUpgradable`, `excludeLimitedNonUpgradable`, `excludeFromBlockchain`, `sortByPrice`.
- Webhook config parity: `telegram.config({ webhookCertificate, webhookIpAddress, webhookMaxConnections })` reach `setWebhook`.
- Single-field parity: `react({ big })`, `unban({ onlyIfBanned })`, `group.admins({ returnBots })`, `remove(users, { revokeMessages, untilDate })`, `textEntities` on gift / premium-gift sends, `comment` on `posts.decline`, `actorChatId` / `userId` on reaction removal.
- Per-call-site wire verification (runtime capture of the emitted payload for each driven method) surfaced four fields the token-level diff missed, now typed and wired: `callbackQueryId` on `SendOptions` (the 14 message-style sends), `captionEntities` / `parseMode` / `showCaptionAboveMedia` on copy, `startParameter` on invoices, and `linkPreview` on ephemeral `editText`. `link_preview_options` mapping is now a shared helper used by both `sendMessage` and ephemeral edits.
- **First-class return values (read parity).** Method returns are now fully-typed Skyline shapes with per-field mapping — no shallow objects or bare strings. Broadly-applicable fields live on the unified type; Telegram-only extras go under a `telegram?` block (mirroring `Message.telegram`):
  - `chat.info()` returns the full `ChatFullInfo` as `ChatInfo` (photo, bio, permissions, pinned message, location, sticker set, linked chat, auto-delete, join/history flags, …) plus `telegram` extras (accent colors, emoji status, birthdate, business intro/hours/location, accepted gift types, available reactions, boosts, rating, unique-gift colors, guard bot, community, personal/parent chat, …).
  - `getMe` (`profile.me()`) returns the complete `User` (adds `lastName`, `languageCode`, `isPremium`, `addedToAttachmentMenu`, `supportsGuestQueries`, `hasMainWebApp`, `hasTopicsEnabled`, `allowsUsersToCreateTopics`, `canManageBots`, `supportsJoinRequestQueries`).
  - `stopPoll` and inbound polls return the full `Poll`: `isAnonymous` / `isClosed` / `type` / `totalVoterCount` / `correctOptionIds` / `explanation` / `openPeriod` / `closeDate` / `allowsMultipleAnswers` / `allowsRevoting`, per-option `voterCount` + `media`, and a `telegram` block (entities, `membersOnly`, `countryCodes`, poll/explanation media as typed `PollMediaInfo`).
  - Star transactions expose `source` **and** `receiver` as typed `TransactionPartnerInfo` (user / chat / affiliate / withdrawal-state / request-count / gift / …) instead of a bare `source` string.
  - `getAvailableGifts` returns the full `Gift` (sticker, upgrade cost, premium/colors flags, total/remaining/personal counts, unique-gift-variant count, background, publisher chat).
  - Owned gifts (`business.gifts` / `userGifts` / `chatGifts`) carry the full regular + unique fields (`senderUserId`, `text`, `entities`, `isPrivate`, `isSaved`, `canBeUpgraded`, `wasRefunded`, `convertStarCount`, `canBeTransferred`, `transferStarCount`, `nextTransferDate`, `uniqueGiftNumber`, …).
- **New first-class return types**: `ChatMember` discriminated union (`creator` / `administrator` / `member` / `restricted` / `left` / `kicked`) via `group.member(handle)`, and `ChatInviteLink` object returned by `invite.create` / `createSubscription` / `edit` / `editSubscription` / `revoke` (creator, expiry, member limit, subscription pricing, pending-request count, …).
- **First-class `systemEvent` payloads.** Every service-message event now carries typed fields instead of an opaque `payload` blob: `gift` / `gift_upgrade_sent` (`GiftEventInfo`: gift id, convert/upgrade star counts, text + entities, private flag, unique number), `unique_gift` (origin, resale currency/amount, transfer star count, next transfer date), `owner_changed` / `owner_left` (`newOwner`), `auto_delete_timer_changed` (`messageAutoDeleteTime`), `write_access_allowed` (`fromRequest` / `webAppName` / `fromAttachmentMenu`), `passport_data` (`elementTypes`), `proximity_alert` (`traveler` / `watcher` / `distance`), `chat_background_set` (`backgroundType`), `checklist_tasks_done` / `checklist_tasks_added`, `community_chat_added` (`community`), `direct_message_price_changed`, `giveaway_created` / `giveaway_completed`, `managed_bot_created` (`bot`), `paid_message_price_changed`, `poll_option_added` / `poll_option_deleted` (`optionPersistentId` / `optionText` + entities), and all five `suggested_post_*` events (price / send date / comment / star amount / reason).

### Changed
- **Breaking (pre-1.0):** invite-link ops (`invite.create` / `createSubscription` / `edit` / `editSubscription` / `revoke`) now return a `ChatInviteLink` object instead of a bare `string`. `invite.export()` still returns the primary link string. Star-transaction `source` is now a `TransactionPartnerInfo` object rather than a `string`.
- `GroupOps` gains `member(handle): Promise<ChatMember | null>` (implemented on iMessage as a basic membership record; unsupported on platforms without member APIs).
- Interactive story message content type renamed to `StoryMessageContent` (keeps `type: "story"`); business story post media remains `StoryContent` photo/video.
- Telegram provider `src/` consolidated back to `index` / `config` / `bind` / `client` / `send` / `inbound` (inbound message mapping folded into `inbound.ts`; no separate parity module).

### Fixed
- Long-poll clears any registered webhook (`deleteWebhook`) on start so `getUpdates` works after switching from a webhook deployment.
- Corrected methods that were wired with parameters not in the Bot API spec: ephemeral-message ops now send `receiver_user_id` + `ephemeral_message_id` (were sending `message_id` and omitting the receiver); `webApp.answerGuest` / `answerJoinRequest` / `sendJoinRequest` now send the correct `guest_query_id` / `chat_join_request_query_id` / `web_app_url` / `result` fields; `business.managedAccessSettings` / `managedToken` / `replaceManagedToken` / `setManagedAccessSettings` now key on `user_id` and map `BotAccessSettings` (was a fabricated permissions shape); `clearReactions` targets a user/acting-chat (no non-existent `message_id`); reaction removal drops the non-existent `reactor_user_id`; dropped the removed-in-10.2 singular `correct_option_id` (folds into `correctOptionIds`) and the non-existent `offset_id` on personal-message paging; removed the non-existent `allow_paid_broadcast` on prepared inline messages.

## [0.5.1] - 2026-07-15

### Fixed
- Telegram channels resolve the bot line by platform (chat `@user` / chat_id are not live keys).
- `keyboard` content sends `text` as the message body (Telegram rejects empty / ZWSP-only bodies).
- Long-poll drains pending updates on start so stale callbacks are not replayed.

## [0.5.0] - 2026-07-15

### Added
- **Telegram as a first-class Skyline platform** (unified nomenclature only): Content (`keyboard` / `location` / `dice` / `forward` / `copy` / `invoice` / `game` / `mediaAlbum`, sticker/video-note/animation flags), Channel (`pin` / `unpin` / `shareLocation` / `stopLocation` / `typing(action)` / `edit` patch / invite / topic / moderation / join + payment answers / `poll.stop` / `unsendMany`), signals (`callback` / `inline` / `joinRequest` / `shipping` / `preCheckout` / `platform` catch-all).
- Telegram depth: typed `InlineQueryResult` / `ReplyMarkup` / `MessageEntity` / `ShippingOption` / `ChecklistEdit`; inbound poll/dice/game/contact/invoice Content; structured signals (`poll`, `boost`, `business`, `purchase`, `reactionCount`, `managed`, `subscription`); typed returns (`StoryRef`, `GameHighScore[]`, `StickerSet` / `StickerInfo[]`, `BusinessConnectionInfo`); poll cache for `channel.poll.get`.
- Content: `sticker` / `animation` / `videoNote` / `checklist` / `paidMedia` / `gift` / `richMessage` / `livePhoto` / `venue` / `forwardMany` / `copyMany`; builders use named fields only (no `extras` bags); poll quiz fields.
- Channel: `info`, `commands.*`, `profile.*` (identity, stars, user photos/boosts, passport, `close`/`logOut`), `game.*`, `stickers.*`, `stories.*`, `business.*`, `webApp.*`, `ephemeral.*` (`sendDraft` / `sendRichDraft` + CRUD), `posts.*`, `invite.createSubscription` / `editSubscription`, `topic.iconStickers`, `invoiceLink`, `getMember`, `getPersonalMessages`, `answerWebApp`, `banSender`/`unbanSender`, `setAdminTitle`, `setMemberTag`, `setPermissions`, `refundPayment`, `removeReaction`, `clearReactions`; `group.admins` / `memberCount`; full `topic.*`.
- Signals: `boost`, `business`, `purchase`, `reactionCount`, `managed`, `subscription`.
- Webhook inbound: `telegram.config({ webhookUrl, webhookSecret })` + `telegramWebhookFetch`.
- Escape hatch: `custom({ method, params })` only. Flat message fields (`sender.handle`, `threadId`, `group.kind`).
- Skyline-typed Channel ops in `types.ts` (camelCase in; snake_case mapped in `@skyline-ts/telegram`).
- Other platforms share the same Channel nestings; Telegram-only ops throw `unsupported`.
- `sendFiles` (2–10) → media album; inline chosen results (`chosenResultId`).

### Changed
- `@skyline-ts/telegram` `src/` consolidated to `index` / `config` / `bind` / `client` / `send` / `inbound`. Method catalog lives in `maintainer/api-dx.ts` (not a public export).
- Telegram requires `telegram.config({ botToken })` + direct Bot API HTTP (project creds for cloud extras only).

### Removed
- Product `channel.telegram.*` and `telegramBotProfile()` — use unified APIs + `custom`.
- Signal `app.on("telegram")` — use `app.on("platform")`.
- Separate `editCaption` / `editMarkup` / `editMedia` / `chatAction` — folded into `edit` / `typing`.
- `message.telegram` bag — flat fields instead.
- Public exports `TELEGRAM_API_DX`, `createTelegramBotApi`, `TELEGRAM_BOT_METHODS`.

## [0.4.4] - 2026-07-15

### Fixed
- `skyline-ts` depends on `@skyline-ts/telegram@0.4.2` by version again (npm package doc caught up).

## [0.4.3] - 2026-07-15

### Fixed
- Temporary tarball dependency on `@skyline-ts/telegram` while npm indexed the new scoped package.

## [0.4.2] - 2026-07-15

### Fixed
- Republished `@skyline-ts/telegram` / `skyline-ts` after npm registry package-doc lag on first publish of the new package.

## [0.4.1] - 2026-07-15

### Added
- Core `sendWithFallbacks` / `drainStreamText` — platforms that reject `stream_text` or `markdown` drain/downgrade instead of failing hard.
- Core `readMediaBytes` / `fetchUrlBytes` / `mimeToMediaName` (via `@skyline-ts/core/host`) — path reads use `node:fs/promises` (Node + Bun).
- `@skyline-ts/core/authoring` — provider authoring helpers (no longer aliases `./miniapp`).
- `@skyline-ts/telegram` — Bot API provider (long-poll inbound, text/markdown/media/voice/reactions).
- Slack: outbound voice upload, `app()`/`flow` URL/caption fallback, `app_mention` inbound, real attachment download (REST + gRPC).
- iMessage: attachment/voice from URL, native markdown formatting ranges, markdown `stream_text` drains to formatted send.
- Terminal: outbound attachment/voice/custom, inbound `/attach` `/voice` `/custom` `/react`, in-memory `getAttachment`.

## [0.4.0] - 2026-07-14

### Changed
- **Breaking:** `channel.send` / `sendFile` / `sendFiles` / `reply` (and `message.reply`) return `Message | undefined` instead of `SendReceipt`.
- Fire-and-forget ops (`typing`, `read`, `edit`, `unsend`, rename/avatar/membership) resolve to `undefined`.
- Outbound messages are `bindMessage`-bound — use `msg.reply` / `edit` / `react` / `unsend` on the return value.

## [0.3.6] - 2026-07-14

### Fixed
- ESM import in `@skyline-ts/core` Slack token helper (`../platform.js`) so `import("skyline-ts")` resolves under Node.

## [0.3.5] - 2026-07-14

### Changed
- Wire protos ship inside `dist/proto` only — no top-level `proto/` on npm.
- Provider packages export `.` only — removed public `./grpc` and `./rest` subpaths.
- Host/binder helpers (`bindMessage`, `contentSugar`, `ResolvedLine`, …) live on `@skyline-ts/core/host`, not the main barrel.
- Dropped public `dedicatedLines` / `*DedicatedLines` helpers from provider barrels.

## [0.3.4] - 2026-07-14

### Removed
- Deprecated aliases: `Space`, `app.space()`, `app.messages`, `app.readyPhones`, `channel.phone`.
- Slack dedicated `lines[]` config shim — use `tokens` / `teams` only.
- Public barrel exports of wire clients (`ImessageGrpcClient`, `dmChatGuid`, Slack/WhatsApp gRPC, etc.).
- Duplicate package export path `./app` — use `./miniapp`.

## [0.3.3] - 2026-07-14

### Added
- Content grammar: ops are first-class `Content` (`rename`, `avatar`, `addMember`, `removeMember`, `leaveChannel`, `reply`, `edit`, `unsend`, `read`, `typing`, `reaction`).
- `ContentBuilder` / `resolveContent` — builders may be lazy; `channel.send` accepts `string | Content | ContentBuilder`.
- Channel sugar: `rename`, `avatar`, `add`, `remove`, `leave` delegate to `send(content)`.
- Message actions route through the same content path (`message.reply` → `send(reply(...))`, etc.).
- iMessage: group lifecycle changes also arrive as inbound messages carrying ops content.

## [0.3.2] - 2026-07-14

### Added
- Message actions: `reply`, `react`, `edit`, `unsend`, `read`, plus bound `channel`.
- `channel.responding(fn)` typing helper.
- Attachment download: `MessageAttachment.read` / `stream`, `channel.getAttachment`.
- `streamText(...)` content with iMessage send-then-edit delivery.
- `custom(...)` escape hatch; `customizedMiniApp(...)` extension-card helper.
- Poll ops: `vote` / `unvote` / `addOption` / `get`; `app.on("poll")`.
- Group lifecycle: `app.on("group")`; `getDisplayName` / `group.getName`.

## [0.3.1] - 2026-07-14

### Added
- Content builder: `digitalTouch(...)` for iMessage Digital Touch gestures.
- Channel: `listMessages`, `shareLocation`, `stopLocation`, `focusStatus`.
- App: `createChat`, `createFaceTimeLink`.
- Slack/WhatsApp personal: multipart `sendFiles` (sequential upload / album).

## [0.3.0] - 2026-07-14

### Added
- Inbound `Message.replyTo`, `attachments`, and `service` fields.
- Content builders: `attachment`, `markdown`, `voice`, `contactCard`, `richlink`, `poll`, `group`.
- Channel: `sendFiles`, `shareContactCard`, `getMessage`, `background`.
- GroupOps: `setIcon`, `getIcon`, `setBackground`, `leave`.
- iMessage: multipart album send, inbound reply/attachment mapping, polls, icon/background, leave, createChat, share contact card.
- Slack: inbound file metadata and thread `replyTo`; attachment content upload.
- WhatsApp personal: media/album sends and richer inbound handling.
- WhatsApp Business: attachment/voice mapped to Graph media when a URL is provided.


## [0.2.0] - 2026-07-12

### Changed

- Restructured into a Bun workspace monorepo with publishable `@skyline-ts/*` packages.
- Runtime lives in `@skyline-ts/core`; platform wire clients and binders live in `@skyline-ts/imessage`, `@skyline-ts/slack`, `@skyline-ts/whatsapp`, `@skyline-ts/whatsapp-business`, and `@skyline-ts/terminal`.
- `skyline-ts` umbrella package re-exports core plus all built-in providers (batteries-included install).
- `Skyline()` loads platform binders via dynamic `import()` — install only the providers you use, or the umbrella for everything.
- Scoped packages renamed from `@interactions-hq/*` to `@skyline-ts/*`.

### Install

```bash
# Batteries-included
bun add skyline-ts

# À la carte
bun add @skyline-ts/core @skyline-ts/imessage
```

## [0.1.3] - 2026-07-12

### Changed

- Platform clients live in workspace packages (`@skyline-ts/imessage`, `@skyline-ts/slack`, `@skyline-ts/whatsapp`, `@skyline-ts/whatsapp-business`) and ship with the umbrella SDK.
- Package exports stay on providers, content, webhooks, and miniapp.
- Provider setup docs use “project credentials” vs “pass your own credentials”.

## [0.1.2] - 2026-07-10

### Changed

- Package renamed from `@interactions-hq/skyline` to `skyline-ts` on npm. Install with `npm install skyline-ts`. The scoped package is deprecated; use `skyline-ts` going forward.

## [0.1.1] - 2026-07-09

### Changed

- README restructured for npm and GitHub — overview, supported interfaces, core concepts, examples, and doc links.
- Re-export built-in providers from the main `skyline-ts` entry for ergonomic imports.
- Expanded npm `description` and `keywords`.

## [0.1.0] - 2026-07-09

### Added

- Initial public release of `skyline-ts`.
- iMessage cloud and dedicated connection modes.
- Unified `channel` API: send, reply, react, edit, unsend, typing, read, attachments.
- Merged `incoming` feed and `on(event)` signals.
- Webhook verification and parsing.
- Mini-app authoring (`defineFlow`, registry signing).
- WhatsApp and WhatsApp Business provider stubs.
- Terminal provider for credential-free local development.
- Provider subpath exports (`skyline-ts/providers/imessage`, `/providers/terminal`).
- Cloud and terminal agent examples.

[Unreleased]: https://github.com/interaction-hq/skyline/compare/v0.7.0...main
[0.7.0]: https://github.com/interaction-hq/skyline/compare/v0.6.0...v0.7.0
[0.3.2]: https://github.com/interaction-hq/skyline/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/interaction-hq/skyline/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/interaction-hq/skyline/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/interaction-hq/skyline/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/interaction-hq/skyline/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/interaction-hq/skyline/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/interaction-hq/skyline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/interaction-hq/skyline/releases/tag/v0.1.0
