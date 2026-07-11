const SLACK_API = "https://slack.com/api";

export interface SlackInboundHandlers {
  onEdited?: (event: {
    channelId: string;
    messageId: string;
    text: string;
    userId: string;
  }) => void;
  onReaction?: (event: {
    channelId: string;
    emoji: string;
    messageId: string;
    removed: boolean;
    userId: string;
  }) => void;
  onText?: (event: {
    botId?: string;
    channelId: string;
    isBot?: boolean;
    messageId: string;
    subtype?: string;
    text: string;
    threadTs?: string;
    userId: string;
  }) => void;
}

export interface SlackSocketOptions {
  appToken: string;
  handlers: SlackInboundHandlers;
}

export interface SlackSocketSession {
  cancel: () => void;
}

interface SlackEnvelope {
  envelope_id?: string;
  payload?: {
    event?: {
      bot_id?: string;
      channel?: string;
      item?: { channel?: string; ts?: string };
      message?: {
        text?: string;
        ts?: string;
        user?: string;
      };
      reaction?: string;
      subtype?: string;
      text?: string;
      thread_ts?: string;
      ts?: string;
      type?: string;
      user?: string;
    };
  };
  type?: string;
}

interface ConnectionsOpenResponse {
  error?: string;
  ok: boolean;
  url?: string;
}

async function openSocketUrl(appToken: string): Promise<string> {
  const res = await fetch(`${SLACK_API}/apps.connections.open`, {
    headers: {
      authorization: `Bearer ${appToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res
    .json()
    .catch(() => null)) as ConnectionsOpenResponse | null;
  if (!(res.ok && json?.ok && json.url)) {
    throw new Error(
      json?.error ?? `Slack apps.connections.open failed (HTTP ${res.status})`
    );
  }
  return json.url;
}

export function connectSlackSocket(
  opts: SlackSocketOptions
): SlackSocketSession {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const ack = (envelopeId: string) => {
    if (closed || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify({ envelope_id: envelopeId }));
  };

  const handleEnvelope = (envelope: SlackEnvelope) => {
    if (envelope.type === "hello" || envelope.type === "disconnect") {
      return;
    }
    if (envelope.envelope_id) {
      ack(envelope.envelope_id);
    }

    const event = envelope.payload?.event;
    if (!event?.type) {
      return;
    }

    if (event.type === "message") {
      if (event.subtype === "message_changed" && event.message?.ts) {
        opts.handlers.onEdited?.({
          channelId: event.channel ?? "",
          messageId: event.message.ts,
          text: event.message.text ?? "",
          userId: event.message.user ?? event.user ?? "unknown",
        });
        return;
      }
      if (event.subtype && event.subtype !== "bot_message") {
        return;
      }
      if (!(event.text && event.channel && event.ts)) {
        return;
      }
      opts.handlers.onText?.({
        botId: event.bot_id,
        channelId: event.channel,
        isBot: Boolean(event.bot_id) || event.subtype === "bot_message",
        messageId: event.ts,
        subtype: event.subtype,
        text: event.text,
        threadTs: event.thread_ts,
        userId: event.user ?? event.bot_id ?? "unknown",
      });
      return;
    }

    if (event.type === "reaction_added" || event.type === "reaction_removed") {
      const channelId = event.item?.channel;
      const messageId = event.item?.ts;
      if (!(channelId && messageId && event.reaction && event.user)) {
        return;
      }
      opts.handlers.onReaction?.({
        channelId,
        emoji: event.reaction,
        messageId,
        removed: event.type === "reaction_removed",
        userId: event.user,
      });
    }
  };

  const connect = () => {
    if (closed) {
      return;
    }
    void openSocketUrl(opts.appToken)
      .then((url) => {
        if (closed) {
          return;
        }
        ws = new WebSocket(url);
        ws.addEventListener("message", (ev) => {
          let envelope: SlackEnvelope;
          try {
            envelope = JSON.parse(String(ev.data)) as SlackEnvelope;
          } catch {
            return;
          }
          handleEnvelope(envelope);
        });
        ws.addEventListener("close", () => {
          if (closed) {
            return;
          }
          reconnectTimer = setTimeout(connect, 1500);
        });
      })
      .catch(() => {
        if (closed) {
          return;
        }
        reconnectTimer = setTimeout(connect, 3000);
      });
  };

  connect();

  return {
    cancel() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
      ws = null;
    },
  };
}
