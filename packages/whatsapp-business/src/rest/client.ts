
const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v23.0";

export interface WhatsappBusinessCreds {
    accessToken: string;
    apiVersion?: string;
    baseUrl?: string;
    phoneNumberId: string;
}

export interface WaMediaRef {
    caption?: string;
    filename?: string;
    id?: string;
    link?: string;
}

export type WaInteractive = Record<string, unknown>;
export type WaTemplate = Record<string, unknown>;
export type WaContact = Record<string, unknown>;

export interface WaLocation {
  address?: string;
  latitude: number | string;
  longitude: number | string;
  name?: string;
}

export interface WaSendResult {
    messageId?: string;
    waId?: string;
}

export class WhatsappBusinessError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "WhatsappBusinessError";
  }
}

interface GraphMessagesResponse {
  contacts?: { wa_id?: string }[];
  error?: { message?: string; code?: number; error_data?: unknown };
  messages?: { id: string }[];
}

export class WhatsappBusinessClient {
  private readonly base: string;
  private readonly version: string;
  private readonly phoneNumberId: string;
  private readonly token: string;

  constructor(creds: WhatsappBusinessCreds) {
    this.base = (creds.baseUrl ?? GRAPH_BASE).replace(/\/+$/, "");
    this.version = creds.apiVersion ?? DEFAULT_API_VERSION;
    this.phoneNumberId = creds.phoneNumberId;
    this.token = creds.accessToken;
  }

    private static recipient(to: string): string {
    return to.replace(/^\+/, "");
  }

  private context(
    replyTo?: string
  ): { context: { message_id: string } } | undefined {
    return replyTo ? { context: { message_id: replyTo } } : undefined;
  }

  private async post(body: Record<string, unknown>): Promise<WaSendResult> {
    const url = `${this.base}/${this.version}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await res
      .json()
      .catch(() => null)) as GraphMessagesResponse | null;
    if (!res.ok || json?.error) {
      const err = json?.error;
      throw new WhatsappBusinessError(
        res.status,
        err?.code,
        err?.message ?? `WhatsApp send failed (HTTP ${res.status})`,
        err?.error_data
      );
    }
    return {
      messageId: json?.messages?.[0]?.id,
      waId: json?.contacts?.[0]?.wa_id,
    };
  }

  private message(
    to: string,
    fields: Record<string, unknown>,
    replyTo?: string
  ): Promise<WaSendResult> {
    return this.post({
      recipient_type: "individual",
      to: WhatsappBusinessClient.recipient(to),
      ...this.context(replyTo),
      ...fields,
    });
  }

    sendText(
    to: string,
    text: string,
    opts?: { replyTo?: string; previewUrl?: boolean }
  ): Promise<WaSendResult> {
    return this.message(
      to,
      {
        text: { body: text, preview_url: opts?.previewUrl ?? false },
        type: "text",
      },
      opts?.replyTo
    );
  }

    sendMedia(
    to: string,
    kind: "image" | "video" | "audio" | "document" | "sticker",
    media: WaMediaRef,
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    const payload: Record<string, unknown> = {};
    if (media.id) {
      payload.id = media.id;
    }
    if (media.link) {
      payload.link = media.link;
    }
    if (media.caption && kind !== "audio" && kind !== "sticker") {
      payload.caption = media.caption;
    }
    if (media.filename && kind === "document") {
      payload.filename = media.filename;
    }
    return this.message(to, { type: kind, [kind]: payload }, opts?.replyTo);
  }

    sendReaction(
    to: string,
    messageId: string,
    emoji: string
  ): Promise<WaSendResult> {
    return this.message(to, {
      reaction: { emoji, message_id: messageId },
      type: "reaction",
    });
  }

    sendLocation(
    to: string,
    location: WaLocation,
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(
      to,
      {
        location: {
          address: location.address,
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          name: location.name,
        },
        type: "location",
      },
      opts?.replyTo
    );
  }

    sendContacts(
    to: string,
    contacts: WaContact[],
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(to, { contacts, type: "contacts" }, opts?.replyTo);
  }

    sendInteractive(
    to: string,
    interactive: WaInteractive,
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(
      to,
      { interactive, type: "interactive" },
      opts?.replyTo
    );
  }

    sendTemplate(
    to: string,
    template: WaTemplate,
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(to, { template, type: "template" }, opts?.replyTo);
  }

    async markRead(
    messageId: string,
    opts?: { typing?: boolean }
  ): Promise<void> {
    const url = `${this.base}/${this.version}/${this.phoneNumberId}/messages`;
    const body: Record<string, unknown> = {
      message_id: messageId,
      messaging_product: "whatsapp",
      status: "read",
    };
    if (opts?.typing) {
      body.typing_indicator = { type: "text" };
    }
    const res = await fetch(url, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const json = (await res
        .json()
        .catch(() => null)) as GraphMessagesResponse | null;
      const err = json?.error;
      throw new WhatsappBusinessError(
        res.status,
        err?.code,
        err?.message ?? `WhatsApp read/typing failed (HTTP ${res.status})`,
        err?.error_data
      );
    }
  }

    close(): void {
  }
}
