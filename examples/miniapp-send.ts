// Backend-send an app card — no human in the Messages UI.
//
// This is how an agent, a webhook, or a cron sends an interactive card into a
// conversation. Run: `bun examples/miniapp-send.ts` (with real creds/lines).

import { app, imessage, Skyline } from "@interactions-hq/skyline";

const skyline = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET,
  providers: [imessage.config()],
});

const channel = skyline.channel("+15551234567");

// A hosted app card: tapping opens the app in the Interactions shell.
await channel.send(
  app({
    appId: "lunch-poll",
    url: "https://apps.interactions.co.in/lunch-poll?session=abc123",
    caption: "lunch friday?",
    subcaption: "tap to vote",
    trailingCaption: "poll",
    image: "https://apps.interactions.co.in/lunch-poll/card.png",
    imageTitle: "Quick Poll",
    imageSubtitle: "3 options",
    summary: "Vote on lunch",
    data: { session: "abc123" },
  })
);

// A dedicated-mode card (client's own extension): recipients without the app get
// a "Get the app" affordance from the App Store id.
await channel.send(
  app({
    url: "https://acme.example.com/checkout?order=42",
    teamId: "A1B2C3D4E5",
    bundleId: "com.acme.app.MessageExtension",
    appStoreId: 1234567890,
    caption: "Your order is ready",
    subcaption: "Tap to check out",
  })
);

await skyline.close();
