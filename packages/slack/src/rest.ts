const SLACK_API = "https://slack.com/api";

export interface SlackCreds {
  baseUrl?: string;
  botToken: string;
}

export interface SlackSendResult {
  channelId?: string;
  messageId?: string;
}

export class SlackError extends Error {
  constructor(
    readonly ok: boolean,
    readonly error: string | undefined,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "SlackError";
  }
}

interface SlackPostMessageResponse {
  channel?: string;
  error?: string;
  ok: boolean;
  ts?: string;
}

interface SlackUploadResponse {
  error?: string;
  file?: { id?: string };
  ok: boolean;
  shares?: { channel?: string; ts?: string }[];
}

export class SlackClient {
  private readonly base: string;
  private readonly token: string;

  constructor(creds: SlackCreds) {
    this.base = (creds.baseUrl ?? SLACK_API).replace(/\/+$/, "");
    this.token = creds.botToken;
  }

  private async post(
    method: string,
    body: Record<string, unknown>
  ): Promise<SlackPostMessageResponse> {
    const res = await fetch(`${this.base}/${method}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res
      .json()
      .catch(() => null)) as SlackPostMessageResponse | null;
    if (!(res.ok && json?.ok)) {
      throw new SlackError(
        json?.ok ?? false,
        json?.error,
        json?.error ?? `Slack ${method} failed (HTTP ${res.status})`,
        json
      );
    }
    return json;
  }

  sendText(
    channelId: string,
    text: string,
    opts?: { replyTo?: string }
  ): Promise<SlackSendResult> {
    const body: Record<string, unknown> = { channel: channelId, text };
    if (opts?.replyTo) {
      body.thread_ts = opts.replyTo;
    }
    return this.post("chat.postMessage", body).then((json) => ({
      channelId: json.channel,
      messageId: json.ts,
    }));
  }

  async uploadFile(
    channelId: string,
    file: { data: Uint8Array; mimeType?: string; name: string },
    opts?: { replyTo?: string }
  ): Promise<SlackSendResult> {
    const form = new FormData();
    form.append("channels", channelId);
    form.append(
      "file",
      new Blob([Uint8Array.from(file.data)], {
        type: file.mimeType ?? "application/octet-stream",
      }),
      file.name
    );
    form.append("filename", file.name);
    if (opts?.replyTo) {
      form.append("thread_ts", opts.replyTo);
    }

    const res = await fetch(`${this.base}/files.upload`, {
      body: form,
      headers: { authorization: `Bearer ${this.token}` },
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    });
    let json: SlackUploadResponse | null = null;
    try {
      json = (await res.json()) as SlackUploadResponse;
    } catch {
      json = null;
    }
    if (!(res.ok && json?.ok)) {
      throw new SlackError(
        json?.ok ?? false,
        json?.error,
        json?.error ?? `Slack files.upload failed (HTTP ${res.status})`,
        json
      );
    }
    const share = json.shares?.find((s) => s.channel === channelId);
    return {
      channelId,
      messageId: share?.ts ?? json.file?.id,
    };
  }

  addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.post("reactions.add", {
      channel: channelId,
      name: emoji.replace(/^:/, "").replace(/:$/, ""),
      timestamp: messageId,
    }).then(() => undefined);
  }

  removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    return this.post("reactions.remove", {
      channel: channelId,
      name: emoji.replace(/^:/, "").replace(/:$/, ""),
      timestamp: messageId,
    }).then(() => undefined);
  }

  editText(
    channelId: string,
    messageId: string,
    text: string
  ): Promise<SlackSendResult> {
    return this.post("chat.update", {
      channel: channelId,
      text,
      ts: messageId,
    }).then((json) => ({
      channelId: json.channel,
      messageId: json.ts ?? messageId,
    }));
  }

  markRead(channelId: string, messageId: string): Promise<void> {
    return this.post("conversations.mark", {
      channel: channelId,
      ts: messageId,
    }).then(() => undefined);
  }

  deleteMessage(channelId: string, messageId: string): Promise<void> {
    return this.post("chat.delete", {
      channel: channelId,
      ts: messageId,
    }).then(() => undefined);
  }

  close(): void {}
}
