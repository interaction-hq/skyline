# Changelog

All notable changes to `skyline-ts` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

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

[Unreleased]: https://github.com/interactions-hq/skyline/compare/v0.3.2...main
[0.3.2]: https://github.com/interactions-hq/skyline/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/interactions-hq/skyline/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/interactions-hq/skyline/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/interactions-hq/skyline/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/interactions-hq/skyline/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/interactions-hq/skyline/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/interactions-hq/skyline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/interactions-hq/skyline/releases/tag/v0.1.0
