import { PLATFORM_SESSION_BASE } from "./platform.js";

export interface SessionSnapshot {
  values: Record<string, string>;
  version: number;
}

export interface LiveSessionOptions {
  intervalMs?: number;
}

export class LiveSession {
  private readonly base: string;
  private readonly intervalMs: number;
  private version = 0;

  constructor(
    readonly id: string,
    opts: LiveSessionOptions = {}
  ) {
    this.base = PLATFORM_SESSION_BASE.replace(/\/+$/, "");
    this.intervalMs = opts.intervalMs ?? 2000;
  }

  async publish(
    values: Record<string, string>,
    participant?: string
  ): Promise<void> {
    await fetch(`${this.base}/${encodeURIComponent(this.id)}/publish`, {
      body: JSON.stringify({ participant: participant ?? "", values }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  async state(): Promise<SessionSnapshot> {
    const res = await fetch(
      `${this.base}/${encodeURIComponent(this.id)}/state?since=0`
    );
    const snapshot = (await res.json()) as SessionSnapshot;
    this.version = snapshot.version;
    return snapshot;
  }

  watch(onChange: (snapshot: SessionSnapshot) => void): () => void {
    let stopped = false;
    const tick = async () => {
      if (stopped) {
        return;
      }
      try {
        const res = await fetch(
          `${this.base}/${encodeURIComponent(this.id)}/state?since=${this.version}`
        );
        const snapshot = (await res.json()) as SessionSnapshot;
        if (snapshot.version > this.version) {
          this.version = snapshot.version;
          onChange(snapshot);
        }
      } catch {}
      if (!stopped) {
        setTimeout(tick, this.intervalMs);
      }
    };
    void tick();
    return () => {
      stopped = true;
    };
  }
}

export function session(id: string, opts?: LiveSessionOptions): LiveSession {
  return new LiveSession(id, opts);
}
