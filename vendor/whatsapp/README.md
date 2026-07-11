# @interactions-hq/whatsapp

TypeScript SDK for WhatsApp, via [Skyline](https://github.com/interactions-hq/skyline).

A gRPC client for personal WhatsApp lines — send text and stream inbound
messages over the same per-line transport used by Skyline agents.

## Install

```sh
bun add @interactions-hq/whatsapp
```

## Quick start

```ts
import { WhatsappGrpcClient } from "@interactions-hq/whatsapp";

const client = new WhatsappGrpcClient(
  process.env.WHATSAPP_ENDPOINT!,
  process.env.WHATSAPP_TOKEN!
);

await client.sendText(
  "+15551234567",
  "hello from Skyline",
  `msg-${Date.now()}`
);

client.subscribeEvents({
  onText: (event) => {
    console.log(`${event.senderId}: ${event.text}`);
  },
});
```

## Documentation

See the [Skyline docs](https://docs.interactions.co.in/skyline/providers)
for how WhatsApp lines fit into a multi-platform agent.
