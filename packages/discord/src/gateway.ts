import type { DiscordMessage, DiscordUser } from "./rest.js";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

/** Close codes Discord marks as fatal — reconnecting would just loop. */
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export interface DiscordReactionEvent {
  channelId: string;
  emoji: string;
  guildId?: string;
  messageId: string;
  removed: boolean;
  userId: string;
}

export interface DiscordTypingEvent {
  channelId: string;
  guildId?: string;
  userId: string;
}

export interface DiscordDeleteEvent {
  channelId: string;
  guildId?: string;
  messageId: string;
}

export interface DiscordGatewayHandlers {
  onDelete?: (event: DiscordDeleteEvent) => void;
  onMessage?: (message: DiscordMessage) => void;
  onMessageUpdate?: (message: DiscordMessage) => void;
  onReaction?: (event: DiscordReactionEvent) => void;
  onReady?: (bot: DiscordUser) => void;
  onTyping?: (event: DiscordTypingEvent) => void;
}

export interface DiscordGatewayOptions {
  handlers: DiscordGatewayHandlers;
  intents: number;
  token: string;
}

interface GatewayPayload {
  d?: unknown;
  op: number;
  s?: number | null;
  t?: string | null;
}

export interface DiscordGatewaySession {
  cancel: () => void;
}

export function connectDiscordGateway(
  opts: DiscordGatewayOptions
): DiscordGatewaySession {
  let ws: WebSocket | null = null;
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq: number | null = null;
  let sessionId: string | null = null;
  let resumeUrl: string | null = null;
  let acked = true;
  let backoff = 1000;

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const sendJson = (payload: GatewayPayload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const identify = () => {
    sendJson({
      d: {
        intents: opts.intents,
        properties: { browser: "skyline", device: "skyline", os: "linux" },
        token: opts.token,
      },
      op: 2,
    });
  };

  const resume = () => {
    sendJson({
      d: { seq: lastSeq, session_id: sessionId, token: opts.token },
      op: 6,
    });
  };

  const startHeartbeat = (intervalMs: number) => {
    clearHeartbeat();
    acked = true;
    const beat = () => {
      if (!acked) {
        // Missed ACK — the connection is a zombie; drop it and reconnect.
        try {
          ws?.close(4000);
        } catch {
          /* already closed */
        }
        return;
      }
      acked = false;
      sendJson({ d: lastSeq, op: 1 });
    };
    // First beat after a jittered fraction of the interval, per Discord guidance.
    reconnectTimer = setTimeout(() => {
      beat();
      heartbeatTimer = setInterval(beat, intervalMs);
    }, Math.floor(intervalMs * Math.random()));
  };

  const scheduleReconnect = (canResume: boolean) => {
    clearHeartbeat();
    if (closed) {
      return;
    }
    const delay = backoff + Math.floor(Math.random() * 500);
    backoff = Math.min(backoff * 2, 30_000);
    reconnectTimer = setTimeout(() => connect(canResume), delay);
  };

  const handleDispatch = (t: string, d: Record<string, unknown>) => {
    switch (t) {
      case "READY": {
        sessionId = (d.session_id as string) ?? null;
        resumeUrl = (d.resume_gateway_url as string) ?? null;
        backoff = 1000;
        opts.handlers.onReady?.(d.user as DiscordUser);
        break;
      }
      case "RESUMED":
        backoff = 1000;
        break;
      case "MESSAGE_CREATE":
        opts.handlers.onMessage?.(d as unknown as DiscordMessage);
        break;
      case "MESSAGE_UPDATE":
        opts.handlers.onMessageUpdate?.(d as unknown as DiscordMessage);
        break;
      case "MESSAGE_DELETE":
        opts.handlers.onDelete?.({
          channelId: d.channel_id as string,
          guildId: d.guild_id as string | undefined,
          messageId: d.id as string,
        });
        break;
      case "MESSAGE_REACTION_ADD":
      case "MESSAGE_REACTION_REMOVE": {
        const emoji = d.emoji as { id?: string; name?: string } | undefined;
        opts.handlers.onReaction?.({
          channelId: d.channel_id as string,
          emoji: emoji?.id
            ? `<:${emoji.name ?? "_"}:${emoji.id}>`
            : (emoji?.name ?? ""),
          guildId: d.guild_id as string | undefined,
          messageId: d.message_id as string,
          removed: t === "MESSAGE_REACTION_REMOVE",
          userId: d.user_id as string,
        });
        break;
      }
      case "TYPING_START":
        opts.handlers.onTyping?.({
          channelId: d.channel_id as string,
          guildId: d.guild_id as string | undefined,
          userId: d.user_id as string,
        });
        break;
      default:
        break;
    }
  };

  const handlePayload = (payload: GatewayPayload) => {
    if (typeof payload.s === "number") {
      lastSeq = payload.s;
    }
    switch (payload.op) {
      case 0:
        if (payload.t) {
          handleDispatch(payload.t, (payload.d as Record<string, unknown>) ?? {});
        }
        break;
      case 1:
        // Server asked for an immediate heartbeat.
        sendJson({ d: lastSeq, op: 1 });
        break;
      case 7:
        // Reconnect requested — resume if we can.
        try {
          ws?.close(4000);
        } catch {
          /* already closed */
        }
        break;
      case 9:
        // Invalid session. d === true means resumable.
        if (payload.d === true && sessionId) {
          scheduleReconnect(true);
        } else {
          sessionId = null;
          lastSeq = null;
          scheduleReconnect(false);
        }
        break;
      case 10: {
        const interval = (payload.d as { heartbeat_interval?: number })
          ?.heartbeat_interval;
        startHeartbeat(interval ?? 41_250);
        if (sessionId && lastSeq !== null) {
          resume();
        } else {
          identify();
        }
        break;
      }
      case 11:
        acked = true;
        break;
      default:
        break;
    }
  };

  function connect(canResume: boolean) {
    if (closed) {
      return;
    }
    const url = canResume && resumeUrl ? `${resumeUrl}?v=10&encoding=json` : GATEWAY_URL;
    if (!canResume) {
      sessionId = null;
      lastSeq = null;
    }
    ws = new WebSocket(url);
    ws.addEventListener("message", (ev) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(String(ev.data)) as GatewayPayload;
      } catch {
        return;
      }
      handlePayload(payload);
    });
    ws.addEventListener("close", (ev) => {
      clearHeartbeat();
      if (closed) {
        return;
      }
      if (FATAL_CLOSE_CODES.has(ev.code)) {
        closed = true;
        return;
      }
      scheduleReconnect(true);
    });
    ws.addEventListener("error", () => {
      // The close handler drives reconnection.
    });
  }

  connect(false);

  return {
    cancel() {
      closed = true;
      clearHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        ws?.close(1000);
      } catch {
        /* already closed */
      }
      ws = null;
    },
  };
}
