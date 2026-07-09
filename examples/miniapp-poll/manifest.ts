// The manifest for the poll app — declared once, consumed by the launcher and
// the transcript. Publish the output as a registry row and it appears in the
// Interactions launcher; no binary, no Apple account (hosted mode).

import { defineApp } from "@interactions-hq/skyline/app";

export const poll = defineApp({
  id: "lunch-poll",
  title: "Quick Poll",
  subtitle: "decide together",
  symbol: "checklist",
  mode: "hosted",
  rendering: {
    kind: "web",
    url: "https://apps.interactions.co.in/lunch-poll",
  },
  bubble: {
    size: "large",
    image: "https://apps.interactions.co.in/lunch-poll/card.png",
    imageTitle: "lunch friday?",
    imageSubtitle: "tap to vote",
    trailingCaption: "3 votes",
    summary: "Vote on lunch",
    interactive: true,
  },
});
