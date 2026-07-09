// Receive app data — what the user did in the app comes back to your agent.
//
// When someone taps "Send to chat" in an app (e.g. the counter), the state they
// produced rides back in the bubble. Skyline decodes it and hands you a
// `type: "app"` message with the app id and the app's `data`. This is the only
// moment data flows back — iMessage transmits on send, not on idle taps.
//
// It also shows the *server-driven flow loop*: an agent sends a declarative
// screen, the user submits, the agent reads the state and sends the next screen —
// deciding the flow autonomously. The device only ever renders declarative data.
//
// Run (dedicated line, dev server over Tailscale):
//   MINI=100.120.138.80:50051 LINE=+918527438574 bun examples/miniapp-receive.ts

import { flow, imessage, readState, Skyline } from "@interactions-hq/skyline";

const app = await Skyline({
  providers: [
    imessage.config({
      lines: [
        {
          address: process.env.MINI ?? "100.120.138.80:50051",
          phone: process.env.LINE ?? "+918527438574",
          // Empty token: a dev/open server (no AUTH_PUBLIC_KEY_PATH) scopes to
          // the local identity. A production line carries a real token.
          token: process.env.TOKEN ?? "",
        },
      ],
    }),
  ],
});

console.log("listening for app data on", [...app.ready]);

for await (const [channel, msg] of app.incoming) {
  if (msg.isFromMe) {
    continue;
  }
  switch (msg.content.type) {
    case "app": {
      const { appId, data, caption } = msg.content;
      console.log("app received:", { appId, caption, data });

      // React to what the user did.
      if (appId === "counter") {
        const count = Number(data.count ?? "0");
        await channel.send(
          count < 0
            ? `whoa, ${count}? going backwards i see`
            : `got it — counter's at ${count}`
        );
      } else if (appId === "booking") {
        // Multi-step flow: each step arrives as its own event carrying the
        // answers so far. Only act once the flow is complete (`done` marker),
        // reading `answer.<stepId>` fields.
        if (data.done === "1") {
          const day = data["answer.day"];
          const time = data["answer.time"];
          const confirmed = data["answer.confirm"] === "yes";
          await channel.send(
            confirmed
              ? `booked — ${day} ${time}. see you then`
              : "no worries, ping me when you want to reschedule"
          );
        }
      }
      break;
    }
    case "flow": {
      // Server-driven flow: each submission arrives with the collected `state`.
      // The agent decides the next screen and sends it — the phone never runs
      // client logic, it only renders the declarative screen we send.
      const { state, done, payment } = msg.content;
      // Group attribution: in a group chat, `msg.group.participant` is who acted.
      const who = msg.group?.isGroup ? msg.group.participant.id : msg.sender.id;
      // Typed reads over the string wire — no manual coercion.
      const s = readState(state);
      console.log("flow submission:", {
        done,
        extras: s.list("extras"),
        from: who,
        payment,
        qty: s.number("qty"),
        size: s.string("size"),
      });

      // A confirmed payment step lands with a receipt — advance the order.
      if (payment?.paid) {
        await channel.send(
          `payment confirmed — ${payment.amount} ${payment.currency} via ${payment.provider}`
        );
        break;
      }

      if (done) {
        await channel.send(`all set — ${summarize(state)}`);
        break;
      }

      // Branch on what they picked and compose the next screen on the fly.
      if (state.reason) {
        await channel.send(
          flow({
            caption: "last step",
            data: state,
            flow: {
              screens: [
                {
                  components: [
                    {
                      action: { kind: "submit" },
                      label: "Confirm",
                      style: "primary",
                      type: "button",
                    },
                  ],
                  id: "confirm",
                  title: `Great — a ${state.reason} chat. Confirm?`,
                },
              ],
            },
          })
        );
      } else {
        await channel.send(
          flow({
            caption: "one more thing",
            data: state,
            flow: {
              screens: [
                {
                  components: [
                    {
                      key: "reason",
                      onSelect: "submit",
                      options: [
                        { id: "sales", label: "Sales" },
                        { id: "support", label: "Support" },
                        { id: "other", label: "Something else" },
                      ],
                      type: "options",
                    },
                  ],
                  id: "why",
                  title: "What's it about?",
                },
              ],
            },
          })
        );
      }
      break;
    }
    case "text": {
      console.log("text received:", msg.content.text);
      break;
    }
    default: {
      const _exhaustive: never = msg.content;
      throw new Error(`unhandled content: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function summarize(state: Record<string, string>): string {
  return Object.entries(state)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}
