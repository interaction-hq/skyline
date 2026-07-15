import { readFile } from "node:fs/promises";

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch URL bytes into memory — never touches the filesystem, so callers
 * remain safe in read-only environments.
 */
export async function fetchUrlBytes(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<Uint8Array> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Resolve media bytes from in-memory data, a filesystem path, or a URL.
 * Paths use `node:fs/promises` (portable across Node and Bun, which both
 * implement the Node FS API). Prefer this over runtime-specific helpers
 * like `Bun.file`.
 */
export async function readMediaBytes(input: {
  data?: Uint8Array | ArrayBuffer;
  path?: string;
  url?: string;
}): Promise<Uint8Array> {
  if (input.data) {
    return input.data instanceof Uint8Array
      ? input.data
      : new Uint8Array(input.data);
  }
  if (input.path) {
    return new Uint8Array(await readFile(input.path));
  }
  if (input.url) {
    return fetchUrlBytes(input.url);
  }
  throw new Error("media requires data, path, or url");
}

export function mimeToMediaName(
  mimeType: string | undefined,
  fallback: string
): string {
  if (!mimeType) {
    return `${fallback}.bin`;
  }
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim();
  if (!subtype) {
    return `${fallback}.bin`;
  }
  const ext =
    subtype === "mpeg" || subtype === "mpga"
      ? "mp3"
      : subtype === "x-m4a" || subtype === "mp4"
        ? "m4a"
        : subtype;
  return `${fallback}.${ext}`;
}
