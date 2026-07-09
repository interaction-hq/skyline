// Presets — use-cases built as arrangements of primitives, in TypeScript. Adding
// one costs zero native code and no app update: a preset is just a function that
// returns a `Component` tree of stacks/boxes/text/buttons that invoke the frozen
// capability set. This is where the platform's use-case breadth lives, and why
// the native runtime never has to grow.

import type { Component } from "./experience";

/** A payment card built from primitives + the `pay` capability. */
export function paymentCard(input: {
  amount: string;
  currency?: string;
  note?: string;
  provider?: "appleCash" | "link";
  /** Hosted-checkout URL for the `link` provider. */
  url?: string;
  accent?: string;
}): Component {
  const provider = input.provider ?? "appleCash";
  const label = provider === "appleCash" ? "Pay with Apple Cash" : "Pay";
  return {
    type: "box",
    style: { background: "#F2F2F7", cornerRadius: 16, padding: 20 },
    component: {
      type: "stack",
      axis: "vertical",
      spacing: 8,
      components: [
        { type: "text", text: formatAmount(input.amount, input.currency), style: "title", align: "center" },
        ...(input.note ? [{ type: "text", text: input.note, style: "caption", align: "center" } as Component] : []),
        { type: "spacer", height: 8 },
        {
          type: "button",
          label,
          style: "primary",
          action: {
            kind: "capability",
            name: "pay",
            args: {
              provider,
              amount: input.amount,
              currency: input.currency ?? "USD",
              ...(input.note ? { note: input.note } : {}),
              ...(input.url ? { url: input.url } : {}),
            },
          },
        },
      ],
    },
  };
}

/** A hero card (artwork + title/subtitle) built from a styled box + stack. */
export function heroCard(input: {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  accent?: string;
  onTap?: string;
}): Component {
  return {
    type: "box",
    style: { background: input.accent ?? "#0A84FF", cornerRadius: 16, padding: 16 },
    onTap: input.onTap,
    component: {
      type: "stack",
      axis: "vertical",
      spacing: 4,
      components: [
        ...(input.imageUrl ? [{ type: "image", url: input.imageUrl, height: 140 } as Component] : []),
        { type: "text", text: input.title, style: "title", align: "leading" },
        ...(input.subtitle ? [{ type: "text", text: input.subtitle, style: "caption", align: "leading" } as Component] : []),
      ],
    },
  };
}

function formatAmount(amount: string, currency?: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) {
    return amount;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(value);
  } catch {
    return `${amount} ${currency ?? "USD"}`;
  }
}
