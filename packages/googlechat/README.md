# @skyline-ts/googlechat

Google Chat provider for [`skyline-ts`](https://github.com/interaction-hq/skyline). Inbound over the Google Chat app **HTTPS webhook** (Google bearer-JWT verified against Google's public certs); outbound over the Chat REST API using service-account OAuth (JWT-bearer token exchange, cached). Same unified `Channel` / `Content` / signal surface as every other Skyline platform.

## Install

```bash
bun add skyline-ts @skyline-ts/googlechat
```

## Usage

```ts
import { Skyline } from "skyline-ts";
import { googlechat, googlechatWebhookFetch } from "@skyline-ts/googlechat";

const app = await Skyline({
  providers: [
    googlechat.config({
      serviceAccountJson: process.env.GCHAT_SERVICE_ACCOUNT_JSON!,
      audience: process.env.GCHAT_PROJECT_NUMBER, // verifies inbound JWTs
    }),
  ],
});

Bun.serve({
  port: 3000,
  fetch: (req) =>
    new URL(req.url).pathname === "/googlechat/webhook"
      ? googlechatWebhookFetch(req)
      : new Response("not found", { status: 404 }),
});

for await (const [chat, message] of app.incoming) {
  await chat.reply(message.guid, `echo: ${message.content.text}`); // stays in-thread
}
```

Point your Chat app's endpoint at the public `/googlechat/webhook` URL.

## Notes

- **Auth:** outbound uses the service account (`chat.bot` scope); tokens are minted and cached automatically. Inbound JWTs are verified when `audience` is set.
- Send text/markdown, reply (in-thread), edit, and delete are supported. Attachments, reactions, and roster ops throw a clear `unsupported` error.
