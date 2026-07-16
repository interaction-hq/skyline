# @skyline-ts/terminal

Terminal provider for [skyline-ts](https://github.com/interaction-hq/skyline) — chat with your agent from the command line. No credentials required.

## Install

```sh
bun add skyline-ts @skyline-ts/terminal
```

## Use

```ts
import { Skyline } from "skyline-ts";
import { terminal } from "@skyline-ts/terminal";

const app = await Skyline({
  providers: [terminal.config()],
});
```

See the [skyline-ts documentation](https://docs.interactions.co.in/skyline/providers/terminal/setup-and-usage) for the full guide.
