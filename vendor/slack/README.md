# @interactions-hq/slack

TypeScript SDK for Slack, via [Skyline](https://github.com/interactions-hq/skyline).

Talk to Slack over the hosted gRPC gateway with short-lived JWTs, or call the
Slack Web API / Socket Mode directly with your own bot and app tokens. The
client covers send, edit, delete, reactions, file upload, and inbound event
streams.

## Install

```sh
bun add @interactions-hq/slack
```

## Quick start

```ts
import {
  SlackGrpcClient,
  slackGrpcTarget,
} from "@interactions-hq/slack";

const client = new SlackGrpcClient(
  slackGrpcTarget(),
  "T012ABCDE",
  process.env.SLACK_JWT!
);

await client.sendText("C012XYZ", "hello from Skyline");

client.subscribe({
  onText: (event) => {
    console.log(`${event.userId}: ${event.text}`);
  },
});
```

Bring-your-own Slack credentials:

```ts
import { SlackClient, connectSlackSocket } from "@interactions-hq/slack";

const rest = new SlackClient({ botToken: process.env.SLACK_BOT_TOKEN! });
await rest.sendText("C012XYZ", "hello");

connectSlackSocket({
  appToken: process.env.SLACK_APP_TOKEN!,
  handlers: {
    onText: (event) => console.log(event.text),
  },
});
```

## Documentation

See the [Skyline docs](https://docs.interactions.co.in/skyline/providers/slack/setup)
for provider setup, multi-workspace tokens, and agent examples.
