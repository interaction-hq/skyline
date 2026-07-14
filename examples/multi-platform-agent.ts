import { imessage, Skyline, terminal, whatsappBusiness } from "skyline-ts";

const projectId = process.env.SKYLINE_PROJECT_ID;
const projectSecret = process.env.SKYLINE_PROJECT_SECRET;

const app = await Skyline({
  projectId,
  projectSecret,
  providers: [
    ...(projectId && projectSecret
      ? [imessage.config(), whatsappBusiness.config()]
      : []),
    terminal.config({ prompt: "you> " }),
  ],
});

console.log("Multi-platform agent — ready:", [...app.ready]);

for await (const [channel, message] of app.incoming) {
  if (message.isFromMe || message.content.type !== "text") {
    continue;
  }

  console.log(
    `[${message.platform}] ${message.sender.id}: ${message.content.text}`
  );

  await channel.typing(true);
  await new Promise((r) => setTimeout(r, 500));
  await channel.typing(false);

  await channel.send(`Got it on ${message.platform}.`);
}
