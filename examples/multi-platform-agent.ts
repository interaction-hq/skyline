import {
  imessage,
  Skyline,
  terminal,
  whatsappBusiness,
} from "@interactions-hq/skyline";

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

for await (const [space, message] of app.messages) {
  if (message.isFromMe || message.content.type !== "text") {
    continue;
  }

  console.log(
    `[${message.platform}] ${message.sender.id}: ${message.content.text}`
  );

  await space.typing(true);
  await new Promise((r) => setTimeout(r, 500));
  await space.typing(false);

  await space.send(`Got it on ${message.platform}.`);
}
