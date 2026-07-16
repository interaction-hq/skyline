import { createVerify } from "node:crypto";

import type { GoogleChatMessageWire } from "./rest.js";

const CERT_URL =
  "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";
const ISSUER = "chat@system.gserviceaccount.com";

export interface GoogleChatWebhookEvent {
  common?: { formInputs?: Record<string, unknown> };
  message?: GoogleChatMessageWire;
  space?: { name?: string; spaceType?: string; type?: string };
  type: string;
  user?: { displayName?: string; name?: string };
}

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) {
    return certCache.certs;
  }
  const res = await fetch(CERT_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`googlechat: cert fetch failed (HTTP ${res.status})`);
  }
  const certs = (await res.json()) as Record<string, string>;
  certCache = { certs, expiresAt: Date.now() + 60 * 60 * 1000 };
  return certs;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    )
  ) as Record<string, unknown>;
}

/** Verify a Google-signed bearer JWT: signature (RS256), issuer, audience, expiry. */
export async function verifyGoogleChatJwt(
  jwt: string,
  audience?: string
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
  const certs = await googleCerts();
  const cert = certs[kid];
  if (!cert) {
    return false;
  }
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const ok = verifier.verify(
    cert,
    Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  );
  if (!ok) {
    return false;
  }
  if (payload.iss !== ISSUER) {
    return false;
  }
  if (audience && payload.aud !== audience) {
    return false;
  }
  const exp = payload.exp as number | undefined;
  return !exp || exp * 1000 > Date.now();
}

export function createGoogleChatWebhookHandler(opts: {
  audience?: string;
  onEvent: (event: GoogleChatWebhookEvent) => void;
  verify?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      if (opts.verify !== false) {
        const auth = request.headers.get("authorization") ?? "";
        const jwt = auth.replace(/^Bearer\s+/i, "");
        if (!(jwt && (await verifyGoogleChatJwt(jwt, opts.audience)))) {
          return new Response("invalid token", { status: 401 });
        }
      }
      const event = (await request.json()) as GoogleChatWebhookEvent;
      opts.onEvent(event);
      return new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad request";
      return new Response(message, { status: 400 });
    }
  };
}
