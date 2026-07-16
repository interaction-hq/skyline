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
2. Bump `version` in `package.json`.
3. Publish locally (fast — no CI):
   ```bash
   bun install
   npm login   # once, or set a valid token in ~/.npmrc
   bun run release
   ```
4. Tag and push for GitHub Releases (optional, cosmetic):
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   gh release create v0.1.1 --generate-notes   # optional
   ```

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

Publishing is **local only** — one command after you're logged into npm:

```bash
bun run release
```

That runs lint → build → `npm publish --access public`. No GitHub Actions, no wait for CI.

First time: `npm login`. You need publish access for the `skyline-ts` and `@skyline-ts/*` packages on npm.

## Questions

Open an issue at [github.com/interaction-hq/skyline/issues](https://github.com/interaction-hq/skyline/issues).
