import type { ResolvedLine } from "../../types";

/** A dedicated line the customer supplies directly (self-host / advanced). */
export interface DedicatedLine {
  /** gRPC endpoint, e.g. "100.x.y.z:50051". */
  address: string;
  /** The handle (phone/email) this line serves. */
  phone: string;
  /** Token forwarded to the server (x-project-id metadata). */
  token: string;
}

export interface ImessageCloudConfig {
  mode: "cloud";
  platform: "imessage";
}

export interface ImessageDedicatedConfig {
  lines: DedicatedLine[];
  mode: "dedicated";
  platform: "imessage";
}

export type ImessageConfig = ImessageCloudConfig | ImessageDedicatedConfig;

/**
 * The iMessage provider. Default is cloud mode — the SDK asks the Skyline broker
 * to resolve lines for the project. Pass `{ lines }` for dedicated mode (you own
 * the endpoints + tokens; the broker is bypassed).
 */
export const imessage = {
  config(opts?: { lines?: DedicatedLine[] }): ImessageConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return { lines: opts.lines, mode: "dedicated", platform: "imessage" };
    }
    return { mode: "cloud", platform: "imessage" };
  },
};

/** Dedicated config → resolved lines (no broker call). */
export function dedicatedLines(
  config: ImessageDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: l.address,
    phone: l.phone,
    token: l.token,
  }));
}
