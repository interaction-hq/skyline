// Skyline apps — the declarative manifest.
//
// An app is something a company builds once and ships into iMessage through
// Interactions. `defineApp` produces a typed manifest that both the launcher
// (how it's discovered) and the transcript (how its bubble renders) consume.

import type { Component, ComponentTemplate, Flow } from "./experience.js";

/** SF Symbol name used as the launcher/tile glyph, e.g. "chart.bar.fill". */
export type SymbolName = string;

/**
 * How an app is delivered and who owns the runtime.
 *
 * - `hosted` — the company ships a web app or a declarative flow as content
 *   inside the Interactions app. No Apple account, no binary: publish a URL or
 *   manifest row and it appears in every user's launcher.
 * - `dedicated` — the company brings its own Apple Developer account and ships a
 *   native iMessage app on the Interactions template (e.g. to embed their own AI
 *   agent). Interactions is the tooling + pipeline; they control the runtime.
 */
export type ShipMode = "hosted" | "dedicated";

/** How the app renders its interactive surface when opened. */
export type Rendering =
  | { kind: "web"; url: string }
  | { kind: "native"; native: NativeSpec }
  | { kind: "flow"; flow: Flow };

/** The `native` mode: prompt + options, drawn natively (poll / menu / form). */
export interface NativeSpec {
  options: { id: string; label: string }[];
  prompt: string;
  style: "poll" | "menu" | "form";
}

/**
 * Transcript bubble size. Larger sizes carry artwork (real or a generated
 * banner), which drives the rendered height.
 */
export type BubbleSize = "small" | "medium" | "large" | "live";

/**
 * The caption slots iMessage draws on a bubble, mirroring Apple's
 * `MSMessageTemplateLayout`. All optional; the app title/subtitle default
 * `caption`/`subcaption` when omitted.
 */
export interface BubbleCaptions {
  caption?: string;
  imageSubtitle?: string;
  /** Drawn over the artwork (requires an image). */
  imageTitle?: string;
  subcaption?: string;
  trailingCaption?: string;
  trailingSubcaption?: string;
}

export interface BubblePresentation extends BubbleCaptions {
  /**
   * Optional https artwork for sized bubbles. When omitted the shell generates a
   * gradient banner from the icon + title, so a bubble always looks intentional
   * with zero required assets.
   */
  image?: string;
  /**
   * When `false`, the bubble always shows the static caption card instead of
   * opening the live app on tap. Defaults to `true`.
   */
  interactive?: boolean;
  size: BubbleSize;
  /** Fallback text for surfaces that can't render the card. Defaults to caption. */
  summary?: string;
}

/** Capabilities an app declares it needs; the shell gates on these. */
export interface Capabilities {
  expand?: boolean;
  /**
   * Hosts the app's `http` capability may call. The shell rejects any request to
   * a host not on this list, so a signed manifest bounds the app's reach — the
   * universal integration hatch without an open-ended egress.
   */
  httpHosts?: string[];
  receive?: boolean;
  send?: boolean;
}

/** The full declarative description of an app. */
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

/** What a client passes to `defineApp` — sensible defaults fill the rest. */
export interface AppInput {
  /** Defaults to `{ size: "small" }`. */
  bubble?: Partial<BubblePresentation> & { size?: BubbleSize };
  capabilities?: Capabilities;
  id: string;
  /** Defaults to `hosted`. */
  mode?: ShipMode;
  rendering: Rendering;
  subtitle?: string;
  symbol: SymbolName;
  title: string;
}

/**
 * Author an app manifest with defaults applied and light validation. The one
 * place a company declares how their app is discovered and rendered.
 */
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

/** A versioned registry document — the wire shape the shell fetches. */
export interface Registry {
  apps: AppManifest[];
  /**
   * Named component templates a `use` component expands on device. Each is a
   * primitive tree whose string leaves may carry `{{token}}` placeholders. This
   * is how a client adds a new "component" without an app build: publish it here
   * in the signed registry and reference it with `{ type: "use", template }`.
   */
  templates?: Record<string, ComponentTemplate>;
  version: 1;
}

/** Assemble a registry document from manifests (for hosting as JSON). */
export function defineRegistry(
  apps: AppManifest[],
  templates?: Record<string, ComponentTemplate>
): Registry {
  return templates ? { apps, templates, version: 1 } : { apps, version: 1 };
}

/**
 * Expand a `{{token}}` template tree against props — the same substitution the
 * device runs, exposed so an agent can inline a template into a flow it sends
 * (inline flows don't carry the registry). Missing tokens collapse to empty.
 */
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
