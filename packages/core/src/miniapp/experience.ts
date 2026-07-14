export type TextStyle = "title" | "subtitle" | "body" | "caption";
export type TextAlign = "leading" | "center" | "trailing";

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

      then?: string;
    };

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

export interface Option {
  detail?: string;
  id: string;
  label: string;
}

export type PaymentProvider = "appleCash" | "link";

export type Component =
  | {
      type: "stack";
      axis?: "vertical" | "horizontal";
      spacing?: number;
      style?: Style;
      components: Component[];
    }
  | { type: "box"; style?: Style; onTap?: string; component?: Component }
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

      amount: string;
      currency?: string;
      note?: string;
      payeeLabel?: string;

      url?: string;

      onPay?: string;
    }
  | { type: "divider" }
  | { type: "spacer"; height?: number }
  | { type: "group"; title?: string; components: Component[] }
  | {
      type: "options";
      key: string;
      options: Option[];
      prompt?: string;
      multiple?: boolean;
      render?: "buttons" | "list";

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

      pattern?: string;

      error?: string;
    }
  | { type: "toggle"; key: string; label: string; defaultOn?: boolean }
  | {
      type: "button";
      label: string;
      action: Action;
      style?: "primary" | "secondary" | "destructive";
      size?: "small" | "medium" | "large";

      icon?: string;
    }
  | {
      type: "use";

      template: string;

      props?: Record<string, string>;
    };

export type ComponentTemplate = Component;

export interface Screen {
  components: Component[];
  id: string;
  title?: string;
}

export interface FlowTheme {
  accent?: string;
  size?: "compact" | "expanded";
}

export interface Flow {
  screens: Screen[];

  start?: string;
  theme?: FlowTheme;
}

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

export type FlowState = Record<string, string>;
