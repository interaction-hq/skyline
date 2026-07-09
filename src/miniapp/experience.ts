// Skyline flows — the declarative screen-graph runtime, the `flow` render mode.
//
// A Flow is a small, fixed vocabulary of components, inputs, layout primitives,
// media, and *declared* actions. The iMessage shell ships one interpreter that
// renders any Flow from data; no client code runs on device. This is how a client
// builds a bespoke interaction with no native build, and how an AI agent composes
// a screen at runtime and drives it server-side.
//
// The same shape is used two ways:
// - Prebaked: many `screens`; the shell walks them locally via next/back.
// - Server-driven: one screen; on submit the agent reads the state and sends the
//   next screen (`space.send(flow(...))`). Both are Apple-compliant — the device
//   only ever interprets declarative data, never downloaded logic.

/** Text ramp for a text component. */
export type TextStyle = "title" | "subtitle" | "body" | "caption";
export type TextAlign = "leading" | "center" | "trailing";

/**
 * A native capability — the bounded set of OS-level verbs the shell brokers.
 * New use-cases and integrations are expressed by *invoking* these with data,
 * never by adding native code. `http` is the universal integration hatch (POST
 * to a client-declared, allowlisted endpoint).
 */
export type CapabilityName =
  | "send"
  | "pay"
  | "pickDate"
  | "location"
  | "camera"
  | "contact"
  | "share"
  | "notify"
  | "session"
  | "http";

/** A declared action a button or auto-select fires. Closed set — no client logic. */
export type Action =
  | { kind: "next"; screen: string }
  | { kind: "back" }
  | { kind: "submit"; screen?: string }
  | { kind: "open"; url: string }
  | { kind: "pay"; screen?: string }
  | {
      kind: "capability";
      name: CapabilityName;
      args?: Record<string, string>;
      /** Screen to advance to after the capability resolves. */
      then?: string;
    };

/**
 * A visual style for primitives. Presets (payment card, boarding pass, deck) are
 * styled arrangements of primitives — the native runtime never grows per case.
 */
export interface Style {
  align?: TextAlign;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  color?: string;
  cornerRadius?: number;
  fontSize?: number;
  fontWeight?: "regular" | "medium" | "semibold" | "bold";
  height?: number;
  padding?: number;
  paddingBottom?: number;
  paddingLeading?: number;
  paddingTop?: number;
  paddingTrailing?: number;
  width?: number;
}

/** One selectable option in an `options` component. */
export interface Option {
  detail?: string;
  id: string;
  label: string;
}

/** Payment rails a `payment` component can request. More added over time. */
export type PaymentProvider = "appleCash" | "link";

/** The component vocabulary. `type` is the discriminator. */
export type Component =
  // Primitives — the frozen layout vocabulary everything composes from.
  | {
      type: "stack";
      axis?: "vertical" | "horizontal";
      spacing?: number;
      style?: Style;
      components: Component[];
    }
  | { type: "box"; style?: Style; onTap?: string; component?: Component }
  // Display
  | {
      type: "text";
      text: string;
      style?: TextStyle;
      align?: TextAlign;
      box?: Style;
    }
  | {
      type: "image";
      url: string;
      height?: number;
      mode?: "fit" | "fill";
      box?: Style;
    }
  | {
      type: "payment";
      provider?: PaymentProvider;
      /** Minor-unit-safe decimal string, e.g. "166.89". */
      amount: string;
      currency?: string;
      note?: string;
      payeeLabel?: string;
      /** Hosted-checkout URL for `link` providers. */
      url?: string;
      /** Action id fired after the user confirms. */
      onPay?: string;
    }
  | { type: "divider" }
  | { type: "spacer"; height?: number }
  | { type: "group"; title?: string; components: Component[] }
  // Inputs (each binds to a `key` in the experience state)
  | {
      type: "options";
      key: string;
      options: Option[];
      prompt?: string;
      multiple?: boolean;
      render?: "buttons" | "list";
      /** Single-select only: tapping fires this action id (a screen id or "submit"). */
      onSelect?: string;
    }
  | {
      type: "textInput";
      key: string;
      label?: string;
      placeholder?: string;
      keyboard?: "default" | "email" | "number" | "phone" | "url";
      multiline?: boolean;
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      /** Named preset ("email" | "phone" | "url" | "number") or a raw regex. */
      pattern?: string;
      /** Message shown when validation fails. */
      error?: string;
    }
  | { type: "toggle"; key: string; label: string; defaultOn?: boolean }
  // Buttons
  | {
      type: "button";
      label: string;
      action: Action;
      style?: "primary" | "secondary" | "destructive";
      size?: "small" | "medium" | "large";
      /** Optional leading SF Symbol name. */
      icon?: string;
    }
  // Template reference — expands a registry-defined component tree at render time.
  | {
      type: "use";
      /** Name of a template published in the signed registry `templates` map. */
      template: string;
      /** Values substituted into the template's `{{token}}` placeholders. */
      props?: Record<string, string>;
    };

/**
 * A named component template: a primitive tree carrying `{{token}}` placeholders.
 * Published in the registry so a `use` component can expand it on device — a new
 * component ships as signed data, no app build. Authored as a normal component
 * tree; string leaves may contain `{{token}}` markers filled from `use.props`.
 */
export type ComponentTemplate = Component;

/** A single rendered screen. */
export interface Screen {
  components: Component[];
  id: string;
  title?: string;
}

export interface FlowTheme {
  /** Accent as "#RRGGBB". */
  accent?: string;
  size?: "compact" | "expanded";
}

/** A complete declarative screen graph — the `flow` render mode of an app. */
export interface Flow {
  screens: Screen[];
  /** Screen shown first; defaults to the first screen. */
  start?: string;
  theme?: FlowTheme;
}

/**
 * Author a flow with light validation. Use for a flow a client ships in the
 * registry, or build one inline in an agent and send it via `app(...)`.
 */
export function defineFlow(flow: Flow): Flow {
  if (!flow.screens?.length) {
    throw new Error("flow: at least one screen is required");
  }
  const ids = new Set<string>();
  for (const s of flow.screens) {
    if (!s.id) {
      throw new Error("flow: every screen needs an id");
    }
    if (ids.has(s.id)) {
      throw new Error(`flow: duplicate screen id "${s.id}"`);
    }
    ids.add(s.id);
  }
  if (flow.start && !ids.has(flow.start)) {
    throw new Error(`flow: start "${flow.start}" is not a screen id`);
  }
  const target = (screen: string) => {
    if (screen !== "submit" && !ids.has(screen)) {
      throw new Error(`flow: action targets missing screen "${screen}"`);
    }
  };
  const check = (c: Component): void => {
    switch (c.type) {
      case "button":
        if (c.action.kind === "next") {
          target(c.action.screen);
        }
        if (
          (c.action.kind === "submit" || c.action.kind === "pay") &&
          c.action.screen
        ) {
          target(c.action.screen);
        }
        if (c.action.kind === "capability" && c.action.then) {
          target(c.action.then);
        }
        break;
      case "options":
        if (c.onSelect) {
          target(c.onSelect);
        }
        break;
      case "payment":
        if (c.provider === "link" && !c.url) {
          throw new Error(
            "flow: payment provider 'link' requires a checkout url"
          );
        }
        break;
      case "stack":
        c.components.forEach(check);
        break;
      case "box":
        if (c.component) {
          check(c.component);
        }
        break;
      case "group":
        c.components.forEach(check);
        break;
      default:
        break;
    }
  };
  for (const s of flow.screens) {
    s.components.forEach(check);
  }
  return flow;
}

/**
 * The collected input values from a submitted flow, keyed by each input's `key`.
 * Values are strings on the wire (multi-select comma-joined, toggles "true"/
 * "false", dates ISO-8601). Agents read this to decide the next screen.
 */
export type FlowState = Record<string, string>;
