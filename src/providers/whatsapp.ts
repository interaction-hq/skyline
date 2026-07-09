import type { ResolvedLine } from "../types";

/** A dedicated WhatsApp personal line (self-host / advanced). */
export interface WhatsappDedicatedLine {
  /** gRPC endpoint of the WhatsApp server, e.g. "100.x.y.z:50051". */
  address: string;
  token: string;
  /** The WhatsApp number (E.164) this line serves. */
  phone: string;
}

export interface WhatsappCloudConfig {
  platform: "whatsapp";
  mode: "cloud";
}

export interface WhatsappDedicatedConfig {
  platform: "whatsapp";
  mode: "dedicated";
  lines: WhatsappDedicatedLine[];
}

export type WhatsappConfig = WhatsappCloudConfig | WhatsappDedicatedConfig;

/**
 * WhatsApp personal provider — same per-line transport as iMessage (the mini
 * runs a WhatsApp gRPC server). Cloud mode (default) resolves lines via the
 * Skyline broker; dedicated mode takes endpoints you own.
 */
export const whatsapp = {
  config(opts?: { lines?: WhatsappDedicatedLine[] }): WhatsappConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return { platform: "whatsapp", mode: "dedicated", lines: opts.lines };
    }
    return { platform: "whatsapp", mode: "cloud" };
  },
};

/** A self-hosted WhatsApp Business number: your own Meta Cloud API credentials. */
export interface WhatsappBusinessLine {
  /** The display phone number (E.164) this line sends as. */
  phone: string;
  /** Meta phone_number_id the messages send from. */
  phoneNumberId: string;
  /** Bearer access token (system-user token). */
  accessToken: string;
  /** Graph API version override, e.g. "v23.0". */
  apiVersion?: string;
}

export interface WhatsappBusinessCloudConfig {
  platform: "whatsapp_business";
  mode: "cloud";
}

export interface WhatsappBusinessDedicatedConfig {
  platform: "whatsapp_business";
  mode: "dedicated";
  lines: WhatsappBusinessLine[];
}

export type WhatsappBusinessConfig =
  | WhatsappBusinessCloudConfig
  | WhatsappBusinessDedicatedConfig;

/**
 * WhatsApp Business provider. Cloud mode (default) resolves the bound
 * phone_number_id + a short-lived access token from the Skyline broker, so
 * Meta credentials stay server-side. Dedicated mode takes your own Cloud API
 * credentials directly (self-host / bring-your-own-WABA). Either way the SDK
 * sends straight to `graph.facebook.com` — no gateway hop.
 */
export const whatsappBusiness = {
  config(opts?: { lines?: WhatsappBusinessLine[] }): WhatsappBusinessConfig {
    if (opts?.lines && opts.lines.length > 0) {
      return { platform: "whatsapp_business", mode: "dedicated", lines: opts.lines };
    }
    return { platform: "whatsapp_business", mode: "cloud" };
  },
};

export function whatsappBusinessDedicatedLines(
  config: WhatsappBusinessDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: "",
    token: l.accessToken,
    phone: l.phone,
    business: {
      phoneNumberId: l.phoneNumberId,
      accessToken: l.accessToken,
      apiVersion: l.apiVersion,
    },
  }));
}

export function whatsappDedicatedLines(
  config: WhatsappDedicatedConfig
): ResolvedLine[] {
  return config.lines.map((l) => ({
    address: l.address,
    token: l.token,
    phone: l.phone,
  }));
}
