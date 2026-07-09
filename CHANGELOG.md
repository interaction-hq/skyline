# Changelog

All notable changes to `@interactions-hq/skyline` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Terminal provider for credential-free local development.
- Provider subpath exports (`@interactions-hq/skyline/providers/imessage`, `/providers/terminal`).
- Cloud and terminal agent examples.

## [0.1.0] - 2026-07-09

### Added

- Initial public release of `@interactions-hq/skyline`.
- iMessage cloud and dedicated connection modes.
- Unified `channel` API: send, reply, react, edit, unsend, typing, read, attachments.
- Merged `incoming` feed and `on(event)` signals.
- Webhook verification and parsing.
- Mini-app authoring (`defineFlow`, registry signing).
- WhatsApp and WhatsApp Business provider stubs.

[Unreleased]: https://github.com/interactions-hq/skyline/compare/v0.1.0...main
[0.1.0]: https://github.com/interactions-hq/skyline/releases/tag/v0.1.0
