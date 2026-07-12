// Live smoke: backend-send an app card through the real SDK transport.
//
// Exercises the exact path space.send(app(...)) takes: ImessageGrpcClient ->
// gRPC on the on-mac server -> helper -> IMCore. Runs against a dev-mode server
// (no AUTH_PUBLIC_KEY_PATH), so an empty token sends no auth header and the
// server uses its local identity.
//
// Run: MINI=100.120.138.80:50051 TO=+918527438574 bun examples/miniapp-smoke.ts

import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
} from "@skyline-ts/imessage";

const target = grpcTarget(process.env.MINI ?? "100.120.138.80:50051");
const to = process.env.TO ?? "+918527438574";
const chat = dmChatGuid(to);

const client = new ImessageGrpcClient(target, process.env.TOKEN ?? "");
await client.waitForReady(5000);

const stamp = Date.now();

const interactive = await client.sendApp(
  chat,
  {
    appId: "lunch-poll",
    caption: "lunch friday?",
    data: { session: `smoke-${stamp}` },
    imageSubtitle: "3 options",
    imageTitle: "Quick Poll",
    interactive: true,
    subcaption: "tap to vote",
    summary: "Vote on lunch",
    trailingCaption: "poll",
    url: "https://apps.interactions.co.in/lunch-poll",
  },
  `smoke-interactive-${stamp}`
);
console.log("interactive sent:", interactive.guid);

const richLink = await client.sendApp(
  chat,
  {
    appId: "checkout",
    caption: "your order is ready",
    data: { order: "42" },
    interactive: false,
    subcaption: "tap to check out",
    url: "https://apps.interactions.co.in/checkout",
  },
  `smoke-richlink-${stamp}`
);
console.log("rich-link sent:", richLink.guid);

client.close();
