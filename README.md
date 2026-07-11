# Skyline

<p align="center">
  <strong>The unified messaging SDK for TypeScript agents.</strong><br />
  One project. One credential pair. Every interface your users already use.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/skyline-ts"><img src="https://img.shields.io/npm/v/skyline-ts.svg" alt="npm version" /></a>
  <a href="https://github.com/interactions-hq/skyline/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/skyline-ts.svg" alt="license" /></a>
  <a href="https://docs.interactions.co.in"><img src="https://img.shields.io/badge/docs-interactions.co.in-2563EB" alt="documentation" /></a>
</p>

<p align="center">
  <a href="https://docs.interactions.co.in/skyline/getting-started">Getting started</a> ·
  <a href="https://docs.interactions.co.in/skyline/providers">Providers</a> ·
  <a href="https://docs.interactions.co.in/webhooks/overview">Webhooks</a> ·
  <a href="https://app.interactions.co.in">Dashboard</a> ·
  <a href="https://github.com/interactions-hq/skyline/issues">Issues</a>
</p>

---

## Overview

Skyline lets you build an agent once and connect it to the messaging interfaces your users already have — iMessage, WhatsApp Business, and more. Each interface is a **provider**. Your agent code stays the same: one merged inbound feed, one send API, one event model.

Cloud mode talks to the Interactions platform at `https://api.interactions.co.in`. Pass a **project ID** and **project secret** from the [dashboard](https://app.interactions.co.in); the SDK resolves lines, connects each provider, and keeps tokens fresh. No `baseUrl` to configure.

## Why Skyline

- **One agent loop** — `app.messages` merges inbound traffic from every enabled provider
- **One credential pair** — `projectId` + `projectSecret` for hosted lines; pass your own endpoints when you self-host
- **Native features when you need them** — send, reply, react, edit, unsend, typing, read receipts, attachments, mini-app cards
- **Ship locally first** — the terminal provider needs zero credentials
- **Webhook-native** — verify and parse signed deliveries from `skyline-ts/webhooks`
- **Tree-shakeable subpaths** — import only runtime, providers, content, authoring, or webhooks

## Supported interfaces

| Interface | Connection | Notes |
| --- | --- | --- |
| **iMessage** | Project credentials or your own endpoint | Production — typing, reactions, replies, attachments, mini-apps |
| **WhatsApp Business** | Meta Cloud API via project credentials | Templates, media, interactive messages, webhooks |
| **Slack** | Project credentials or your own tokens | Multi-workspace, threads, reactions, edits, Socket Mode inbound |
| **Terminal** | Local stdin/stdout | Credential-free dev, demos, and CI smoke tests |
| **Personal WhatsApp** | Your own endpoint | Self-hosted lines alongside iMessage |

## Install

```bash
npm install skyline-ts
# or: bun add skyline-ts
```

**Requirements:** Node.js 18+, TypeScript 5+ recommended.

## Quick start

### Terminal — no credentials

Run an echo agent in your terminal in under a minute:

```ts
import { Skyline, terminal } from "skyline-ts";

const app = await Skyline({
  providers: [terminal.config({ prompt: "you> " })],
});

for await (const [space, message] of app.messages) {
  if (message.isFromMe || message.content.type !== "text") continue;
  await space.send(`echo: ${message.content.text}`);
}
```

```bash
bun run example:terminal
```

### Cloud — iMessage and WhatsApp Business

```ts
import { imessage, Skyline, whatsappBusiness } from "skyline-ts";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [imessage.config(), whatsappBusiness.config()],
});

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  await space.send(`Got it on ${message.platform}.`);
}
```

Get project credentials from the [dashboard](https://app.interactions.co.in) or [`sky` CLI](https://docs.interactions.co.in/cli/skyline).

## Core concepts

### Spaces

A **space** is a conversation endpoint — a DM, group, or platform-specific chat. Open one with `app.space(handle)` (alias: `app.channel(target)`), then send, reply, react, and type on it.

```ts
const space = app.space("+15551234567");
await space.send("Hello!");
await space.typing(true);
```

### Messages

`app.messages` (alias: `app.incoming`) is an async iterator of `[space, message]` tuples from every connected provider. Each `message` carries `platform`, `sender`, `content`, and platform-specific metadata.

```ts
for await (const [space, message] of app.messages) {
  console.log(message.platform, message.sender.id, message.content);
}
```

### Content

Plain strings send as text. Rich outbound content uses builders from `skyline-ts/content`:

```ts
import { text, app, wa } from "skyline-ts/content";

await space.send(text("Hello"));
await space.send(app({ url: "https://…", caption: "Open app" }));
await space.send(wa.template({ name: "hello_world", language: "en" }));
```

See [content docs](https://docs.interactions.co.in/skyline/content).

### Signals

Lifecycle events that are not full messages — reactions, typing, reads, edits, unsends:

```ts
app.on("reaction", (r, space) => {
  console.log(r.sender.id, r.reaction, r.removed ? "removed" : "added");
});

app.on("typing", (t) => console.log(t.sender.id, t.typing));
```

## Send, reply, and react

```ts
await space.send("On my way.");

if (message.guid) {
  await space.reply(message.guid, "Replying in-thread");
  await space.react(message.guid, "like");
}

await space.read();
await space.typing(true);
```

Platform support varies — see each [provider guide](https://docs.interactions.co.in/skyline/providers).

## Webhooks

Receive inbound events over HTTP with HMAC signature verification:

```ts
import { verifyWebhook, parseWebhook } from "skyline-ts/webhooks";

const event = verifyWebhook(rawBody, signature, secret);
const parsed = parseWebhook(event);
```

Full guide: [webhooks docs](https://docs.interactions.co.in/webhooks/overview).

## Package layout

| Import | Purpose |
| --- | --- |
| `skyline-ts` | Runtime — `Skyline()`, providers, types, content helpers, webhooks |
| `skyline-ts/providers` | All built-in providers |
| `skyline-ts/providers/imessage` | iMessage only |
| `skyline-ts/providers/whatsapp-business` | WhatsApp Business only |
| `skyline-ts/providers/whatsapp` | Personal WhatsApp only |
| `skyline-ts/providers/terminal` | Terminal only |
| `skyline-ts/content` | Content builders only |
| `skyline-ts/webhooks` | Webhook verify + parse |
| `skyline-ts/authoring` | Mini-app authoring (`defineApp`, `defineFlow`) |
| `skyline-ts/app` | Mini-app runtime (alias: `/miniapp`) |

## Mini-apps

Author interactive in-message experiences with declarative flows and registry signing:

```ts
import { defineFlow } from "skyline-ts/authoring";
import { app } from "skyline-ts/content";

const poll = defineFlow({ /* screens, actions */ });
await space.send(app({ url: "https://…", caption: "Take the poll" }));
```

See [app content](https://docs.interactions.co.in/skyline/content/app).

## Custom platforms

Bring your own interface with `definePlatform()`:

```ts
import { definePlatform } from "skyline-ts";

export const myPlatform = definePlatform({
  platform: "my-platform",
  config: () => ({ platform: "my-platform" as const }),
});
```

Guide: [building a custom platform](https://docs.interactions.co.in/skyline/custom-platforms).

## Examples

| Script | What it does |
| --- | --- |
| `bun run example:terminal` | Echo agent — no credentials |
| `bun run example:cloud` | iMessage cloud agent with reactions + typing |
| `bun run example:multi` | iMessage + WhatsApp Business + terminal |

Source in [`examples/`](./examples/).

## Development

```bash
bun install
bun run lint        # Ultracite / Biome
bun run typecheck
bun run build
bun run broker:check
```

### Release

```bash
npm login           # once
bun run release     # lint → build → npm publish
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

- **SDK reference:** [docs.interactions.co.in](https://docs.interactions.co.in)
- **API (projects, users, lines):** [api reference](https://docs.interactions.co.in/api-reference/introduction)
- **CLI:** [`sky` commands](https://docs.interactions.co.in/cli/skyline)

## License

MIT © [The Interaction Company](https://interactions.co.in)
