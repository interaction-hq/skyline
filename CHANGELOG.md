# Changelog

All notable changes to `@interactions-hq/skyline` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-07-09

### Changed

- README restructured for npm and GitHub — overview, supported interfaces, core concepts, examples, and doc links.
- Re-export built-in providers from the main `@interactions-hq/skyline` entry for ergonomic imports.
- Expanded npm `description` and `keywords`.

## [0.1.0] - 2026-07-09

### Added

- Initial public release of `@interactions-hq/skyline`.
- iMessage cloud and dedicated connection modes.
- Unified `channel` API: send, reply, react, edit, unsend, typing, read, attachments.
- Merged `incoming` feed and `on(event)` signals.
- Webhook verification and parsing.
- Mini-app authoring (`defineFlow`, registry signing).
- WhatsApp and WhatsApp Business provider stubs.
- Terminal provider for credential-free local development.
- Provider subpath exports (`@interactions-hq/skyline/providers/imessage`, `/providers/terminal`).
- Cloud and terminal agent examples.

[Unreleased]: https://github.com/interactions-hq/skyline/compare/v0.1.1...main
[0.1.1]: https://github.com/interactions-hq/skyline/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/interactions-hq/skyline/releases/tag/v0.1.0
