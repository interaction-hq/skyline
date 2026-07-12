import { PLATFORM_API_BASE } from "./platform.js";
import type { Platform, ResolvedLine } from "./types.js";

/** Response shape of the Skyline broker `POST /v1/auth/token`. */
interface TokenResponse {
  data?: {
    token: string;
    ttl: number;
    endpoints: {
      address: string;
      phone?: string;
      /** WhatsApp Business cloud line: Meta Cloud API send credentials. */
      business?: {
        phoneNumberId: string;
        accessToken: string;
        apiVersion?: string;
      };
      slack?: {
        appToken?: string;
        botToken?: string;
        signingSecret?: string;
        teamId?: string;
        team?: {
          appId: string;
          botUserId: string;
          grantedScopes: string[];
          teamName: string;
        };
      };
    }[];
  };
  error?: {
    code?: number | string;
    slug?: string;
    message: string;
    doc_url?: string;
    retry?: boolean;
  };
  succeed: boolean;
}

export interface BrokerCredentials {
  projectId: string;
  projectSecret: string;
}

export interface BrokerOptions {
  /** Test-only override; production uses the hardcoded platform API host. */
  baseUrl?: string;
}

/**
 * Exchange long-lived project creds for a short-lived runtime token + the
 * resolved data-plane endpoints. The broker is never in the message hot path:
 * after this call, the SDK talks directly to each provider's data plane
 * (gRPC for iMessage / personal WhatsApp; hosted Slack gateway or Web API;
 * Meta Graph for WhatsApp Business).
 */
export class Broker {
  private readonly baseUrl: string;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: BrokerOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? PLATFORM_API_BASE).replace(/\/+$/, "");
  }

  /**
   * Resolve lines for a platform. Returns the runtime token + endpoints and the
   * TTL so the caller can schedule a refresh. Throws on auth/entitlement errors.
   */
  async resolve(
    creds: BrokerCredentials,
    platform: Platform,
    space?: string
  ): Promise<{ token: string; ttl: number; lines: ResolvedLine[] }> {
    const res = await fetch(`${this.baseUrl}/v1/auth/token`, {
      body: JSON.stringify({ ...creds, platform, space }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!(res.ok && body?.succeed && body.data)) {
      const err = body?.error;
      const slug =
        (typeof err?.slug === "string" && err.slug) ||
        (typeof err?.code === "string" && err.code) ||
        `HTTP_${res.status}`;
      const message = err?.message ?? "broker rejected request";
      throw new BrokerError(slug, message, res.status, {
        docUrl: err?.doc_url,
        numeric: typeof err?.code === "number" ? err.code : undefined,
        traceId: (body as { trace_id?: string } | null)?.trace_id,
      });
    }

    const { token, ttl, endpoints } = body.data;
    const lines: ResolvedLine[] = endpoints.map((e) => ({
      address: e.address,
      business: e.business,
      phone: e.phone ?? "",
      slack: e.slack,
      token,
    }));
    return { lines, token, ttl };
  }

  /** Schedule `onRefresh` at 80% of the token TTL, ahead of expiry. */
  scheduleRefresh(ttlSeconds: number, onRefresh: () => void): void {
    this.cancelRefresh();
    const delayMs = Math.max(1, Math.floor(ttlSeconds * 0.8 * 1000));
    this.refreshTimer = setTimeout(onRefresh, delayMs);
  }

  cancelRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

export class BrokerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly meta?: {
      numeric?: number;
      docUrl?: string;
      traceId?: string;
    }
  ) {
    super(message);
    this.name = "BrokerError";
  }
}
