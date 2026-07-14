import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ContentBuilder } from "./types.js";

export type AvatarInput = "clear" | string | Uint8Array | URL;

export type AvatarAction =
  | { kind: "clear" }
  | {
      kind: "set";
      mimeType: string;
      read: () => Promise<Uint8Array>;
    };

export interface Avatar {
  action: AvatarAction;
  type: "avatar";
}

export interface AvatarData {
  data: Uint8Array;
  mimeType: string;
}

const EXT_MIME: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const resolveMime = (
  input: string | Uint8Array | URL,
  mimeType: string | undefined
): string => {
  if (mimeType) {
    return mimeType;
  }
  if (input instanceof URL) {
    const resolved = EXT_MIME[extname(basename(input.pathname)).toLowerCase()];
    if (resolved) {
      return resolved;
    }
  } else if (typeof input === "string") {
    const resolved = EXT_MIME[extname(basename(input)).toLowerCase()];
    if (resolved) {
      return resolved;
    }
  }
  throw new Error(
    "Unable to resolve MIME type for avatar. Pass options.mimeType explicitly."
  );
};

const cachedRead = (
  read: () => Promise<Uint8Array>
): (() => Promise<Uint8Array>) => {
  let cached: Promise<Uint8Array> | undefined;
  return () => {
    cached ??= read().catch((err: unknown) => {
      cached = undefined;
      throw err;
    });
    return cached;
  };
};

export function avatar(
  input: string | URL,
  options?: { mimeType?: string }
): ContentBuilder;
export function avatar(
  input: Uint8Array,
  options: { mimeType: string }
): ContentBuilder;
export function avatar(
  input: AvatarInput,
  options?: { mimeType?: string }
): ContentBuilder {
  if (input === "clear") {
    return {
      build: async () => ({ type: "avatar", action: { kind: "clear" } }),
    };
  }
  const mimeType = resolveMime(input, options?.mimeType);
  let read: () => Promise<Uint8Array>;
  if (input instanceof URL) {
    read = cachedRead(async () => {
      const res = await fetch(input);
      if (!res.ok) {
        throw new Error(`avatar: failed to fetch ${input} (${res.status})`);
      }
      return new Uint8Array(await res.arrayBuffer());
    });
  } else if (typeof input === "string") {
    read = cachedRead(async () => new Uint8Array(await readFile(input)));
  } else {
    const snapshot = Uint8Array.from(input);
    read = cachedRead(async () => snapshot);
  }
  const action: AvatarAction = { kind: "set", mimeType, read };
  return {
    build: async () => ({ type: "avatar", action }),
  };
}
