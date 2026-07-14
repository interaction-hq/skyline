import type { ResolvedLine } from "@skyline-ts/core";

export interface DedicatedLine {
    address: string;
    phone: string;
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

export const imessage = {
  config(opts?: { lines?: DedicatedLine[] }): ImessageConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return { lines: opts.lines, mode: "dedicated", platform: "imessage" };
    }
    return { mode: "cloud", platform: "imessage" };
  },
};

export function dedicatedLines(
  config: ImessageDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: l.address,
    phone: l.phone,
    token: l.token,
  }));
}
