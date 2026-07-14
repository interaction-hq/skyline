import { PLATFORM_API_BASE } from "../platform";

export interface SlackTokenData {
  auth: Record<string, string>;
  expiresIn: number;
  teams: Record<
    string,
    {
      appId: string;
      botUserId: string;
      grantedScopes: string[];
      teamName: string;
    }
  >;
}

export async function issueSlackTokens(
  projectId: string,
  projectSecret: string,
  baseUrl = PLATFORM_API_BASE
): Promise<SlackTokenData> {
  const basic = Buffer.from(`${projectId}:${projectSecret}`).toString("base64");
  const res = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/projects/${encodeURIComponent(projectId)}/slack/tokens`,
    {
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    }
  );
  const body = (await res.json().catch(() => null)) as {
    data?: SlackTokenData;
    succeed?: boolean;
  } | null;
  if (!(res.ok && body?.succeed && body.data)) {
    throw new Error(`issueSlackTokens failed (HTTP ${res.status})`);
  }
  return body.data;
}
