import { createSign } from "node:crypto";

import { GCHAT_API_BASE } from "./config.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/chat.bot";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleChatMessageWire {
  argumentText?: string;
  attachment?: {
    contentName?: string;
    contentType?: string;
    name?: string;
  }[];
  name?: string;
  sender?: { displayName?: string; name?: string; type?: string };
  space?: { name?: string; spaceType?: string; type?: string };
  text?: string;
  thread?: { name?: string };
}

export class GoogleChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "GoogleChatError";
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class GoogleChatClient {
  private readonly base: string;
  private readonly sa: ServiceAccount;
  private token: { expiresAt: number; value: string } | null = null;

  constructor(creds: { baseUrl?: string; serviceAccountJson: string }) {
    this.base = (creds.baseUrl ?? GCHAT_API_BASE).replace(/\/+$/, "");
    this.sa = JSON.parse(creds.serviceAccountJson) as ServiceAccount;
    if (!(this.sa.client_email && this.sa.private_key)) {
      throw new Error("googlechat: service account JSON missing client_email/private_key");
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        aud: this.sa.token_uri ?? TOKEN_URL,
        exp: now + 3600,
        iat: now,
        iss: this.sa.client_email,
        scope: SCOPE,
      })
    );
    const signed = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(this.sa.private_key);
    const assertion = `${header}.${claims}.${base64url(signed)}`;

    const res = await fetch(this.sa.token_uri ?? TOKEN_URL, {
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!(res.ok && json?.access_token)) {
      throw new GoogleChatError(res.status, "googlechat token exchange failed", json);
    }
    this.token = {
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      value: json.access_token,
    };
    return json.access_token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.accessToken();
    const res = await fetch(`${this.base}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      method,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204) {
      return undefined as T;
    }
    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (!res.ok) {
      throw new GoogleChatError(
        res.status,
        json?.error?.message ?? `googlechat ${method} ${path} failed (HTTP ${res.status})`,
        json
      );
    }
    return json as T;
  }

  createMessage(
    space: string,
    payload: { text: string; threadName?: string }
  ): Promise<GoogleChatMessageWire> {
    return this.request<GoogleChatMessageWire>(
      "POST",
      `/${space}/messages`,
      payload.threadName
        ? { text: payload.text, thread: { name: payload.threadName } }
        : { text: payload.text }
    );
  }

  updateMessage(messageName: string, text: string): Promise<GoogleChatMessageWire> {
    return this.request<GoogleChatMessageWire>(
      "PATCH",
      `/${messageName}?updateMask=text`,
      { text }
    );
  }

  deleteMessage(messageName: string): Promise<void> {
    return this.request<void>("DELETE", `/${messageName}`);
  }

  getMessage(messageName: string): Promise<GoogleChatMessageWire> {
    return this.request<GoogleChatMessageWire>("GET", `/${messageName}`);
  }

  close(): void {}
}
