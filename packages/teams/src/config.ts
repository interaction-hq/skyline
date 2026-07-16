import type { ResolvedLine } from "@skyline-ts/core/host";

export const TEAMS_LOGIN_BASE = "https://login.microsoftonline.com";

export interface TeamsDedicatedInput {
  /** Bot Framework app (client) id. */
  appId: string;
  /** Bot Framework app password (client secret). */
  appPassword: string;
  baseUrl?: string;
  /** Azure AD tenant id for single-tenant bots (omit for multi-tenant). */
  tenantId?: string;
}

export interface TeamsDedicatedConfig extends TeamsDedicatedInput {
  mode: "dedicated";
  platform: "teams";
}

export type TeamsConfig = TeamsDedicatedConfig;

export const teams = {
  config(opts: TeamsDedicatedInput): TeamsConfig {
    if (!(opts?.appId && opts.appPassword)) {
      throw new Error(
        "teams.config requires appId + appPassword (Azure Bot registration)."
      );
    }
    return {
      appId: opts.appId,
      appPassword: opts.appPassword,
      baseUrl: opts.baseUrl,
      mode: "dedicated",
      platform: "teams",
      tenantId: opts.tenantId,
    };
  },
};

export function teamsDedicatedLines(config: TeamsDedicatedConfig): ResolvedLine[] {
  return [
    {
      address: config.baseUrl ?? "",
      phone: config.appId,
      teams: {
        appId: config.appId,
        appPassword: config.appPassword,
        baseUrl: config.baseUrl,
        tenantId: config.tenantId,
      },
      token: config.appId,
    },
  ];
}
