import type { BubbleSize } from "./manifest.js";

export interface AppContext {
  appId: string;

  platform: "imessage";

  title: string;
}

export interface OutgoingMessage {
  caption: string;

  data?: Record<string, string>;

  subcaption?: string;

  summary?: string;

  trailingCaption?: string;

  trailingSubcaption?: string;
}

export type BubbleUpdate = OutgoingMessage;

export type PresentationStyle = "compact" | "expanded";

export type IncomingMessage = Record<string, string>;

export interface AppEvents {
  message: IncomingMessage;

  presentation: { style: PresentationStyle };
}

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

  get isEmbedded(): boolean {
    return typeof window !== "undefined" && !!window.interactions;
  }

  ready(): void {
    this.bridge?.ready();
  }

  getContext(): AppContext {
    if (this.bridge) {
      return this.bridge.getContext();
    }
    return { appId: "dev", platform: "imessage", title: "Dev App" };
  }

  sendMessage(message: OutgoingMessage): void {
    if (this.bridge) {
      this.bridge.sendMessage(message);
    } else {
      console.info("[skyline/app] sendMessage (dev):", message);
    }
  }

  updateBubble(update: BubbleUpdate): void {
    if (this.bridge) {
      this.bridge.updateBubble(update);
    } else {
      console.info("[skyline/app] updateBubble (dev):", update);
    }
  }

  requestPresentation(style: PresentationStyle): void {
    if (this.bridge) {
      this.bridge.requestPresentation(style);
    } else {
      console.info("[skyline/app] requestPresentation (dev):", style);
    }
  }

  close(): void {
    this.bridge?.close();
  }

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

export const app = new AppRuntime();

export type { BubbleSize };
