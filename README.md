# @interactions-hq/skyline

Unified messaging SDK for TypeScript. One project, one credential pair, every interface your users already use.

- **Docs:** [docs.interactions.co.in](https://docs.interactions.co.in)
- **Repo:** [github.com/interactions-hq/skyline](https://github.com/interactions-hq/skyline)

## Install

```bash
npm install @interactions-hq/skyline
```

## Quick start

```ts
import { Skyline } from "@interactions-hq/skyline";
import { imessage, terminal } from "@interactions-hq/skyline/providers";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET,
  providers: [imessage.config(), terminal.config()],
});

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  await space.send(`Got it on ${message.platform}.`);
}
```

## Package layout

| Import | Purpose |
| --- | --- |
| `@interactions-hq/skyline` | Runtime — `Skyline()`, types, content builders, webhooks |
| `@interactions-hq/skyline/providers` | All built-in providers |
| `@interactions-hq/skyline/providers/imessage` | iMessage only |
| `@interactions-hq/skyline/providers/whatsapp-business` | WhatsApp Business only |
| `@interactions-hq/skyline/providers/terminal` | Terminal only |
| `@interactions-hq/skyline/authoring` | Mini-app authoring (`defineApp`, `defineFlow`) |
| `@interactions-hq/skyline/content` | Content builders only |
| `@interactions-hq/skyline/webhooks` | Webhook verify + parse |

Cloud mode uses `https://api.interactions.co.in` — pass `projectId` + `projectSecret` only.

## Development

```bash
bun install
bun run lint
bun run typecheck
bun run build
bun run example:terminal
```

## License

MIT
