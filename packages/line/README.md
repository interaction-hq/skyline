# @skyline-ts/line

LINE provider for [`skyline-ts`](https://github.com/interaction-hq/skyline). Inbound over the LINE Messaging API **webhook** (with `x-line-signature` verification); outbound over the Messaging API REST — reply-token when responding inside the window, push otherwise. Same unified `Channel` / `Content` / signal surface as every other Skyline platform.

## Install

```bash
bun add skyline-ts @skyline-ts/line
```

## Usage

```ts
import { Skyline } from "skyline-ts";
import { line, lineWebhookFetch } from "@skyline-ts/line";

const app = await Skyline({
  providers: [
    line.config({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
      channelSecret: process.env.LINE_CHANNEL_SECRET!,
    }),
  ],
});

// Mount the webhook on your HTTP server (Bun shown):
Bun.serve({
  port: 3000,
  fetch: (req) =>
    new URL(req.url).pathname === "/line/webhook"
      ? lineWebhookFetch(req)
      : new Response("not found", { status: 404 }),
});

for await (const [chat, message] of app.incoming) {
  await chat.send(`echo: ${message.content.type}`); // reply-token if fresh, else push
}
```

Set the webhook URL in the LINE Developers console to your public `/line/webhook`.

## Notes

- **Send window:** the first reply after an inbound event uses the reply token; later sends use push. This is automatic.
- **Media:** LINE has no binary upload — send image/video/audio by hosted `https` url. Non-media files and edit/delete/react are not available to LINE bots and throw a clear `unsupported` error.
