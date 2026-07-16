import type { ResolvedLine } from "@skyline-ts/core/host";

export const GCHAT_API_BASE = "https://chat.googleapis.com/v1";

export interface GoogleChatDedicatedInput {
  /** Expected `aud` on inbound Google JWTs (your Chat app project number). */
  audience?: string;
  baseUrl?: string;
  /** Service-account key JSON (stringified) with `client_email` + `private_key`. */
  serviceAccountJson: string;
}

export interface GoogleChatDedicatedConfig extends GoogleChatDedicatedInput {
  mode: "dedicated";
  platform: "googlechat";
}

export type GoogleChatConfig = GoogleChatDedicatedConfig;

export const googlechat = {
  config(opts: GoogleChatDedicatedInput): GoogleChatConfig {
    if (!opts?.serviceAccountJson) {
      throw new Error(
        "googlechat.config requires serviceAccountJson (a Chat app service-account key)."
      );
    }
    return {
      audience: opts.audience,
      baseUrl: opts.baseUrl ?? GCHAT_API_BASE,
      mode: "dedicated",
      platform: "googlechat",
      serviceAccountJson: opts.serviceAccountJson,
    };
  },
};

export function googleChatDedicatedLines(
  config: GoogleChatDedicatedConfig
): ResolvedLine[] {
  return [
    {
      address: config.baseUrl ?? GCHAT_API_BASE,
      googlechat: {
        audience: config.audience,
        baseUrl: config.baseUrl ?? GCHAT_API_BASE,
        serviceAccountJson: config.serviceAccountJson,
      },
      phone: "googlechat",
      token: "",
    },
  ];
}
