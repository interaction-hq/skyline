import { createPublicKey, createVerify } from "node:crypto";
import type { JsonWebKey as CryptoJsonWebKey } from "node:crypto";

import type { TeamsActivity } from "./rest.js";

const OPENID_CONFIG =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";
const ISSUER = "https://api.botframework.com";

interface Jwk {
  e: string;
  kid: string;
  kty: string;
  n: string;
}

let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;

async function jwks(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }
  const configRes = await fetch(OPENID_CONFIG, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!configRes.ok) {
    throw new Error(`teams: openid config fetch failed (HTTP ${configRes.status})`);
  }
  const config = (await configRes.json()) as { jwks_uri?: string };
  if (!config.jwks_uri) {
    throw new Error("teams: openid config missing jwks_uri");
  }
  const keysRes = await fetch(config.jwks_uri, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!keysRes.ok) {
    throw new Error(`teams: jwks fetch failed (HTTP ${keysRes.status})`);
  }
  const keys = ((await keysRes.json()) as { keys?: Jwk[] }).keys ?? [];
  jwksCache = { expiresAt: Date.now() + 12 * 60 * 60 * 1000, keys };
  return keys;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    )
  ) as Record<string, unknown>;
}

/** Verify a Bot Framework JWT: signature (RS256/JWKS), issuer, audience, expiry. */
export async function verifyTeamsJwt(
  jwt: string,
  appId: string
): Promise<boolean> {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    return false;
  }
  const kid = header.kid as string | undefined;
  if (!kid) {
    return false;
  }
  const key = (await jwks()).find((k) => k.kid === kid);
  if (!key) {
    return false;
  }
  const publicKey = createPublicKey({
    format: "jwk",
    key: key as unknown as CryptoJsonWebKey,
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const ok = verifier.verify(
    publicKey,
    Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  );
  if (!ok) {
    return false;
  }
  if (payload.iss !== ISSUER) {
    return false;
  }
  if (payload.aud !== appId) {
    return false;
  }
  const exp = payload.exp as number | undefined;
  return !exp || exp * 1000 > Date.now();
}

export function createTeamsWebhookHandler(opts: {
  appId: string;
  onActivity: (activity: TeamsActivity) => void;
  verify?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      if (opts.verify !== false) {
        const auth = request.headers.get("authorization") ?? "";
        const jwt = auth.replace(/^Bearer\s+/i, "");
        if (!(jwt && (await verifyTeamsJwt(jwt, opts.appId)))) {
          return new Response("invalid token", { status: 401 });
        }
      }
      const activity = (await request.json()) as TeamsActivity;
      opts.onActivity(activity);
      return new Response("", { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad request";
      return new Response(message, { status: 400 });
    }
  };
}
