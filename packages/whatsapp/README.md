# @skyline-ts/whatsapp

WhatsApp provider for [skyline-ts](https://github.com/interaction-hq/skyline).

## Install

```sh
bun add skyline-ts @skyline-ts/whatsapp
```

## Use

```ts
import { Skyline } from "skyline-ts";
import { whatsapp } from "@skyline-ts/whatsapp";

const app = await Skyline({
  providers: [
    whatsapp.config({
      lines: [
        {
          address: "100.x.y.z:50051",
          token: process.env.WHATSAPP_TOKEN!,
          phone: "+15551234567",
        },
      ],
    }),
  ],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/providers) for the full guide.
