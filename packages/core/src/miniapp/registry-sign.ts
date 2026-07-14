import { createPrivateKey, sign as edSign } from "node:crypto";
import type { Registry } from "./manifest.js";

export interface SignedRegistry {
  keyId: string;

  registry: string;

  signature: string;
}

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
