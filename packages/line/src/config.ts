import type { ResolvedLine } from "@skyline-ts/core/host";

export const LINE_API_BASE = "https://api.line.me/v2/bot";
export const LINE_DATA_BASE = "https://api-data.line.me/v2/bot";

export interface LineDedicatedInput {
  baseUrl?: string;
  /** Long-lived channel access token (Messaging API). */
  channelAccessToken: string;
  /** Channel secret — required to verify the `x-line-signature` header. */
  channelSecret?: string;
  dataBaseUrl?: string;
}

export interface LineDedicatedConfig extends LineDedicatedInput {
  mode: "dedicated";
  platform: "line";
}

export type LineConfig = LineDedicatedConfig;

export const line = {
  config(opts: LineDedicatedInput): LineConfig {
    if (!opts?.channelAccessToken) {
      throw new Error(
        "line.config requires channelAccessToken (LINE Developers → Messaging API)."
      );
    }
    return {
      baseUrl: opts.baseUrl ?? LINE_API_BASE,
      channelAccessToken: opts.channelAccessToken,
      channelSecret: opts.channelSecret,
      dataBaseUrl: opts.dataBaseUrl ?? LINE_DATA_BASE,
      mode: "dedicated",
      platform: "line",
    };
  },
};

export function lineDedicatedLines(config: LineDedicatedConfig): ResolvedLine[] {
  return [
    {
      address: config.baseUrl ?? LINE_API_BASE,
      line: {
        baseUrl: config.baseUrl ?? LINE_API_BASE,
        channelAccessToken: config.channelAccessToken,
        channelSecret: config.channelSecret,
        dataBaseUrl: config.dataBaseUrl ?? LINE_DATA_BASE,
      },
      phone: "line",
      token: config.channelAccessToken,
    },
  ];
}
