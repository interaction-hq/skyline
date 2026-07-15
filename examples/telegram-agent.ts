import { keyboard, Skyline, telegram } from "skyline-ts";

const app = await Skyline({
  projectId: process.env.SKYLINE_PROJECT_ID,
  projectSecret: process.env.SKYLINE_PROJECT_SECRET,
  providers: [telegram.config({ botToken: process.env.TELEGRAM_BOT_TOKEN! })],
});

console.log("Telegram agent — ready:", [...app.ready]);

app.on("callback", async (signal, chat) => {
  await chat.answerCallback(signal.queryId, { text: "Got it" });
});

for await (const [chat, message] of app.incoming) {
  if (message.systemEvent) {
    console.log(`[system] ${message.systemEvent.type}`);
    continue;
  }
  if (message.isFromMe || message.content.type !== "text") {
    continue;
  }

  console.log(`${message.sender.id}: ${message.content.text}`);

  await chat.send(
    keyboard({
      text: `You said: ${message.content.text}`,
      buttons: [[{ text: "👍", callbackData: "ok" }]],
    })
  );
}
