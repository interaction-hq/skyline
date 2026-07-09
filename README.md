# @interactions-hq/skyline

The unified messaging SDK. One project, one credential pair, every platform —
iMessage behind a single API. Open a `channel`, `send`/`react`/`reply`/`typing`
on it, and read a merged `incoming` feed plus `on(...)` signals.

- **Documentation:** [docs.interactions.co.in](https://docs.interactions.co.in)
- **Repository:** [github.com/interactions-hq/skyline](https://github.com/interactions-hq/skyline)

## Install

```bash
npm install @interactions-hq/skyline
# or: bun add @interactions-hq/skyline
```

## Quick start (terminal — no credentials)

```ts
import { Skyline, terminal } from "@interactions-hq/skyline";

const app = await Skyline({
  providers: [terminal.config({ prompt: "you> " })],
});

for await (const [channel, message] of app.incoming) {
  if (message.content.type !== "text") continue;
  await channel.send(`echo: ${message.content.text}`);
}
```

```bash
bun run examples/terminal-agent.ts
```

## Quick start (iMessage cloud)

```ts
import { Skyline, imessage } from "@interactions-hq/skyline";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET,
  baseUrl: process.env.SKYLINE_BASE_URL, // optional
  providers: [imessage.config()],
});

const channel = app.channel("+15551234567");
await channel.send("hi");

for await (const [channel, msg] of app.incoming) {
  if (msg.isFromMe || msg.content.type !== "text") continue;
  await channel.send(`you said: ${msg.content.text}`);
}
```

## Environment variables

| Variable | Description |
| --- | --- |
| `SKYLINE_PROJECT_ID` | Project UUID |
| `SKYLINE_PROJECT_SECRET` | Project secret (`sk_…`) |
| `SKYLINE_BASE_URL` | Control-plane URL (default `https://api.interactions.co.in`) |

## Providers

```ts
import { imessage, terminal } from "@interactions-hq/skyline";
// or: import { imessage, terminal } from "@interactions-hq/skyline/providers";
```

- **iMessage** — cloud (broker-resolved) or dedicated (self-hosted gRPC lines)
- **Terminal** — local stdin/stdout for development and demos

## Development

```bash
bun run build          # compile to dist/
bun run typecheck
bun run example:terminal
bun run check          # broker client self-check
```

## License

MIT
