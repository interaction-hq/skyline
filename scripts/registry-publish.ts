#!/usr/bin/env bun
// Registry publisher CLI. Two subcommands:
//
//   keygen                         → print a fresh Ed25519 keypair. Pin the
//                                    public key (base64) in the shell's
//                                    RegistryVerifier under a keyId; keep the
//                                    private PEM secret (env / secret manager).
//
//   sign <registry.json> <keyId>   → read a registry document (a `defineRegistry`
//                                    output), sign it with REGISTRY_SIGNING_KEY,
//                                    and write the hostable signed envelope to
//                                    stdout. Host it at the shell's
//                                    MINI_APP_REGISTRY_URL to publish/update apps
//                                    without a build.
//
// Example:
//   bun scripts/registry-publish.ts keygen
//   REGISTRY_SIGNING_KEY="$(cat key.pem)" \
//     bun scripts/registry-publish.ts sign registry.json interactions-2026 > signed.json

import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Registry } from "../src/miniapp/manifest";
import { signRegistry } from "../src/miniapp/registry-sign";

function keygen(): void {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ type: "spki", format: "der" });
  // The last 32 bytes of a DER SPKI Ed25519 key are the raw public key.
  const rawPublic = Buffer.from(raw.subarray(raw.length - 32));
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.stdout.write(
    JSON.stringify(
      {
        publicKeyBase64: rawPublic.toString("base64"),
        privateKeyPem: privatePem,
        note: "Pin publicKeyBase64 in RegistryVerifier; keep privateKeyPem secret.",
      },
      null,
      2
    )
  );
  process.stdout.write("\n");
}

function sign(path: string, keyId: string): void {
  const privateKeyPem = process.env.REGISTRY_SIGNING_KEY;
  if (!privateKeyPem) {
    throw new Error("set REGISTRY_SIGNING_KEY to the Ed25519 private key PEM");
  }
  const registry = JSON.parse(readFileSync(path, "utf8")) as Registry;
  const signed = signRegistry(registry, { keyId, privateKeyPem });
  process.stdout.write(JSON.stringify(signed));
  process.stdout.write("\n");
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "keygen":
    keygen();
    break;
  case "sign": {
    const [path, keyId] = rest;
    if (!path || !keyId) {
      throw new Error("usage: sign <registry.json> <keyId>");
    }
    sign(path, keyId);
    break;
  }
  default:
    process.stderr.write("usage: registry-publish.ts <keygen|sign>\n");
    process.exit(1);
}
