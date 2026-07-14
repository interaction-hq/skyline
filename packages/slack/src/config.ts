import type { ResolvedLine } from "@skyline-ts/core/host";

export interface SlackTeamMetadata {
  appId: string;
  botUserId: string;
  grantedScopes: string[];
  teamName: string;
}

export interface SlackDedicatedInput {
  appTokens?: Readonly<Record<string, string>>;
  endpoint?: string;
  teams?: Readonly<Record<string, SlackTeamMetadata>>;
  tokens: Readonly<Record<string, string>>;
}

export interface SlackCloudConfig {
  mode: "cloud";
  platform: "slack";
}

export interface SlackDedicatedConfig extends SlackDedicatedInput {
  mode: "dedicated";
  platform: "slack";
}

export type SlackConfig = SlackCloudConfig | SlackDedicatedConfig;

export const slack = {
  config(opts?: SlackDedicatedInput): SlackConfig {
    if (opts && Object.keys(opts.tokens).length > 0) {
      return {
        appTokens: opts.appTokens,
        endpoint: opts.endpoint,
        mode: "dedicated",
        platform: "slack",
        teams: opts.teams,
        tokens: opts.tokens,
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
