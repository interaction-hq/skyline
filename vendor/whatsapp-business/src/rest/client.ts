// WhatsApp Business — HTTPS client for the Meta Graph Cloud API.
//
// Sends go to `POST /{v}/{phoneNumberId}/messages` on `graph.facebook.com`
// with a bearer access token. Inbound arrives via webhook and is fanned out
// separately. This client is send-oriented: text, media, reactions, templates,
// interactive, location, contacts, stickers, flows, plus typing/read acks.

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v23.0";

/** Resolved credentials for one business number. */
export interface WhatsappBusinessCreds {
  /** Bearer access token (system-user or broker-minted, short-lived). */
  accessToken: string;
  /** Graph API version, e.g. "v23.0". Defaults to a pinned recent version. */
  apiVersion?: string;
  /** Override the Graph host (tests / regional endpoints). */
  baseUrl?: string;
  /** Meta phone_number_id the messages send from. */
  phoneNumberId: string;
}

/** A Cloud API media reference: an uploaded media id or a hosted https link. */
export interface WaMediaRef {
  /** Caption shown with the media (image/video/document). */
  caption?: string;
  /** Document display filename. */
  filename?: string;
  /** Uploaded media object id (from the Media Upload API). */
  id?: string;
  /** Public https URL Meta fetches the media from. */
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

/** The normalized result of a Cloud API send. */
export interface WaSendResult {
  /** wamid.* message id Meta assigned. */
  messageId?: string;
  /** Resolved wa_id for the recipient, when returned. */
  waId?: string;
}

/** A Cloud API error surfaced as a typed, catchable error. */
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

/**
 * A send-only client for one business number. Every `send*` verb builds the
 * matching Cloud API payload and POSTs it; `react`, `typing`, and `read` map to
 * their respective message/acknowledgement shapes. Recipients are E.164 without
 * the leading `+` per Meta convention — we strip it defensively.
 */
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

  /** E.164 recipient, minus the leading "+" Meta rejects. */
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

  /** Send a text message. `previewUrl` renders link previews. */
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

  /** Send a media message (image/video/audio/document/sticker) by id or link. */
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
    // audio and sticker do not accept a caption; the others do.
    if (media.caption && kind !== "audio" && kind !== "sticker") {
      payload.caption = media.caption;
    }
    if (media.filename && kind === "document") {
      payload.filename = media.filename;
    }
    return this.message(to, { type: kind, [kind]: payload }, opts?.replyTo);
  }

  /** React to a message with an emoji ("" clears the reaction). */
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

  /** Send a location pin. */
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

  /** Send one or more contact cards. */
  sendContacts(
    to: string,
    contacts: WaContact[],
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(to, { contacts, type: "contacts" }, opts?.replyTo);
  }

  /**
   * Send an interactive message (reply buttons, list, product, product_list,
   * flow, catalog). Pass the fully-formed Cloud API `interactive` object.
   */
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

  /**
   * Send a template message. Required to open a conversation outside the 24h
   * customer-service window. Pass the fully-formed Cloud API `template` object.
   */
  sendTemplate(
    to: string,
    template: WaTemplate,
    opts?: { replyTo?: string }
  ): Promise<WaSendResult> {
    return this.message(to, { template, type: "template" }, opts?.replyTo);
  }

  /**
   * Mark an inbound message read, optionally showing a typing indicator to the
   * user while a reply is composed. This is the Cloud API status endpoint shape.
   */
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

  /** Send-only: there is no persistent connection to tear down. */
  close(): void {
    // no-op; kept for parity with the streaming transports.
  }
}
