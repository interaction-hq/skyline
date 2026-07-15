import type { ResolvedLine } from "@skyline-ts/core/host";

const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;
export const DEFAULT_BASE_URL = "https://api.telegram.org";

export interface TelegramDedicatedInput {
  baseUrl?: string;
  botToken: string;
  /**
   * When true, inbound `message.raw` carries a JSON-safe wire snapshot.
   * Default off — parsed Skyline fields stay the fast agent path.
   */
  includeRaw?: boolean;
  /** Public-key certificate (PEM) for a self-signed webhook endpoint. */
  webhookCertificate?: string;
  /** Fixed IP the webhook connects from (bypasses DNS resolution). */
  webhookIpAddress?: string;
  /** Max simultaneous HTTPS connections for webhook delivery (1–100). */
  webhookMaxConnections?: number;
  /** When set, registers a Bot API webhook and skips long-polling. */
  webhookSecret?: string;
  webhookUrl?: string;
}

/** Telegram always carries `botToken` in app config (BotFather token). */
export interface TelegramDedicatedConfig extends TelegramDedicatedInput {
  mode: "dedicated";
  platform: "telegram";
}

/** @deprecated Alias of `TelegramDedicatedConfig` (Telegram has no empty-cloud config). */
export type TelegramCloudConfig = TelegramDedicatedConfig;

export type TelegramConfig = TelegramDedicatedConfig;

export const telegram = {
  config(opts: TelegramDedicatedInput): TelegramConfig {
    if (!opts?.botToken) {
      throw new Error(
        "telegram.config requires botToken (from @BotFather). " +
          "Pass telegram.config({ botToken }) alongside projectId/projectSecret."
      );
    }
    if (!BOT_TOKEN_PATTERN.test(opts.botToken)) {
      throw new Error("telegram: botToken must be in the form '<id>:<token>'");
    }
    return {
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      botToken: opts.botToken,
      includeRaw: opts.includeRaw,
      mode: "dedicated",
      platform: "telegram",
      webhookCertificate: opts.webhookCertificate,
      webhookIpAddress: opts.webhookIpAddress,
      webhookMaxConnections: opts.webhookMaxConnections,
      webhookSecret: opts.webhookSecret,
      webhookUrl: opts.webhookUrl,
    };
  },
};

export function botIdFromToken(botToken: string): string {
  return botToken.split(":")[0] ?? "";
}

export function telegramDedicatedLines(
  config: TelegramDedicatedConfig
): ResolvedLine[] {
  return [
    {
      address: config.baseUrl ?? DEFAULT_BASE_URL,
      phone: botIdFromToken(config.botToken),
      telegram: {
        baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
        botToken: config.botToken,
        includeRaw: config.includeRaw,
        webhookCertificate: config.webhookCertificate,
        webhookIpAddress: config.webhookIpAddress,
        webhookMaxConnections: config.webhookMaxConnections,
        webhookSecret: config.webhookSecret,
        webhookUrl: config.webhookUrl,
      },
      token: config.botToken,
    },
  ];
}
