# Contributing to Skyline

Skyline is a production SDK. All changes land through pull requests — no direct commits to `main`.

## Workflow

1. **Branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/your-change
   ```

2. **Develop** — keep changes focused. Run checks before opening a PR:
   ```bash
   bun install
   bun run typecheck
   bun run build
   bun run example:terminal   # smoke test
   ```

3. **Open a pull request** against `main`. Fill in the PR template.

4. **Review** — at least one approval required before merge (self-review is fine for solo maintenance, but the PR gate stays enforced).

5. **Merge** — squash merge preferred. Delete the branch after merge.

## Versioning

Skyline follows [Semantic Versioning](https://semver.org/):

| Bump | When |
| --- | --- |
| **MAJOR** (`1.0.0` → `2.0.0`) | Breaking API changes |
| **MINOR** (`0.1.0` → `0.2.0`) | New features, backward compatible |
| **PATCH** (`0.1.0` → `0.1.1`) | Bug fixes, backward compatible |

### Release process

1. Update `CHANGELOG.md` under `[Unreleased]` with your changes.
2. In your release PR, bump `version` in `package.json` to the target semver.
3. After merge to `main`, tag the release:
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

## Branch rules

| Branch | Purpose | Direct push |
| --- | --- | --- |
| `main` | Production-ready code | **Blocked** — PR only |
| `feat/*`, `fix/*`, `chore/*` | Development branches | Allowed |

## npm publish

Publishing is automated via the `release` workflow when a `v*` tag is pushed. Requires `NPM_TOKEN` secret on the repository (org maintainers only).

Manual publish (emergency only):

```bash
bun run build
npm publish --access public
```

## Questions

Open an issue at [github.com/interactions-hq/skyline/issues](https://github.com/interactions-hq/skyline/issues).
