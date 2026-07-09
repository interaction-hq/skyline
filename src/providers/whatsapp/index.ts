import type { ResolvedLine } from "../../types";

export interface WhatsappDedicatedLine {
  address: string;
  phone: string;
  token: string;
}

export interface WhatsappCloudConfig {
  mode: "cloud";
  platform: "whatsapp";
}

export interface WhatsappDedicatedConfig {
  lines: WhatsappDedicatedLine[];
  mode: "dedicated";
  platform: "whatsapp";
}

export type WhatsappConfig = WhatsappCloudConfig | WhatsappDedicatedConfig;

export const whatsapp = {
  config(opts?: { lines?: WhatsappDedicatedLine[] }): WhatsappConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return { lines: opts.lines, mode: "dedicated", platform: "whatsapp" };
    }
    return { mode: "cloud", platform: "whatsapp" };
  },
};

export function whatsappDedicatedLines(
  config: WhatsappDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: l.address,
    phone: l.phone,
    token: l.token,
  }));
}
