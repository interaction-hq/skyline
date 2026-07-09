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
} from "../src/transport/imessage-grpc";

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
    url: "https://apps.interactions.co.in/lunch-poll",
    caption: "lunch friday?",
    subcaption: "tap to vote",
    trailingCaption: "poll",
    imageTitle: "Quick Poll",
    imageSubtitle: "3 options",
    summary: "Vote on lunch",
    data: { session: `smoke-${stamp}` },
    interactive: true,
  },
  `smoke-interactive-${stamp}`
);
console.log("interactive sent:", interactive.guid);

const richLink = await client.sendApp(
  chat,
  {
    appId: "checkout",
    url: "https://apps.interactions.co.in/checkout",
    caption: "your order is ready",
    subcaption: "tap to check out",
    data: { order: "42" },
    interactive: false,
  },
  `smoke-richlink-${stamp}`
);
console.log("rich-link sent:", richLink.guid);

client.close();
