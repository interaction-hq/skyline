import { LINE_API_BASE, LINE_DATA_BASE } from "./config.js";

export type LineMessage =
  | { text: string; type: "text" }
  | {
      originalContentUrl: string;
      previewImageUrl: string;
      type: "image";
    }
  | {
      originalContentUrl: string;
      previewImageUrl: string;
      type: "video";
    }
  | { duration: number; originalContentUrl: string; type: "audio" }
  | {
      address: string;
      latitude: number;
      longitude: number;
      title: string;
      type: "location";
    }
  | { packageId: string; stickerId: string; type: "sticker" };

export interface LineProfile {
  displayName?: string;
  language?: string;
  pictureUrl?: string;
  userId: string;
}

export class LineError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "LineError";
  }
}

export class LineClient {
  private readonly base: string;
  private readonly dataBase: string;
  private readonly token: string;

  constructor(creds: {
    baseUrl?: string;
    channelAccessToken: string;
    dataBaseUrl?: string;
  }) {
    this.base = (creds.baseUrl ?? LINE_API_BASE).replace(/\/+$/, "");
    this.dataBase = (creds.dataBaseUrl ?? LINE_DATA_BASE).replace(/\/+$/, "");
    this.token = creds.channelAccessToken;
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.base}${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new LineError(
        res.status,
        `LINE POST ${path} failed (HTTP ${res.status})`,
        detail
      );
    }
  }

  reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    return this.post("/message/reply", {
      messages: messages.slice(0, 5),
      replyToken,
    });
  }

  push(to: string, messages: LineMessage[]): Promise<void> {
    return this.post("/message/push", { messages: messages.slice(0, 5), to });
  }

  async getProfile(userId: string): Promise<LineProfile> {
    const res = await fetch(`${this.base}/profile/${userId}`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new LineError(res.status, `LINE getProfile failed (HTTP ${res.status})`);
    }
    return (await res.json()) as LineProfile;
  }

  async getContent(messageId: string): Promise<Uint8Array> {
    const res = await fetch(`${this.dataBase}/message/${messageId}/content`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new LineError(res.status, `LINE getContent failed (HTTP ${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  leaveGroup(groupId: string): Promise<void> {
    return this.post(`/group/${groupId}/leave`, {});
  }

  leaveRoom(roomId: string): Promise<void> {
    return this.post(`/room/${roomId}/leave`, {});
  }

  close(): void {}
}
