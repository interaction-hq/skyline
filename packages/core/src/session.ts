// Live sessions — shared, versioned state across everyone in a group experience.
//
// A session is a small key/value document at a hosted store. Each participant's
// on-device shell publishes contributions and observes a merged view; an agent
// can read and drive the same session from the server (compute a result once the
// group finishes voting, then broadcast the next screen per participant).
//
// This client mirrors the shell's SessionSync wire contract:
//   POST  {base}/{id}/publish  { participant, values }
//   GET   {base}/{id}/state?since=<version>  -> { version, values }
// so agents and devices share one source of truth.

import { PLATFORM_SESSION_BASE } from "./platform.js";

/** A merged session snapshot: monotonically increasing `version` + values. */
export interface SessionSnapshot {
  values: Record<string, string>;
  version: number;
}

export interface LiveSessionOptions {
  /** Poll cadence for `watch()`, in ms. */
  intervalMs?: number;
}

/** A handle to one shared session, addressable by id from every participant. */
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

  /** Merge values into the shared session, attributed to `participant`. */
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

  /** Fetch the current merged snapshot. */
  async state(): Promise<SessionSnapshot> {
    const res = await fetch(
      `${this.base}/${encodeURIComponent(this.id)}/state?since=0`
    );
    const snapshot = (await res.json()) as SessionSnapshot;
    this.version = snapshot.version;
    return snapshot;
  }

  /**
   * Observe the session; `onChange` fires whenever it advances to a newer
   * version. Returns a stop function. Useful for an agent that waits for the
   * group to finish before computing and broadcasting the next screen.
   */
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
      } catch {
        // Transient; retry on the next tick.
      }
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

/** Open a handle to a shared live session by id. */
export function session(id: string, opts?: LiveSessionOptions): LiveSession {
  return new LiveSession(id, opts);
}
