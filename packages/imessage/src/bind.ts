import type {
  AttachmentSend,
  Content,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { resolveEffect, toContent } from "@skyline-ts/core/content";
import type {
  Channel,
  GroupContext,
  Platform,
  ResolvedLine,
  SendReceipt,
  User,
} from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
  type InboundGroup,
  type SendWireOptions,
} from "./grpc.js";
import {
  dedicatedLines,
  type ImessageConfig,
  type ImessageDedicatedConfig,
} from "./config.js";

function wireOpts(sendOpts?: SendOptions): SendWireOptions {
  return {
    effectId: resolveEffect(sendOpts?.effect),
    replyTo: sendOpts?.replyTo,
    richLink: sendOpts?.richLink,
    scan: sendOpts?.scan,
    subject: sendOpts?.subject,
  };
}

const chatGuidFor = (to: string): string =>
  /;[-+];/.test(to) || to.startsWith("chat") ? to : dmChatGuid(to);

function createBinder(host: SkylineHost, projectId: string) {
  const imFor = (to: string): ImessageGrpcClient => {
    const line = host.lineFor(to);
    if (!line.grpc) {
      throw new Error(`line ${to} is not an iMessage line`);
    }
    return line.grpc as ImessageGrpcClient;
  };

  const sendContent = async (
    to: string,
    input: string | Content,
    sendOpts?: SendOptions
  ): Promise<SendReceipt> => {
    const grpc = imFor(to);
    const id = host.newId();
    const sentAt = new Date();
    const content = toContent(input);
    const chatGuid = chatGuidFor(to);
    let guid: string | undefined;
    switch (content.type) {
      case "text": {
        const res = await grpc.send(
          chatGuid,
          content.text,
          id,
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "app": {
        const res = await grpc.sendApp(
          chatGuid,
          {
            ...content,
            effect: resolveEffect(sendOpts?.effect) ?? content.effect,
          },
          id
        );
        guid = res.guid;
        break;
      }
      case "flow": {
        const state = content.session
          ? { ...(content.data ?? {}), __session: content.session }
          : content.data;
        const res = await grpc.sendFlow(
          chatGuid,
          {
            appId: content.appId,
            appStoreId: content.appStoreId,
            bundleId: content.bundleId,
            caption: content.caption,
            image: content.image,
            screen: content.screen,
            spec: content.flow as Record<string, unknown> | undefined,
            state,
            subcaption: content.subcaption,
            summary: content.summary,
            teamId: content.teamId,
          },
          id
        );
        guid = res.guid;
        break;
      }
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      case "wa_contacts":
        host.unsupported("imessage", `sending ${content.type} content`);
        break;
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return { guid, sentAt };
  };

  const makeChannel = (to: string): Channel => {
    const chatGuid = chatGuidFor(to);
    return {
      contact: async () => {
        const card = await imFor(to).getContactCard(to);
        if (!card) {
          return null;
        }
        return {
          address: card.address,
          emails: card.emails ?? [],
          firstName: card.first_name || undefined,
          fullName: card.full_name || undefined,
          isContact: Boolean(card.is_contact),
          lastName: card.last_name || undefined,
          organization: card.organization || undefined,
          phones: card.phones ?? [],
        };
      },
      edit: (messageGuid, newText) =>
        imFor(to).editMessage(chatGuid, messageGuid, newText),
      group: {
        add: (handle) => imFor(to).addParticipant(chatGuid, handle),
        participants: async () => {
          const rows = await imFor(to).getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
        remove: (handle) => imFor(to).removeParticipant(chatGuid, handle),
        setName: (name) => imFor(to).setGroupName(chatGuid, name),
      },
      get phone() {
        return to;
      },
      platform: "imessage",
      reachable: () => imFor(to).checkAvailability(to, "imessage"),
      react: (messageGuid, reaction: Reaction, reactOpts) =>
        imFor(to).sendReaction(chatGuid, messageGuid, reaction, {
          remove: reactOpts?.remove,
        }),
      read: () => imFor(to).markRead(chatGuid),
      readReceipt: () => imFor(to).sendReadReceipt(chatGuid),
      reply: (messageGuid, content, sendOpts) =>
        sendContent(to, content, { ...sendOpts, replyTo: messageGuid }),
      send: (content, sendOpts) => sendContent(to, content, sendOpts),
      sendFile: async (file: AttachmentSend, sendOpts) => {
        const grpc = imFor(to);
        const id = host.newId();
        const sentAt = new Date();
        let attachmentGuid: string | undefined;
        if (file.data) {
          const bytes =
            file.data instanceof Uint8Array
              ? file.data
              : new Uint8Array(file.data);
          const up = await grpc.uploadAttachment(
            bytes,
            file.name ?? "attachment"
          );
          attachmentGuid = up.attachment_guid;
        }
        const res = await grpc.sendAttachment(
          chatGuid,
          id,
          {
            attachmentGuid,
            attachmentName: file.name,
            attachmentPath: file.path,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
          },
          wireOpts(sendOpts)
        );
        return { guid: res.guid, sentAt };
      },
      to,
      typing: async (on = true) => {
        const grpc = imFor(to);
        await (on ? grpc.startTyping(chatGuid) : grpc.stopTyping(chatGuid));
      },
      unsend: (messageGuid) => imFor(to).unsendMessage(chatGuid, messageGuid),
    };
  };

  const toGroupCtx = (
    fallbackHandle: string,
    g?: InboundGroup
  ): GroupContext | undefined =>
    g
      ? {
          chatId: g.chatId,
          isGroup: g.isGroup,
          participant: { id: g.participant ?? fallbackHandle },
          participants: g.participants?.map((id) => ({ id })),
        }
      : undefined;

  const senderUser = (id: string | undefined, fallback: string): User => ({
    id: id ?? fallback,
  });

  const connectLine = async (line: ResolvedLine): Promise<void> => {
    if (!line.phone) {
      return;
    }
    const grpc = new ImessageGrpcClient(
      grpcTarget(line.address),
      line.token || "",
      projectId
    );
    try {
      await grpc.waitForReady();
    } catch {
      grpc.close();
      return;
    }
    const to = line.phone;
    const channel = makeChannel(to);

    const messageStream = grpc.subscribeEvents({
      onApp(card, senderId, date, group) {
        host.queue.push([
          channel,
          {
            content: {
              appId: card.appId,
              caption: card.caption,
              data: card.data,
              summary: card.summary,
              type: "app",
            },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onEdit(edit, senderId, date, group) {
        host.emit(
          "edited",
          {
            group: toGroupCtx(to, group),
            messageGuid: edit.messageGuid,
            platform: "imessage",
            sender: senderUser(senderId, to),
            text: edit.text,
            timestamp: date,
          },
          channel
        );
      },
      onFlow(submission, senderId, date, group) {
        host.queue.push([
          channel,
          {
            content: {
              appId: submission.appId,
              done: submission.done,
              payment: submission.payment,
              screen: submission.screen,
              state: submission.state,
              type: "flow",
            },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onReaction(reaction, senderId, date, group) {
        host.emit(
          "reaction",
          {
            group: toGroupCtx(to, group),
            messageGuid: reaction.messageGuid,
            platform: "imessage",
            reaction: reaction.reaction,
            removed: reaction.removed,
            sender: senderUser(senderId, to),
            timestamp: date,
          },
          channel
        );
      },
      onReceived(text, senderId, date, group) {
        host.queue.push([
          channel,
          {
            content: { text, type: "text" },
            group: toGroupCtx(to, group),
            isFromMe: false,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
        ]);
      },
      onSendError(err) {
        host.emit(
          "error",
          {
            code: err.code,
            message: err.message,
            platform: "imessage",
            timestamp: new Date(),
            to,
          },
          channel
        );
      },
      onUnsend(messageGuid, senderId, date, group) {
        host.emit(
          "unsent",
          {
            group: toGroupCtx(to, group),
            messageGuid,
            platform: "imessage",
            sender: senderUser(senderId, to),
            timestamp: date,
          },
          channel
        );
      },
    });

    const chatStream = grpc.subscribeChatEvents({
      onRead(_read, date) {
        host.emit(
          "read",
          {
            platform: "imessage",
            sender: senderUser(undefined, to),
            timestamp: date,
          },
          channel
        );
      },
      onTyping(typing, date) {
        host.emit(
          "typing",
          {
            platform: "imessage",
            sender: senderUser(typing.displayName, to),
            timestamp: date,
            typing: typing.typing,
          },
          channel
        );
      },
    });

    host.live.set(to, {
      grpc,
      platform: "imessage",
      streams: [messageStream, chatStream],
    });
    host.ready.add(to);
  };

  return {
    platform: "imessage" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      dedicatedLines(config as ImessageDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: ImessageConfig): void {
  host.register(createBinder(host, host.projectId ?? "local"));
}
