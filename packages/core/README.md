# @skyline-ts/core

The skyline-ts runtime — Skyline, content builders, webhooks, and the provider authoring API.

## Install

```sh
bun add @skyline-ts/core
```

Pair with the providers you need:

```sh
bun add @skyline-ts/core @skyline-ts/imessage
```

Or install the batteries-included metapackage:

```sh
bun add skyline-ts
```

## Use

```ts
import { Skyline } from "@skyline-ts/core";
import { imessage } from "@skyline-ts/imessage";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [imessage.config()],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/introduction) for the full guide.
