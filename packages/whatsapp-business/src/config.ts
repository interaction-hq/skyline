import type { ResolvedLine } from "@skyline-ts/core/host";

export interface WhatsappBusinessLine {
  accessToken: string;
  apiVersion?: string;
  phone: string;
  phoneNumberId: string;
}

export interface WhatsappBusinessCloudConfig {
  mode: "cloud";
  platform: "whatsapp_business";
}

export interface WhatsappBusinessDedicatedConfig {
  lines: WhatsappBusinessLine[];
  mode: "dedicated";
  platform: "whatsapp_business";
}

export type WhatsappBusinessConfig =
  | WhatsappBusinessCloudConfig
  | WhatsappBusinessDedicatedConfig;

export const whatsappBusiness = {
  config(opts?: { lines?: WhatsappBusinessLine[] }): WhatsappBusinessConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return {
        lines: opts.lines,
        mode: "dedicated",
        platform: "whatsapp_business",
      };
    }
    return { mode: "cloud", platform: "whatsapp_business" };
  },
};

export function whatsappBusinessDedicatedLines(
  config: WhatsappBusinessDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: "",
    business: {
      accessToken: l.accessToken,
      apiVersion: l.apiVersion,
      phoneNumberId: l.phoneNumberId,
    },
    phone: l.phone,
    token: l.accessToken,
  }));
}
