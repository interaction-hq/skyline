# `@skyline-ts/telegram`

Telegram provider for [skyline-ts](https://www.npmjs.com/package/skyline-ts).

Skyline unified nomenclature — same Content / Channel / signals as other
platforms. Message fields are flat (`guid`, `sender.handle`, `threadId`,
`group.kind`, `platform`). Other providers expose the same Channel nestings and
throw `host.unsupported(...)` where Telegram-only.

```ts
import {
  Skyline,
  keyboard,
  sticker,
  livePhoto,
  venue,
  richMessage,
} from "skyline-ts";
import { telegram } from "@skyline-ts/telegram";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID!,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET!,
  providers: [
    telegram.config({ botToken: process.env.TELEGRAM_BOT_TOKEN! }),
  ],
});

app.on("callback", async (signal, channel) => {
  await channel.answerCallback(signal.queryId, { text: "ok" });
});

app.on("boost", (signal) => {
  console.log("boost", signal.removed, signal.userId);
});

app.on("inline", async (signal, channel) => {
  await channel.answerInline(signal.queryId, [
    {
      type: "article",
      id: "1",
      title: "Hello",
      inputMessageContent: { messageText: "Hello" },
    },
  ]);
});

for await (const [channel, message] of app.incoming) {
  if (message.content.type === "poll") {
    console.log(await channel.poll.get(message.guid!));
  }
  await channel.send(keyboard({
    buttons: [[{ text: "Yes", callbackData: "yes" }]],
  }));
  await channel.profile.setName("Support Bot");
  await channel.ephemeral.sendDraft(1, "Thinking…");
  console.log(await channel.info());
}
```

## First-class surface

| Layer | API |
| --- | --- |
| Content | `text` `markdown` `attachment` `sticker` `animation` `videoNote` `voice` `contact` `poll` `keyboard` `location` `venue` `dice` `forward`/`forwardMany` `copy`/`copyMany` `invoice` `game` `checklist` `paidMedia` `gift` `richMessage` `livePhoto` `mediaAlbum` `custom` |
| Channel | `send` `reply` `edit` `unsend`/`unsendMany` `react` `removeReaction` `clearReactions` `typing` `pin` `shareLocation` `info` `commands.*` `profile.*` `game.*` `stickers.*` `stories.*` `business.*` `webApp.*` `ephemeral.*` (incl. `sendDraft` / `sendRichDraft`) `posts.*` `invite.*` (incl. subscription links) `topic.*` (incl. `iconStickers`) `invoiceLink` `getMember` `getPersonalMessages` `answer*` `banSender`/`unbanSender` `setAdminTitle` `setMemberTag` `setPermissions` `refundPayment` |
| Message | flat: `guid` · `sender.handle` · `threadId` · `group.kind` · `platform` |
| Signals | `callback` `inline` `joinRequest` `shipping` `preCheckout` `edited` `reaction` `reactionCount` `group` `poll` `boost` `business` `purchase` `managed` `subscription` `platform` |

`sendFiles` (2–10) → media album. Bots cannot `add` members — use `invite.*`.
Bot API has no `getMessage` / history list — those return empty/null.

## Inbound

Default is long-polling (`getUpdates`). For a public HTTPS endpoint, pass
`webhookUrl` / `webhookSecret` on `telegram.config(...)` and serve
`telegramWebhookFetch` from your process. Hosted webhook registration via
project credentials is not wired yet — keep the BotFather token in app config.

Inbound is Skyline-first for agents — every Bot API `Message` field is elevated
to a named Message / Content / `systemEvent` field (no vendor entity arrays,
no `message.telegram` bag):

| Kind | Fields |
| --- | --- |
| Text facets | `markdown` · `mentions` · `links` · `commands` · `hashtags` · `cashtags` · `phones` · `customEmojis` · `dateTimes` |
| Media content | `text` · `attachment` (+ sticker/animation/videoNote flags) · `voice` · `live_photo` · `poll` · `dice` · `contact` · `location`/`venue` · `invoice` · `game` · `checklist` · `paid_media` · `gift` · `rich_message` · `story` · `giveaway` |
| Reply / forward | `replyTo` · `quote` · `externalReply` · `forward` · `linkPreview` · `markup` |
| Identity / flags | `sender*` · `senderChat` · `viaHandle` · `mediaGroupId` · `threadId` · `businessConnectionId` · `effectId` · `hasMediaSpoiler` · `suggestedPostInfo` · `directMessagesTopic` · `guestBotCaller` · … |
| Service events | `systemEvent.type` — members, payments, forum topics, video chats, gifts, giveaways, web_app_data, … |

```ts
for await (const [channel, message] of app.incoming) {
  if (message.systemEvent) {
    console.log(message.systemEvent.type);
    continue;
  }
  const body = message.markdown ?? (
    message.content.type === "text" ? message.content.text : ""
  );
  console.log(body, message.mentions, message.links, message.commands);
}
```

Wire snapshot (debug / observability only):

```ts
telegram.config({ botToken, includeRaw: true }) // → message.raw
```

## Naming

Channel / Content / signals use Skyline camelCase (`languageCode`,
`businessConnectionId`, `canSendMessages`). The Telegram provider maps to Bot
API snake_case internally — you do not pass Telegram wire shapes.

`custom({ method, params })` exists only for brand-new Bot API methods that land
before a Skyline release maps them. Everything in the current Bot API is on the
typed Channel / Content surface.
