# Changelog

All notable changes to `skyline-ts` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/interactions-hq/skyline/compare/v0.3.0...main
[0.3.0]: https://github.com/interactions-hq/skyline/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/interactions-hq/skyline/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/interactions-hq/skyline/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/interactions-hq/skyline/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/interactions-hq/skyline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/interactions-hq/skyline/releases/tag/v0.1.0
