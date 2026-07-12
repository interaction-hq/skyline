# @skyline-ts/imessage

iMessage provider for [skyline-ts](https://github.com/interactions-hq/skyline), supporting managed lines and bring-your-own endpoints — including tapbacks, effects, attachments, and mini-apps.

## Install

```sh
bun add skyline-ts @skyline-ts/imessage
```

## Use

```ts
import { Skyline } from "skyline-ts";
import { imessage } from "@skyline-ts/imessage";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [imessage.config()],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/providers/imessage) for the full guide.
