import type { Platform } from "./types.js";

export interface PlatformDef<
  P extends Platform = Platform,
  C extends { platform: P } = { platform: P },
> {
  config(input?: unknown): C;
  platform: P;
}

export function definePlatform<P extends Platform, C extends { platform: P }>(
  def: PlatformDef<P, C>
): PlatformDef<P, C> {
  return def;
}
