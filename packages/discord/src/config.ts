import type { ResolvedLine } from "@skyline-ts/core/host";

export const DISCORD_API_BASE = "https://discord.com/api/v10";

const INTENT = {
  directMessageReactions: 1 << 13,
  directMessageTyping: 1 << 14,
  directMessages: 1 << 12,
  guildMessageReactions: 1 << 10,
  guildMessageTyping: 1 << 11,
  guildMessages: 1 << 9,
  guilds: 1 << 0,
  messageContent: 1 << 15,
} as const;

/**
 * Messaging-focused intents: guild + DM messages, reactions, typing, and the
 * privileged Message Content intent (must be enabled in the Developer Portal).
 */
export const DEFAULT_INTENTS =
  INTENT.guilds |
  INTENT.guildMessages |
  INTENT.guildMessageReactions |
  INTENT.guildMessageTyping |
  INTENT.directMessages |
  INTENT.directMessageReactions |
  INTENT.directMessageTyping |
  INTENT.messageContent;

export interface DiscordDedicatedInput {
  /** Application (client) id — enables slash-command registration later. */
  applicationId?: string;
  baseUrl?: string;
  /** Bot token from the Discord Developer Portal. */
  botToken: string;
  /** Optional default guild for guild-scoped operations. */
  guildId?: string;
  /** Override the gateway intents bitfield (defaults to the messaging set). */
  intents?: number;
}

export interface DiscordDedicatedConfig extends DiscordDedicatedInput {
  mode: "dedicated";
  platform: "discord";
}

export type DiscordConfig = DiscordDedicatedConfig;

export const discord = {
  config(opts: DiscordDedicatedInput): DiscordConfig {
    if (!opts?.botToken) {
      throw new Error(
        "discord.config requires botToken (from the Discord Developer Portal). " +
          "Pass discord.config({ botToken })."
      );
    }
    return {
      applicationId: opts.applicationId,
      baseUrl: opts.baseUrl ?? DISCORD_API_BASE,
      botToken: opts.botToken,
      guildId: opts.guildId,
      intents: opts.intents ?? DEFAULT_INTENTS,
      mode: "dedicated",
      platform: "discord",
    };
  },
};

export function discordDedicatedLines(
  config: DiscordDedicatedConfig
): ResolvedLine[] {
  return [
    {
      address: config.baseUrl ?? DISCORD_API_BASE,
      discord: {
        applicationId: config.applicationId,
        baseUrl: config.baseUrl ?? DISCORD_API_BASE,
        botToken: config.botToken,
        guildId: config.guildId,
        intents: config.intents ?? DEFAULT_INTENTS,
      },
      phone: config.applicationId ?? "discord",
      token: config.botToken,
    },
  ];
}
