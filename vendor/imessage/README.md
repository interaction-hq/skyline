# @interactions-hq/imessage

TypeScript SDK for iMessage, via [Skyline](https://github.com/interactions-hq/skyline).

A gRPC client for iMessage lines — send and receive text, attachments, tapbacks,
effects, typing, read receipts, group admin, and mini-app / flow cards.

## Install

```sh
bun add @interactions-hq/imessage
```

## Quick start

```ts
import {
  ImessageGrpcClient,
  dmChatGuid,
  grpcTarget,
} from "@interactions-hq/imessage";

const client = new ImessageGrpcClient(
  grpcTarget(process.env.IMESSAGE_ENDPOINT!),
  process.env.IMESSAGE_TOKEN!
);

await client.waitForReady();

const chat = dmChatGuid("+15551234567");
await client.send(chat, "hello from Skyline", `msg-${Date.now()}`);

client.subscribeEvents({
  onReceived: (text, senderId) => {
    console.log(`${senderId}: ${text}`);
  },
});
```

## Documentation

See the [Skyline docs](https://docs.interactions.co.in/skyline/providers/imessage)
for connection modes, routing, and the full messaging feature set.
