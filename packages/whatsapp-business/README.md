# @interactions-hq/whatsapp-business

TypeScript SDK for the WhatsApp Business API, via [Skyline](https://github.com/interactions-hq/skyline).

Send text, media, templates, interactive messages, reactions, and typing / read
acknowledgements over the Meta Cloud API.

## Install

```sh
bun add @interactions-hq/whatsapp-business
```

## Quick start

```ts
import { WhatsappBusinessClient } from "@interactions-hq/whatsapp-business";

const client = new WhatsappBusinessClient({
  accessToken: process.env.WA_ACCESS_TOKEN!,
  phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
});

await client.sendText("+15551234567", "hello from Skyline");
```

## Documentation

See the [Skyline docs](https://docs.interactions.co.in/skyline/providers/whatsapp-business/setup).
