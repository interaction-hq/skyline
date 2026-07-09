// The manifest for the poll app — declared once, consumed by the launcher and
// the transcript. Publish the output as a registry row and it appears in the
// Interactions launcher; no binary, no Apple account (hosted mode).

import { defineApp } from "skyline-ts/app";

export const poll = defineApp({
  bubble: {
    image: "https://apps.interactions.co.in/lunch-poll/card.png",
    imageSubtitle: "tap to vote",
    imageTitle: "lunch friday?",
    interactive: true,
    size: "large",
    summary: "Vote on lunch",
    trailingCaption: "3 votes",
  },
  id: "lunch-poll",
  mode: "hosted",
  rendering: {
    kind: "web",
    url: "https://apps.interactions.co.in/lunch-poll",
  },
  subtitle: "decide together",
  symbol: "checklist",
  title: "Quick Poll",
});
