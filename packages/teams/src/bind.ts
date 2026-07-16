import type {
  Content,
  ContentInput,
  SendOptions,
} from "@skyline-ts/core/content";
import type { Channel, Message, Platform } from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  bindMessage,
  contentSugar,
  messageFromSend,
  sendWithFallbacks,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "@skyline-ts/core/host";
import { type TeamsActivity, TeamsClient } from "./rest.js";
import {
  type TeamsConfig,
  type TeamsDedicatedConfig,
  teamsDedicatedLines,
} from "./config.js";
import { createTeamsWebhookHandler } from "./webhook.js";

interface ConversationRef {
  serviceUrl: string;
  tenantId?: string;
}

const webhookHandlers = new Map<
  string,
  (request: Request) => Promise<Response>
>();

/** Fetch handler for Microsoft Teams (Bot Framework) webhooks. */
export function teamsWebhookFetch(
  request: Request,
  scopeId?: string
): Promise<Response> {
  const handler = scopeId
    ? webhookHandlers.get(scopeId)
    : webhookHandlers.values().next().value;
  if (!handler) {
    return Promise.resolve(
      new Response("teams webhook not configured", { status: 503 })
    );
  }
  return handler(request);
}

function textOf(content: Content): string {
  switch (content.type) {
    case "text":
      return content.text;
    case "markdown":
      return content.body;
    case "rich_message":
      return content.markdown ?? content.text ?? "";
    case "app":
      return [content.caption, content.url].filter(Boolean).join("\n") || content.url;
    case "flow":
      return content.caption ?? content.summary ?? content.appId ?? "[Flow]";
    default:
      return "";
  }
}

function createBinder(host: SkylineHost) {
  const refs = new Map<string, ConversationRef>();

  const clientFor = (): TeamsClient => {
    const line = host.lineForPlatform("teams");
    const client = line.teams as TeamsClient | undefined;
    if (!client) {
      throw new Error("teams client not ready");
    }
    return client;
  };

  const refFor = (conversationId: string): ConversationRef => {
    const ref = refs.get(conversationId);
    if (!ref) {
      host.unsupported(
        "teams",
        "sending before an inbound activity (no conversation reference yet)"
      );
    }
    return ref;
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const client = clientFor();
    let guid: string | undefined;
    switch (content.type) {
      case "text":
      case "markdown":
      case "rich_message":
      case "app":
      case "flow": {
        const ref = refFor(to);
        const res = await client.sendActivity(ref.serviceUrl, to, {
          replyToId: sendOpts?.replyTo,
          text: textOf(content),
        });
        guid = res.id;
        break;
      }
      case "reply": {
        const ref = refFor(to);
        const res = await client.sendActivity(ref.serviceUrl, to, {
          replyToId: content.target.guid,
          text: textOf(content.content),
        });
        guid = res.id;
        break;
      }
      case "edit": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("edit: target message has no guid");
        }
        const ref = refFor(to);
        const res = await client.updateActivity(ref.serviceUrl, to, targetGuid, {
          text: textOf(content.content),
        });
        guid = res.id;
        break;
      }
      case "unsend": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("unsend: target message has no guid");
        }
        const ref = refFor(to);
        await client.deleteActivity(ref.serviceUrl, to, targetGuid);
        break;
      }
      case "read":
      case "typing":
        break;
      case "reaction":
      case "attachment":
      case "voice":
      case "group":
      case "media_album":
      case "location":
      case "rename":
      case "avatar":
      case "addMember":
      case "removeMember":
      case "leaveChannel":
      case "custom":
      case "stream_text":
      case "contact":
      case "richlink":
      case "poll":
      case "digital_touch":
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "keyboard":
      case "dice":
      case "forward":
      case "forward_many":
      case "copy":
      case "copy_many":
      case "invoice":
      case "game":
      case "checklist":
      case "paid_media":
      case "gift":
      case "story":
      case "giveaway":
      case "giveaway_winners":
      case "live_photo":
      case "wa_contacts":
        host.unsupported("teams", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, { senderId: to });
  };

  const inboundMessage = (
    channel: Channel,
    activity: TeamsActivity
  ): Message =>
    bindMessage(channel, {
      content: { text: activity.text ?? "", type: "text" },
      guid: activity.id ?? `${activity.conversation?.id ?? "conv"}-${Date.now()}`,
      isFromMe: false,
      platform: "teams",
      ...(activity.replyToId
        ? { replyTo: { messageGuid: activity.replyToId } }
        : {}),
      sender: {
        displayName: activity.from?.name,
        id: activity.from?.id ?? "unknown",
      },
      teams: {
        conversationId: activity.conversation?.id,
        serviceUrl: activity.serviceUrl,
      },
      timestamp: activity.timestamp ? new Date(activity.timestamp) : new Date(),
    });

  const makeChannel = (to: string, _scopeId?: string): Channel => {
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, resolved, sendOpts),
        content,
        "teams"
      );
    const sugar = contentSugar(send);
    channel = {
      ...sugar,
      ...unsupportedChatExtras((verb) => host.unsupported("teams", verb)),
      background: async () => host.unsupported("teams", "background"),
      contact: async () => null,
      edit: async (messageGuid, update) => {
        const text = typeof update === "string" ? update : update.text;
        if (text == null) {
          host.unsupported("teams", "edit without text");
        }
        const ref = refFor(to);
        await clientFor().updateActivity(ref.serviceUrl, to, messageGuid, { text });
      },
      focusStatus: async () => null,
      getAttachment: async () => null,
      getDisplayName: async () => null,
      getMessage: async () => null,
      group: {
        ...unsupportedGroupExtras((verb) => host.unsupported("teams", verb)),
        add: () => host.unsupported("teams", "group.add"),
        getIcon: async () => null,
        getName: async () => null,
        leave: () => host.unsupported("teams", "group.leave"),
        participants: async () => host.unsupported("teams", "group.participants"),
        remove: () => host.unsupported("teams", "group.remove"),
        setBackground: async () => host.unsupported("teams", "group.setBackground"),
        setIcon: async () => host.unsupported("teams", "group.setIcon"),
        setName: () => host.unsupported("teams", "group.setName"),
      },
      listMessages: async () => [],
      platform: "teams",
      poll: unsupportedPollOps((verb) => host.unsupported("teams", verb)),
      reachable: async () => true,
      react: async () => host.unsupported("teams", "react"),
      read: async () => {},
      readReceipt: async () => {},
      responding: (fn) => withResponding(channel, fn),
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async () => host.unsupported("teams", "sendFile"),
      sendFiles: async () => host.unsupported("teams", "sendFiles"),
      shareContactCard: async () => host.unsupported("teams", "shareContactCard"),
      shareLocation: async () => host.unsupported("teams", "shareLocation"),
      stopLocation: async () => host.unsupported("teams", "stopLocation"),
      updateLocation: async () => host.unsupported("teams", "updateLocation"),
      pin: async () => host.unsupported("teams", "pin"),
      unpin: async () => host.unsupported("teams", "unpin"),
      to,
      typing: async () => {},
      unsend: async (messageGuid) => {
        const ref = refFor(to);
        await clientFor().deleteActivity(ref.serviceUrl, to, messageGuid);
      },
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.teams) {
      return;
    }
    const scopeId = line.teams.appId;
    const client = new TeamsClient({
      appId: line.teams.appId,
      appPassword: line.teams.appPassword,
      tenantId: line.teams.tenantId,
    });

    const onActivity = (activity: TeamsActivity) => {
      const conversationId = activity.conversation?.id;
      if (!(conversationId && activity.serviceUrl)) {
        return;
      }
      refs.set(conversationId, {
        serviceUrl: activity.serviceUrl,
        tenantId: line.teams?.tenantId,
      });
      const channel = makeChannel(conversationId, scopeId);
      switch (activity.type) {
        case "message":
          host.queue.push([channel, inboundMessage(channel, activity)]);
          break;
        case "typing":
          host.emit(
            "typing",
            {
              platform: "teams",
              sender: { id: activity.from?.id ?? "unknown" },
              timestamp: new Date(),
              typing: true,
            },
            channel
          );
          break;
        default:
          break;
      }
    };

    webhookHandlers.set(
      scopeId,
      createTeamsWebhookHandler({ appId: line.teams.appId, onActivity })
    );

    host.live.set(scopeId, {
      platform: "teams",
      streams: [],
      teams: client,
    });
    host.ready.add(scopeId);
  };

  return {
    connectLine,
    dedicatedLines: (config: unknown) =>
      teamsDedicatedLines(config as TeamsDedicatedConfig),
    makeChannel,
    platform: "teams" as Platform,
  };
}

export function bind(host: SkylineHost, _config: TeamsConfig): void {
  host.register(createBinder(host));
}
