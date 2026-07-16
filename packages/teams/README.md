# @skyline-ts/teams

Microsoft Teams provider for [`skyline-ts`](https://github.com/interaction-hq/skyline). Inbound over the Bot Framework **HTTPS webhook** (Activities, JWT-verified against the Bot Framework JWKS); outbound over the Bot Connector REST API using client-credentials OAuth (token minted + cached). Same unified `Channel` / `Content` / signal surface as every other Skyline platform.

## Install

```bash
bun add skyline-ts @skyline-ts/teams
```

## Usage

```ts
import { Skyline } from "skyline-ts";
import { teams, teamsWebhookFetch } from "@skyline-ts/teams";

const app = await Skyline({
  providers: [
    teams.config({
      appId: process.env.TEAMS_APP_ID!,
      appPassword: process.env.TEAMS_APP_PASSWORD!,
    }),
  ],
});

Bun.serve({
  port: 3978,
  fetch: (req) =>
    new URL(req.url).pathname === "/api/messages"
      ? teamsWebhookFetch(req)
      : new Response("not found", { status: 404 }),
});

for await (const [chat, message] of app.incoming) {
  await chat.reply(message.guid, `echo: ${message.content.text}`);
}
```

Set the messaging endpoint of your Azure Bot registration to the public `/api/messages` URL.

## Notes

- **Conversation reference:** Teams requires an inbound Activity before the bot can send. The provider captures the `serviceUrl` + conversation id from inbound Activities automatically; sending before any inbound throws a clear `unsupported` error.
- Send text/markdown, reply, edit, and delete are supported. Attachments/cards, reactions, and roster ops throw a clear `unsupported` error.
