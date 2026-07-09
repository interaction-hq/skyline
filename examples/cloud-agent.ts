import { imessage, Skyline } from "skyline-ts";

const projectId = process.env.SKYLINE_PROJECT_ID;
const projectSecret = process.env.SKYLINE_PROJECT_SECRET;

if (!(projectId && projectSecret)) {
  console.error("Set SKYLINE_PROJECT_ID and SKYLINE_PROJECT_SECRET");
  process.exit(1);
}

const app = await Skyline({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

console.log("Skyline iMessage agent — waiting for messages…");
console.log("Ready lines:", [...app.ready].join(", ") || "(connecting…)");

app.on("reaction", (r) =>
  console.log(`${r.sender.id} ${r.removed ? "removed" : "added"} ${r.reaction}`)
);
app.on("typing", (t) =>
  console.log(`${t.sender.id} ${t.typing ? "typing…" : "stopped"}`)
);

for await (const [channel, message] of app.incoming) {
  if (message.isFromMe || message.content.type !== "text") {
    continue;
  }

  console.log(`[imessage] ${message.sender.id}: ${message.content.text}`);

  await channel.read();
  if (message.guid) {
    await channel.react(message.guid, "like");
  }

  await channel.typing(true);
  await new Promise((r) => setTimeout(r, 600));
  await channel.typing(false);

  if (message.guid) {
    await channel.reply(message.guid, "Got it — on it now.");
  } else {
    await channel.send("Got it — on it now.");
  }
}
