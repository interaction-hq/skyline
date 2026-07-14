/** Shared Channel helpers providers can reuse. */

import type { Channel, PollOps } from "./types.js";

export async function withResponding<T>(
  channel: Pick<Channel, "typing">,
  fn: () => T | Promise<T>
): Promise<T> {
  await channel.typing(true);
  try {
    return await fn();
  } finally {
    try {
      await channel.typing(false);
    } catch {
      // clearing typing must not mask the original error
    }
  }
}

export function unsupportedPollOps(
  unsupported: (verb: string) => never
): PollOps {
  return {
    addOption: async () => unsupported("poll.addOption"),
    get: async () => null,
    unvote: async () => unsupported("poll.unvote"),
    vote: async () => unsupported("poll.vote"),
  };
}
