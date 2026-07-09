// A live agent that uses the full channel surface: typing indicators, reactions,
// replies, screen effects, read receipts, and the non-message signal feed. One
// `channel` object, every action — the same code reaches any platform.
//
// Run (dedicated line, dev server over Tailscale):
//   MINI=100.120.138.80:50051 LINE=+918527438574 bun examples/unified-agent.ts

import { imessage, Skyline } from "@interactions-hq/skyline";

const app = await Skyline({
  providers: [
    imessage.config({
      lines: [
        {
          address: process.env.MINI ?? "100.120.138.80:50051",
          phone: process.env.LINE ?? "+918527438574",
          token: process.env.TOKEN ?? "",
        },
      ],
    }),
  ],
});

console.log("live on", [...app.ready]);

// Non-message signals ride their own feed. Subscribe to the ones you care about.
app.on("reaction", (r) =>
  console.log(`${r.sender.id} ${r.removed ? "removed" : "added"} ${r.reaction}`)
);
app.on("typing", (t) =>
  console.log(`${t.sender.id} ${t.typing ? "typing…" : "stopped"}`)
);
app.on("read", (r) => console.log(`${r.sender.id} read the chat`));
app.on("error", (e) =>
  console.error(`send failed on ${e.to}: ${e.code} ${e.message}`)
);

for await (const [channel, msg] of app.incoming) {
  if (msg.isFromMe || msg.content.type !== "text") {
    continue;
  }
  const body = msg.content.text.toLowerCase();

  // Clear their unread badge, then acknowledge with a tapback on their message.
  await channel.read();
  if (msg.guid) {
    await channel.react(msg.guid, body.includes("thanks") ? "love" : "like");
  }

  // A human-feeling reply: show typing, wait a beat, then send.
  await channel.typing(true);
  await new Promise((r) => setTimeout(r, 900));
  await channel.typing(false);

  if (body.includes("party") || body.includes("congrats")) {
    await channel.send("let's go", { effect: "confetti" });
  } else if (msg.guid) {
    // Thread the reply directly off their message.
    await channel.reply(msg.guid, "got it — on it now");
  } else {
    await channel.send("got it — on it now");
  }
}
