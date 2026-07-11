// Skyline apps — the browser runtime.
//
// This is the code a `web`-mode app imports and runs *inside* the Interactions
// shell's WebView. It's the typed surface over the native bridge
// (`window.interactions`, a WKScriptMessageHandler). The shell brokers every
// privileged action — web content never touches Messages APIs directly, which
// keeps apps within App Store policy. Bridge calls are in-process (no network),
// so they stay well inside the platform latency budget.

import type { BubbleSize } from "./manifest";

/** The environment an app is running in. */
export interface AppContext {
  /** Registry id of this app. */
  appId: string;
  /** Always "imessage" today; reserved for future hosts. */
  platform: "imessage";
  /** Display title as configured in the manifest. */
  title: string;
}

/** A bubble the mini-app asks the shell to compose into the conversation. */
export interface OutgoingMessage {
  /** Primary line shown on the bubble (top-left, bold). */
  caption: string;
  /**
   * App data round-tripped in the bubble URL. The recipient's mini-app reads it
   * back via the `message` event. Values are strings (URL-query friendly).
   */
  data?: Record<string, string>;
  /** Secondary line, below the caption. */
  subcaption?: string;
  /** Fallback text for notifications / lock screen. Defaults to the caption. */
  summary?: string;
  /** Top-right caption. */
  trailingCaption?: string;
  /** Right, below the trailing caption. */
  trailingSubcaption?: string;
}

/**
 * An in-place update to the mini-app's own live bubble — replaces the delivered
 * bubble rather than posting a new one. Use for live sessions (a game move
 * redrawing the board, an order status changing after delivery). Mirrors
 * `OutgoingMessage`; the shell keeps the bubble on the same message session.
 */
export type BubbleUpdate = OutgoingMessage;

/** Presentation styles the shell can switch to. */
export type PresentationStyle = "compact" | "expanded";

/** Payload delivered when a related bubble arrives (e.g. the peer's reply). */
export type IncomingMessage = Record<string, string>;

/** Events the shell emits to the app. */
export interface AppEvents {
  /** A related bubble (same app) arrived in the conversation. */
  message: IncomingMessage;
  /** The presentation style changed. */
  presentation: { style: PresentationStyle };
}

/** The native bridge shape injected as `window.interactions`. */
interface NativeBridge {
  _emit(name: string, detail: unknown): void;
  close(): void;
  context: AppContext;
  getContext(): AppContext;
  ready(): void;
  requestPresentation(style: PresentationStyle): void;
  sendMessage(message: OutgoingMessage): void;
  updateBubble(update: BubbleUpdate): void;
}

// This module targets the browser (it runs inside the shell's WebView), but the
// SDK as a whole is built for Node/Bun. Rather than pull the entire DOM lib into
// the SDK's typecheck (which would mask Bun's `Request`/`Response` etc.), declare
// the small browser surface this runtime actually uses.
interface AppWindow {
  addEventListener(type: string, listener: (event: AppEvent) => void): void;
  interactions?: NativeBridge;
}
interface AppEvent {
  detail?: unknown;
}
declare const window: AppWindow | undefined;

type Listener = (detail: unknown) => void;

class AppRuntime {
  private listeners = new Map<keyof AppEvents, Set<Listener>>();

  constructor() {
    this.bindNativeEvents();
  }

  /** True when running inside the native Interactions shell. */
  get isEmbedded(): boolean {
    return typeof window !== "undefined" && !!window.interactions;
  }

  /** Signal load complete; the shell hides its spinner. Call once, last. */
  ready(): void {
    this.bridge?.ready();
  }

  /** The current app context (id, title, platform). */
  getContext(): AppContext {
    if (this.bridge) {
      return this.bridge.getContext();
    }
    return { appId: "dev", platform: "imessage", title: "Dev App" };
  }

  /**
   * Compose a bubble into the conversation. In the shell it is staged into the
   * input field for the user to send (the standard iMessage compose contract).
   */
  sendMessage(message: OutgoingMessage): void {
    if (this.bridge) {
      this.bridge.sendMessage(message);
    } else {
      console.info("[skyline/app] sendMessage (dev):", message);
    }
  }

  /**
   * Replace this app's own live bubble in place instead of posting a new one —
   * for live sessions (a game move, a changing order status). No-op in a plain
   * browser (logged).
   */
  updateBubble(update: BubbleUpdate): void {
    if (this.bridge) {
      this.bridge.updateBubble(update);
    } else {
      console.info("[skyline/app] updateBubble (dev):", update);
    }
  }

  /** Ask the shell to expand or collapse the app sheet. */
  requestPresentation(style: PresentationStyle): void {
    if (this.bridge) {
      this.bridge.requestPresentation(style);
    } else {
      console.info("[skyline/app] requestPresentation (dev):", style);
    }
  }

  /** Dismiss the app back to the launcher. */
  close(): void {
    this.bridge?.close();
  }

  /** Subscribe to a shell event. Returns an unsubscribe function. */
  on<K extends keyof AppEvents>(
    event: K,
    handler: (detail: AppEvents[K]) => void
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const listener = handler as Listener;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  private get bridge(): NativeBridge | undefined {
    return typeof window === "undefined" ? undefined : window.interactions;
  }

  private bindNativeEvents(): void {
    const win = typeof window === "undefined" ? undefined : window;
    if (!win) {
      return;
    }
    const forward = <K extends keyof AppEvents>(name: K) => {
      win.addEventListener(`interactions:${name}`, (event) => {
        const detail = event.detail as AppEvents[K];
        const handlers = this.listeners.get(name);
        if (handlers) {
          for (const h of handlers) {
            h(detail);
          }
        }
      });
    };
    forward("message");
    forward("presentation");
  }
}

/**
 * The app runtime singleton. Import and use inside your `web`-mode app:
 *
 * ```ts
 * import { app } from "skyline-ts/app";
 * app.sendMessage({ caption: "voted: tacos", data: { choice: "tacos" } });
 * app.ready();
 * ```
 */
export const app = new AppRuntime();

/** Re-export so an app can reference the bubble size it configured. */
export type { BubbleSize };
