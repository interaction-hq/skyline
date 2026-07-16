# @skyline-ts/discord

Discord provider for [`skyline-ts`](https://github.com/interaction-hq/skyline). Real-time inbound over the Discord Gateway (WebSocket) with automatic heartbeat, resume, and reconnect; outbound over the REST API. The same `Channel` / `Content` / signal surface as every other Skyline platform.

## Install

```bash
bun add skyline-ts @skyline-ts/discord
```

## Usage

```ts
import { Skyline } from "skyline-ts";
import { discord } from "@skyline-ts/discord";

const app = await Skyline({
  providers: [discord.config({ botToken: process.env.DISCORD_BOT_TOKEN! })],
});

for await (const [chat, message] of app.incoming) {
  if (!message.isFromMe) {
    await chat.reply(message.guid, `echo: ${message.content.type}`);
  }
}
```

`config` options:

| Option | Description |
| --- | --- |
| `botToken` | Bot token from the Discord Developer Portal (required). |
| `applicationId` | Application (client) id. |
| `guildId` | Default guild for guild-scoped operations (member removal, …). |
| `intents` | Override the gateway intents bitfield (defaults to the messaging set). |

The **Message Content** intent is privileged — enable it in the Developer Portal (Bot → Privileged Gateway Intents) or inbound messages arrive without text.

## Capabilities

Send text / markdown / attachments / voice / albums, reply, edit, delete, react, pin/unpin, typing, list messages, rename channels, remove/ban guild members. Inbound messages, reactions, edits, deletes, and typing arrive as unified `app.incoming` messages and `app.on(...)` signals. Discord-only fields (guild/channel/thread ids) are exposed under `message.discord`.
