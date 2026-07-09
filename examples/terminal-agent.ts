import { Skyline, terminal } from "@interactions-hq/skyline";

const app = await Skyline({
  providers: [terminal.config({ prompt: "you> " })],
});

console.log("Skyline terminal agent — type a message, Ctrl+C to exit.");
console.log("Ready:", [...app.ready].join(", "));

for await (const [channel, message] of app.incoming) {
  if (message.isFromMe || message.content.type !== "text") continue;

  await channel.typing(true);
  await new Promise((r) => setTimeout(r, 400));
  await channel.typing(false);

  if (message.guid) {
    await channel.reply(message.guid, `echo: ${message.content.text}`);
  } else {
    await channel.send(`echo: ${message.content.text}`);
  }
}
