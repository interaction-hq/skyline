import type { ResolvedLine } from "../../types";

export interface SlackTeamMetadata {
  appId: string;
  botUserId: string;
  grantedScopes: string[];
  teamName: string;
}

export interface SlackDedicatedInput {
  /** Socket Mode app tokens (`xapp-…`) keyed by team id — dedicated inbound. */
  appTokens?: Readonly<Record<string, string>>;
  endpoint?: string;
  teams?: Readonly<Record<string, SlackTeamMetadata>>;
  tokens: Readonly<Record<string, string>>;
}

/** @deprecated Prefer `tokens` keyed by team id. */
export interface SlackLine {
  appToken?: string;
  botToken: string;
  signingSecret?: string;
  teamId?: string;
}

export interface SlackCloudConfig {
  mode: "cloud";
  platform: "slack";
}

export interface SlackDedicatedConfig extends SlackDedicatedInput {
  lines?: never;
  mode: "dedicated";
  platform: "slack";
}

export type SlackConfig = SlackCloudConfig | SlackDedicatedConfig;

type SlackConfigInput =
  | (SlackDedicatedInput & { lines?: SlackLine[] })
  | Record<string, never>;

function dedicatedFromLines(lines: SlackLine[]): SlackDedicatedInput {
  const tokens: Record<string, string> = {};
  const appTokens: Record<string, string> = {};
  for (const line of lines) {
    const teamId = line.teamId ?? "slack";
    tokens[teamId] = line.botToken;
    if (line.appToken) {
      appTokens[teamId] = line.appToken;
    }
  }
  return {
    appTokens: Object.keys(appTokens).length > 0 ? appTokens : undefined,
    tokens,
  };
}

function normalizeDedicatedInput(
  opts?: SlackConfigInput
): SlackDedicatedInput | null {
  if (!opts) {
    return null;
  }
  if ("lines" in opts && opts.lines && opts.lines.length > 0) {
    return dedicatedFromLines(opts.lines);
  }
  if ("tokens" in opts && Object.keys(opts.tokens).length > 0) {
    return {
      appTokens: opts.appTokens,
      endpoint: opts.endpoint,
      teams: opts.teams,
      tokens: opts.tokens,
    };
  }
  return null;
}

export const slack = {
  config(opts?: SlackConfigInput): SlackConfig {
    const dedicated = normalizeDedicatedInput(opts);
    if (dedicated) {
      return {
        ...dedicated,
        mode: "dedicated",
        platform: "slack",
      };
    }
    return { mode: "cloud", platform: "slack" };
  },
};

export function slackDedicatedLines(
  config: SlackDedicatedConfig
): ResolvedLine[] {
  return Object.entries(config.tokens).map(([teamId, token]) => {
    const isBot = token.startsWith("xoxb-");
    return {
      address: config.endpoint ?? "",
      phone: teamId,
      slack: {
        accessToken: isBot ? undefined : token,
        appToken: config.appTokens?.[teamId],
        botToken: isBot ? token : undefined,
        endpoint: config.endpoint,
        team: config.teams?.[teamId],
        teamId,
      },
      token,
    };
  });
}
