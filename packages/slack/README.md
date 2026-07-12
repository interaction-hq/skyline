# @skyline-ts/slack

Slack provider for [skyline-ts](https://github.com/interactions-hq/skyline).

## Install

```sh
bun add skyline-ts @skyline-ts/slack
```

## Use

```ts
import { Skyline } from "skyline-ts";
import { slack } from "@skyline-ts/slack";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [slack.config()],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/providers/slack/setup) for the full guide.
