// Presets — use-cases built as arrangements of primitives, in TypeScript. Adding
// one costs zero native code and no app update: a preset is just a function that
// returns a `Component` tree of stacks/boxes/text/buttons that invoke the frozen
// capability set. This is where the platform's use-case breadth lives, and why
// the native runtime never has to grow.

import type { Component } from "./experience.js";

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
    component: {
      axis: "vertical",
      components: [
        {
          align: "center",
          style: "title",
          text: formatAmount(input.amount, input.currency),
          type: "text",
        },
        ...(input.note
          ? [
              {
                align: "center",
                style: "caption",
                text: input.note,
                type: "text",
              } as Component,
            ]
          : []),
        { height: 8, type: "spacer" },
        {
          action: {
            args: {
              amount: input.amount,
              currency: input.currency ?? "USD",
              provider,
              ...(input.note ? { note: input.note } : {}),
              ...(input.url ? { url: input.url } : {}),
            },
            kind: "capability",
            name: "pay",
          },
          label,
          style: "primary",
          type: "button",
        },
      ],
      spacing: 8,
      type: "stack",
    },
    style: { background: "#F2F2F7", cornerRadius: 16, padding: 20 },
    type: "box",
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
    component: {
      axis: "vertical",
      components: [
        ...(input.imageUrl
          ? [{ height: 140, type: "image", url: input.imageUrl } as Component]
          : []),
        { align: "leading", style: "title", text: input.title, type: "text" },
        ...(input.subtitle
          ? [
              {
                align: "leading",
                style: "caption",
                text: input.subtitle,
                type: "text",
              } as Component,
            ]
          : []),
      ],
      spacing: 4,
      type: "stack",
    },
    onTap: input.onTap,
    style: {
      background: input.accent ?? "#0A84FF",
      cornerRadius: 16,
      padding: 16,
    },
    type: "box",
  };
}

function formatAmount(amount: string, currency?: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) {
    return amount;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      currency: currency ?? "USD",
      style: "currency",
    }).format(value);
  } catch {
    return `${amount} ${currency ?? "USD"}`;
  }
}
