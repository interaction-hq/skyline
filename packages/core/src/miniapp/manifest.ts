import type { Component, ComponentTemplate, Flow } from "./experience.js";

export type SymbolName = string;

export type ShipMode = "hosted" | "dedicated";

export type Rendering =
  | { kind: "web"; url: string }
  | { kind: "native"; native: NativeSpec }
  | { kind: "flow"; flow: Flow };

export interface NativeSpec {
  options: { id: string; label: string }[];
  prompt: string;
  style: "poll" | "menu" | "form";
}

export type BubbleSize = "small" | "medium" | "large" | "live";

export interface BubbleCaptions {
  caption?: string;
  imageSubtitle?: string;

  imageTitle?: string;
  subcaption?: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
}

export interface BubblePresentation extends BubbleCaptions {
  image?: string;

  interactive?: boolean;
  size: BubbleSize;

  summary?: string;
}

export interface Capabilities {
  expand?: boolean;

  httpHosts?: string[];
  receive?: boolean;
  send?: boolean;
}

export interface AppManifest {
  bubble: BubblePresentation;
  capabilities: Capabilities;
  id: string;
  mode: ShipMode;
  rendering: Rendering;
  subtitle?: string;
  symbol: SymbolName;
  title: string;
}

export interface AppInput {
  bubble?: Partial<BubblePresentation> & { size?: BubbleSize };
  capabilities?: Capabilities;
  id: string;

  mode?: ShipMode;
  rendering: Rendering;
  subtitle?: string;
  symbol: SymbolName;
  title: string;
}

export function defineApp(input: AppInput): AppManifest {
  if (!input.id) {
    throw new Error("app: id is required");
  }
  if (
    input.rendering.kind === "web" &&
    !input.rendering.url.startsWith("https://")
  ) {
    throw new Error("app: web rendering requires an https url");
  }

  return {
    bubble: {
      caption: input.bubble?.caption,
      image: input.bubble?.image,
      imageSubtitle: input.bubble?.imageSubtitle,
      imageTitle: input.bubble?.imageTitle,
      interactive: input.bubble?.interactive ?? true,
      size: input.bubble?.size ?? "small",
      subcaption: input.bubble?.subcaption,
      summary: input.bubble?.summary,
      trailingCaption: input.bubble?.trailingCaption,
      trailingSubcaption: input.bubble?.trailingSubcaption,
    },
    capabilities: {
      expand: input.capabilities?.expand ?? true,
      receive: input.capabilities?.receive ?? true,
      send: input.capabilities?.send ?? true,
    },
    id: input.id,
    mode: input.mode ?? "hosted",
    rendering: input.rendering,
    subtitle: input.subtitle,
    symbol: input.symbol,
    title: input.title,
  };
}

export interface Registry {
  apps: AppManifest[];

  templates?: Record<string, ComponentTemplate>;
  version: 1;
}

export function defineRegistry(
  apps: AppManifest[],
  templates?: Record<string, ComponentTemplate>
): Registry {
  return templates ? { apps, templates, version: 1 } : { apps, version: 1 };
}

export function expandTemplate(
  template: ComponentTemplate,
  props: Record<string, string>
): Component {
  const fill = (value: unknown): unknown => {
    if (typeof value === "string") {
      let out = value;
      for (const [key, replacement] of Object.entries(props)) {
        out = out.split(`{{${key}}}`).join(replacement);
      }
      return out.replace(/\{\{[^}]*\}\}/g, "");
    }
    if (Array.isArray(value)) {
      return value.map(fill);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, fill(v)])
      );
    }
    return value;
  };
  return fill(template) as Component;
}
