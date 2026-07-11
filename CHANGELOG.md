# Changelog

All notable changes to `skyline-ts` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-07-12

### Changed

- Platform clients ship as `@interactions-hq/imessage`, `@interactions-hq/slack`, `@interactions-hq/whatsapp`, and `@interactions-hq/whatsapp-business`, bundled with the SDK.
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

[Unreleased]: https://github.com/interactions-hq/skyline/compare/v0.1.3...main
[0.1.3]: https://github.com/interactions-hq/skyline/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/interactions-hq/skyline/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/interactions-hq/skyline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/interactions-hq/skyline/releases/tag/v0.1.0
