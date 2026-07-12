# skyline-ts

Bring agents to any interface — a unified messaging SDK for TypeScript.

`skyline-ts` is the **batteries-included** package: it bundles the runtime
([`@skyline-ts/core`](https://www.npmjs.com/package/@skyline-ts/core)) plus
every official provider, so one install gets you everything.

```sh
bun add skyline-ts
```

```ts
import { Skyline } from "skyline-ts";
import { imessage } from "skyline-ts/providers/imessage";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [imessage.config()],
});
```

## Lean installs

If you only use a couple of platforms and want a smaller install, depend on the
runtime and just the providers you need instead of this metapackage:

```sh
bun add @skyline-ts/core @skyline-ts/imessage
```

```ts
import { Skyline } from "@skyline-ts/core";
import { imessage } from "@skyline-ts/imessage";
```

| Platform | Package |
| --- | --- |
| iMessage | [`@skyline-ts/imessage`](https://www.npmjs.com/package/@skyline-ts/imessage) |
| Slack | [`@skyline-ts/slack`](https://www.npmjs.com/package/@skyline-ts/slack) |
| WhatsApp Business | [`@skyline-ts/whatsapp-business`](https://www.npmjs.com/package/@skyline-ts/whatsapp-business) |
| WhatsApp | [`@skyline-ts/whatsapp`](https://www.npmjs.com/package/@skyline-ts/whatsapp) |
| Terminal | [`@skyline-ts/terminal`](https://www.npmjs.com/package/@skyline-ts/terminal) |

See the [documentation](https://docs.interactions.co.in/skyline/introduction) for the full guide.
