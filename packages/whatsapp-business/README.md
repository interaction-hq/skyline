# @skyline-ts/whatsapp-business

WhatsApp Business provider for [skyline-ts](https://github.com/interactions-hq/skyline).

## Install

```sh
bun add skyline-ts @skyline-ts/whatsapp-business
```

## Use

```ts
import { Skyline } from "skyline-ts";
import { whatsappBusiness } from "@skyline-ts/whatsapp-business";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [whatsappBusiness.config()],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/providers/whatsapp-business/setup) for the full guide.
