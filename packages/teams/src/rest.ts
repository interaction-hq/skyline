import { TEAMS_LOGIN_BASE } from "./config.js";

const SCOPE = "https://api.botframework.com/.default";

export interface TeamsActivity {
  attachments?: {
    content?: unknown;
    contentType?: string;
    contentUrl?: string;
    name?: string;
  }[];
  conversation?: { id?: string };
  from?: { id?: string; name?: string };
  id?: string;
  recipient?: { id?: string; name?: string };
  replyToId?: string;
  serviceUrl?: string;
  text?: string;
  timestamp?: string;
  type?: string;
}

export class TeamsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "TeamsError";
  }
}

export class TeamsClient {
  private readonly appId: string;
  private readonly appPassword: string;
  private readonly tenant: string;
  private token: { expiresAt: number; value: string } | null = null;

  constructor(creds: { appId: string; appPassword: string; tenantId?: string }) {
    this.appId = creds.appId;
    this.appPassword = creds.appPassword;
    this.tenant = creds.tenantId ?? "botframework.com";
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const res = await fetch(
      `${TEAMS_LOGIN_BASE}/${this.tenant}/oauth2/v2.0/token`,
      {
        body: new URLSearchParams({
          client_id: this.appId,
          client_secret: this.appPassword,
          grant_type: "client_credentials",
          scope: SCOPE,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      }
    );
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!(res.ok && json?.access_token)) {
      throw new TeamsError(res.status, "teams token exchange failed", json);
    }
    this.token = {
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      value: json.access_token,
    };
    return json.access_token;
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.accessToken();
    const res = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      method,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204 || res.status === 202) {
      return undefined as T;
    }
    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (!res.ok) {
      throw new TeamsError(
        res.status,
        json?.error?.message ?? `teams ${method} failed (HTTP ${res.status})`,
        json
      );
    }
    return json as T;
  }

  sendActivity(
    serviceUrl: string,
    conversationId: string,
    activity: TeamsActivity
  ): Promise<{ id?: string }> {
    const base = serviceUrl.replace(/\/+$/, "");
    return this.request<{ id?: string }>(
      "POST",
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`,
      { type: "message", ...activity }
    );
  }

  updateActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string,
    activity: TeamsActivity
  ): Promise<{ id?: string }> {
    const base = serviceUrl.replace(/\/+$/, "");
    return this.request<{ id?: string }>(
      "PUT",
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`,
      { type: "message", ...activity }
    );
  }

  deleteActivity(
    serviceUrl: string,
    conversationId: string,
    activityId: string
  ): Promise<void> {
    const base = serviceUrl.replace(/\/+$/, "");
    return this.request<void>(
      "DELETE",
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`
    );
  }

  close(): void {}
}
