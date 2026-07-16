import { DISCORD_API_BASE } from "./config.js";

export interface DiscordUser {
  bot?: boolean;
  discriminator?: string;
  global_name?: string;
  id: string;
  username?: string;
}

export interface DiscordAttachment {
  content_type?: string;
  filename?: string;
  height?: number;
  id: string;
  proxy_url?: string;
  size?: number;
  url: string;
  width?: number;
}

export interface DiscordMessage {
  attachments?: DiscordAttachment[];
  author?: DiscordUser;
  channel_id: string;
  content?: string;
  edited_timestamp?: string | null;
  guild_id?: string;
  id: string;
  message_reference?: { channel_id?: string; guild_id?: string; message_id?: string };
  referenced_message?: DiscordMessage | null;
  timestamp?: string;
  tts?: boolean;
  type?: number;
  webhook_id?: string;
}

export interface DiscordEmbed {
  color?: number;
  description?: string;
  image?: { url: string };
  thumbnail?: { url: string };
  title?: string;
  url?: string;
}

export interface DiscordCreateMessage {
  allowed_mentions?: { parse?: string[]; replied_user?: boolean };
  components?: unknown[];
  content?: string;
  embeds?: DiscordEmbed[];
  message_reference?: { fail_if_not_exists?: boolean; message_id: string };
  sticker_ids?: string[];
  tts?: boolean;
}

export class DiscordError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "DiscordError";
  }
}

export class DiscordRestClient {
  private readonly base: string;
  private readonly token: string;

  constructor(creds: { baseUrl?: string; botToken: string }) {
    this.base = (creds.baseUrl ?? DISCORD_API_BASE).replace(/\/+$/, "");
    this.token = creds.botToken;
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bot ${this.token}` };
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; form?: FormData; timeoutMs?: number }
  ): Promise<T> {
    // One retry on 429 honoring retry_after (seconds).
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = this.authHeaders();
      let body: BodyInit | undefined;
      if (opts?.form) {
        body = opts.form;
      } else if (opts?.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      const res = await fetch(`${this.base}${path}`, {
        body,
        headers,
        method,
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 15_000),
      });
      if (res.status === 429 && attempt === 0) {
        const retry = (await res.json().catch(() => null)) as {
          retry_after?: number;
        } | null;
        const waitMs = Math.min(5000, Math.ceil((retry?.retry_after ?? 1) * 1000));
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (res.status === 204) {
        return undefined as T;
      }
      const json = (await res.json().catch(() => null)) as
        | (T & { code?: number; message?: string })
        | null;
      if (!res.ok) {
        throw new DiscordError(
          res.status,
          json?.code,
          json?.message ?? `Discord ${method} ${path} failed (HTTP ${res.status})`,
          json
        );
      }
      return json as T;
    }
    throw new DiscordError(429, undefined, `Discord ${method} ${path} rate limited`);
  }

  me(): Promise<DiscordUser> {
    return this.request<DiscordUser>("GET", "/users/@me");
  }

  createMessage(
    channelId: string,
    payload: DiscordCreateMessage
  ): Promise<DiscordMessage> {
    return this.request<DiscordMessage>(
      "POST",
      `/channels/${channelId}/messages`,
      { body: payload }
    );
  }

  uploadFile(
    channelId: string,
    file: { data: Uint8Array; mimeType?: string; name: string },
    payload?: DiscordCreateMessage
  ): Promise<DiscordMessage> {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload ?? {}));
    form.append(
      "files[0]",
      new Blob([Uint8Array.from(file.data)], {
        type: file.mimeType ?? "application/octet-stream",
      }),
      file.name
    );
    return this.request<DiscordMessage>(
      "POST",
      `/channels/${channelId}/messages`,
      { form, timeoutMs: 60_000 }
    );
  }

  editMessage(
    channelId: string,
    messageId: string,
    payload: DiscordCreateMessage
  ): Promise<DiscordMessage> {
    return this.request<DiscordMessage>(
      "PATCH",
      `/channels/${channelId}/messages/${messageId}`,
      { body: payload }
    );
  }

  deleteMessage(channelId: string, messageId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/channels/${channelId}/messages/${messageId}`
    );
  }

  getMessage(channelId: string, messageId: string): Promise<DiscordMessage> {
    return this.request<DiscordMessage>(
      "GET",
      `/channels/${channelId}/messages/${messageId}`
    );
  }

  listMessages(channelId: string, limit = 50): Promise<DiscordMessage[]> {
    return this.request<DiscordMessage[]>(
      "GET",
      `/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`
    );
  }

  addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.request<void>(
      "PUT",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeEmoji(emoji)}/@me`
    );
  }

  removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeEmoji(emoji)}/@me`
    );
  }

  triggerTyping(channelId: string): Promise<void> {
    return this.request<void>("POST", `/channels/${channelId}/typing`);
  }

  pinMessage(channelId: string, messageId: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/channels/${channelId}/pins/${messageId}`
    );
  }

  unpinMessage(channelId: string, messageId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/channels/${channelId}/pins/${messageId}`
    );
  }

  async createDM(userId: string): Promise<string> {
    const channel = await this.request<{ id: string }>(
      "POST",
      "/users/@me/channels",
      { body: { recipient_id: userId } }
    );
    return channel.id;
  }

  renameChannel(channelId: string, name: string): Promise<{ id: string }> {
    return this.request<{ id: string }>("PATCH", `/channels/${channelId}`, {
      body: { name },
    });
  }

  removeMember(guildId: string, userId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/guilds/${guildId}/members/${userId}`
    );
  }

  banMember(
    guildId: string,
    userId: string,
    opts?: { deleteMessageSeconds?: number }
  ): Promise<void> {
    return this.request<void>("PUT", `/guilds/${guildId}/bans/${userId}`, {
      body: opts?.deleteMessageSeconds
        ? { delete_message_seconds: opts.deleteMessageSeconds }
        : {},
    });
  }

  unbanMember(guildId: string, userId: string): Promise<void> {
    return this.request<void>("DELETE", `/guilds/${guildId}/bans/${userId}`);
  }

  async downloadAttachment(url: string): Promise<Uint8Array> {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      throw new DiscordError(
        res.status,
        undefined,
        `Discord attachment download failed (HTTP ${res.status})`
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  close(): void {}
}

/** Unicode emoji is percent-encoded; custom emoji use the `name:id` form. */
function encodeEmoji(emoji: string): string {
  const custom = emoji.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
  if (custom) {
    return `${custom[1]}:${custom[2]}`;
  }
  return encodeURIComponent(emoji);
}
