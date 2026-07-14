import {
  addMember,
  avatar,
  leaveChannel,
  removeMember,
  rename,
  type AvatarInput,
  type ContentInput,
  type MemberInput,
  type SendOptions,
} from "./content/index.js";
import type { Channel, PollOps, SendReceipt } from "./types.js";

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

export function contentSugar(
  send: (content: ContentInput, opts?: SendOptions) => Promise<SendReceipt>
): Pick<Channel, "add" | "avatar" | "leave" | "remove" | "rename"> {
  return {
    add: async (users: MemberInput) => {
      await send(addMember(users));
    },
    avatar: async (input: AvatarInput, options?: { mimeType?: string }) => {
      if (typeof input === "string" || input instanceof URL) {
        await send(avatar(input, options));
        return;
      }
      if (!options?.mimeType) {
        throw new Error(
          "avatar(Uint8Array) requires options.mimeType — pass { mimeType: '...' }"
        );
      }
      await send(avatar(input, { mimeType: options.mimeType }));
    },
    leave: async () => {
      await send(leaveChannel());
    },
    remove: async (users: MemberInput) => {
      await send(removeMember(users));
    },
    rename: async (displayName: string) => {
      await send(rename(displayName));
    },
  };
}
