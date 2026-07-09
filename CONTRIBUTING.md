# Contributing to Skyline

Skyline is a production SDK. Keep changes focused and run checks before pushing.

## Workflow

1. Branch from `main` when you want an isolated change set:
   ```bash
   git checkout main && git pull
   git checkout -b feat/your-change
   ```

2. Develop and verify:
   ```bash
   bun install
   bun run typecheck
   bun run lint
   bun run build
   bun run example:terminal
   bun run broker:check
   ```

3. Open a pull request or push to `main` — either is fine for solo maintenance.

## Versioning

Skyline follows [Semantic Versioning](https://semver.org/):

| Bump | When |
| --- | --- |
| **MAJOR** (`1.0.0` → `2.0.0`) | Breaking API changes |
| **MINOR** (`0.1.0` → `0.2.0`) | New features, backward compatible |
| **PATCH** (`0.1.0` → `0.1.1`) | Bug fixes, backward compatible |

### Release process

1. Update `CHANGELOG.md` under `[Unreleased]` with your changes.
2. Bump `version` in `package.json` to the target semver.
3. Tag the release:
   ```bash
   git checkout main && git pull
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. GitHub Actions publishes `@interactions-hq/skyline` to npm on tag push.

Pre-1.0 (`0.x.y`): MINOR bumps may include small breaking changes; document them in CHANGELOG.

## Changelog format

Use [Keep a Changelog](https://keepachangelog.com/) sections:

```markdown
## [Unreleased]

### Added
- Terminal provider for local development.

### Fixed
- Broker timeout handling.
```

Move `[Unreleased]` entries to a versioned heading when releasing.

## Code quality

Skyline uses [Ultracite](https://www.ultracite.ai/) (Biome) for linting and formatting:

```bash
bun run lint    # check
bun run format  # auto-fix
```

## npm publish

Publishing is automated via the `release` workflow when a `v*` tag is pushed. Requires `NPM_TOKEN` secret on the repository (org maintainers only).

Manual publish (emergency only):

```bash
bun run build
npm publish --access public
```

## Questions

Open an issue at [github.com/interactions-hq/skyline/issues](https://github.com/interactions-hq/skyline/issues).
