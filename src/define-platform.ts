import type { Platform } from "./types";

export interface PlatformDef<
  P extends Platform = Platform,
  C extends { platform: P } = { platform: P },
> {
  config(input?: unknown): C;
  platform: P;
}

/**
 * Register a custom messaging interface with Skyline's provider model.
 * Built-in providers ship in `@interactions-hq/skyline/providers`.
 */
export function definePlatform<P extends Platform, C extends { platform: P }>(
  def: PlatformDef<P, C>
): PlatformDef<P, C> {
  return def;
}
