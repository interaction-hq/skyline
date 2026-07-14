import type {
  AttachmentSend,
  ContactContent,
  Content,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import { resolveEffect, toContent } from "@skyline-ts/core/content";
import type {
  Channel,
  GroupContext,
  Message,
  MessageAttachment,
  Platform,
  ResolvedLine,
  SendReceipt,
  User,
  VisualAssetInput,
} from "@skyline-ts/core";
import type { SkylineHost } from "@skyline-ts/core/host";
import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
  type InboundGroup,
  type InboundTextMessage,
  readAssetBytes,
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

async function resolveVisualAsset(
  input: VisualAssetInput
): Promise<Uint8Array | null> {
  if (input === "clear") {
    return null;
  }
  if (input.data) {
    return input.data;
  }
  if (input.path) {
    return readAssetBytes(input.path);
  }
  throw new Error("visual asset requires data or path");
}

async function uploadAttachmentGuid(
  grpc: ImessageGrpcClient,
  file: {
    data?: Uint8Array | ArrayBuffer;
    name?: string;
    path?: string;
  }
): Promise<string> {
  if (file.data) {
    const bytes =
      file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const up = await grpc.uploadAttachment(bytes, file.name ?? "attachment");
    return up.attachment_guid;
  }
  if (file.path) {
    const bytes = readAssetBytes(file.path);
    const up = await grpc.uploadAttachment(
      bytes,
      file.name ?? file.path.split("/").pop() ?? "attachment"
    );
    return up.attachment_guid;
  }
  throw new Error("attachment requires data or path");
}

function contactToText(contact: ContactContent): string {
  if (contact.vcard) {
    return contact.vcard;
  }
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  if (name) {
    lines.push(`FN:${name}`);
  }
  for (const phone of contact.phones ?? []) {
    lines.push(`TEL:${phone}`);
  }
  for (const email of contact.emails ?? []) {
    lines.push(`EMAIL:${email}`);
  }
  lines.push("END:VCARD");
  return lines.join("\n");
}

function inboundToMessage(
  inbound: InboundTextMessage,
  channelTo: string,
  toGroupCtx: (
    fallbackHandle: string,
    g?: InboundGroup
  ) => GroupContext | undefined,
  senderUser: (id: string | undefined, fallback: string) => User
): Message {
  const attachments: MessageAttachment[] | undefined = inbound.attachments?.map(
    (att) => ({
      guid: att.guid,
      mimeType: att.mimeType,
      name: att.name,
      size: att.size,
    })
  );
  return {
    attachments,
    content: { text: inbound.text, type: "text" },
    group: toGroupCtx(channelTo, inbound.group),
    guid: inbound.guid,
    isFromMe: inbound.isFromMe ?? false,
    platform: "imessage",
    replyTo: inbound.replyTo,
    sender: senderUser(inbound.senderId, channelTo),
    service: inbound.service,
    timestamp: inbound.date,
  };
}

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
      case "markdown": {
        const res = await grpc.send(
          chatGuid,
          content.body,
          id,
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "richlink": {
        const res = await grpc.send(chatGuid, content.url, id, {
          ...wireOpts(sendOpts),
          richLink: true,
        });
        guid = res.guid;
        break;
      }
      case "attachment": {
        if (content.url) {
          host.unsupported("imessage", "sending attachment from url");
        }
        const attachmentGuid = await uploadAttachmentGuid(grpc, content);
        const res = await grpc.sendAttachment(
          chatGuid,
          id,
          {
            attachmentGuid,
            attachmentName: content.name,
            attachmentPath: content.path,
            isAudioMessage: content.isAudioMessage,
            isSticker: content.isSticker,
          },
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "voice": {
        if (content.url) {
          host.unsupported("imessage", "sending voice from url");
        }
        const attachmentGuid = await uploadAttachmentGuid(grpc, content);
        const res = await grpc.sendAttachment(
          chatGuid,
          id,
          {
            attachmentGuid,
            attachmentName: content.name ?? "Audio Message.caf",
            attachmentPath: content.path,
            isAudioMessage: true,
          },
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "contact": {
        const res = await grpc.send(
          chatGuid,
          contactToText(content),
          id,
          wireOpts(sendOpts)
        );
        guid = res.guid;
        break;
      }
      case "poll": {
        const res = await grpc.sendPoll(
          chatGuid,
          content.title,
          content.options
        );
        guid = res.guid;
        break;
      }
      case "group": {
        const guids: string[] = [];
        const textParts: string[] = [];
        for (const item of content.items) {
          switch (item.type) {
            case "attachment":
            case "voice": {
              if (item.url) {
                host.unsupported("imessage", `group item ${item.type} from url`);
              }
              guids.push(await uploadAttachmentGuid(grpc, item));
              break;
            }
            case "text":
              textParts.push(item.text);
              break;
            case "markdown":
              textParts.push(item.body);
              break;
            case "richlink":
              textParts.push(item.url);
              break;
            default:
              host.unsupported("imessage", `group item ${item.type}`);
          }
        }
        if (guids.length === 0) {
          host.unsupported("imessage", "group without attachments");
        }
        const res = await grpc.sendMultipart(chatGuid, id, guids, {
          ...wireOpts(sendOpts),
          richLink: sendOpts?.richLink ?? textParts.some((part) =>
            /^https?:\/\//.test(part)
          ),
          text: textParts.length ? textParts.join("\n") : undefined,
        });
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

  const makeChannel = (to: string): Channel => {
    const chatGuid = chatGuidFor(to);
    const grpcFor = () => imFor(to);
    return {
      background: async (input) => {
        const grpc = grpcFor();
        const data = await resolveVisualAsset(input);
        if (data) {
          await grpc.setBackground(chatGuid, data);
        } else {
          await grpc.removeBackground(chatGuid);
        }
      },
      contact: async () => {
        const card = await grpcFor().getContactCard(to);
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
        grpcFor().editMessage(chatGuid, messageGuid, newText),
      getMessage: async (messageGuid) => {
        const raw = await grpcFor().getMessage(messageGuid);
        if (!raw) {
          return null;
        }
        return inboundToMessage(raw, to, toGroupCtx, senderUser);
      },
      group: {
        add: (handle) => grpcFor().addParticipant(chatGuid, handle),
        getIcon: () => grpcFor().getIcon(chatGuid),
        leave: () => grpcFor().leaveChat(chatGuid),
        participants: async () => {
          const rows = await grpcFor().getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
        remove: (handle) => grpcFor().removeParticipant(chatGuid, handle),
        setBackground: async (input) => {
          const grpc = grpcFor();
          const data = await resolveVisualAsset(input);
          if (data) {
            await grpc.setBackground(chatGuid, data);
          } else {
            await grpc.removeBackground(chatGuid);
          }
        },
        setIcon: async (input) => {
          const grpc = grpcFor();
          const data = await resolveVisualAsset(input);
          if (data) {
            await grpc.setIcon(chatGuid, data);
          } else {
            await grpc.removeIcon(chatGuid);
          }
        },
        setName: (name) => grpcFor().setGroupName(chatGuid, name),
      },
      get phone() {
        return to;
      },
      platform: "imessage",
      reachable: () => grpcFor().checkAvailability(to, "imessage"),
      react: (messageGuid, reaction: Reaction, reactOpts) =>
        grpcFor().sendReaction(chatGuid, messageGuid, reaction, {
          remove: reactOpts?.remove,
        }),
      read: () => grpcFor().markRead(chatGuid),
      readReceipt: () => grpcFor().sendReadReceipt(chatGuid),
      reply: (messageGuid, content, sendOpts) =>
        sendContent(to, content, { ...sendOpts, replyTo: messageGuid }),
      send: (content, sendOpts) => sendContent(to, content, sendOpts),
      sendFile: async (file: AttachmentSend, sendOpts) => {
        const grpc = grpcFor();
        const id = host.newId();
        const sentAt = new Date();
        let attachmentGuid: string | undefined;
        if (file.data || file.path) {
          attachmentGuid = await uploadAttachmentGuid(grpc, file);
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
      sendFiles: async (files, sendOpts) => {
        const grpc = grpcFor();
        const id = host.newId();
        const sentAt = new Date();
        const guids = await Promise.all(
          files.map((file) => uploadAttachmentGuid(grpc, file))
        );
        const res = await grpc.sendMultipart(chatGuid, id, guids, wireOpts(sendOpts));
        return { guid: res.guid, sentAt };
      },
      shareContactCard: () => grpcFor().shareContactInfo(chatGuid),
      to,
      typing: async (on = true) => {
        const grpc = grpcFor();
        await (on ? grpc.startTyping(chatGuid) : grpc.stopTyping(chatGuid));
      },
      unsend: (messageGuid) => grpcFor().unsendMessage(chatGuid, messageGuid),
    };
  };

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
      onReceived(inbound) {
        host.queue.push([
          channel,
          inboundToMessage(inbound, to, toGroupCtx, senderUser),
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
