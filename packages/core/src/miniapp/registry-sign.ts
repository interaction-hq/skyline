// Registry signing — turn a registry document into the signed envelope the shell
// verifies before adopting a remote catalog. Clients publish/update apps without
// a build: sign the JSON with their Ed25519 private key, host the envelope, and
// point the shell's MINI_APP_REGISTRY_URL at it.
//
// The envelope carries the registry as an exact JSON *string* and an Ed25519
// signature over that string's UTF-8 bytes. Signing the serialized text (not a
// re-encoded object) means the shell verifies the very bytes it parses — no
// canonicalization to keep in lockstep across languages.

import { createPrivateKey, sign as edSign } from "node:crypto";
import type { Registry } from "./manifest.js";

/** The signed document the shell fetches. */
export interface SignedRegistry {
  keyId: string;
  /** The registry document as an exact JSON string (the signed bytes). */
  registry: string;
  /** Base64 Ed25519 signature over `registry`'s UTF-8 bytes. */
  signature: string;
}

/**
 * Sign a registry into a hostable envelope.
 *
 * `privateKeyPem` is an Ed25519 private key in PKCS#8 PEM; `keyId` must match a
 * key the shell has pinned. Host the returned JSON at your registry URL.
 *
 * ```ts
 * const signed = signRegistry(defineRegistry([manifest]), {
 *   keyId: "acme-2026",
 *   privateKeyPem: process.env.REGISTRY_SIGNING_KEY!,
 * });
 * await Bun.write("registry.json", JSON.stringify(signed));
 * ```
 */
export function signRegistry(
  registry: Registry,
  opts: { keyId: string; privateKeyPem: string }
): SignedRegistry {
  const registryText = JSON.stringify(registry);
  const key = createPrivateKey(opts.privateKeyPem);
  const signature = edSign(null, Buffer.from(registryText, "utf8"), key);
  return {
    keyId: opts.keyId,
    registry: registryText,
    signature: signature.toString("base64"),
  };
}
