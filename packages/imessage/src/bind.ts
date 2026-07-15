import type {
  AttachmentSend,
  ContactContent,
  Content,
  ContentInput,
  Reaction,
  SendOptions,
  StreamTextContent,
} from "@skyline-ts/core/content";
import { resolveContent, resolveEffect } from "@skyline-ts/core/content";
import type {
  Channel,
  GroupContext,
  Message,
  MessageAttachment,
  Platform,
  User,
  VisualAssetInput,
} from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  bindMessage,
  bindOutboundMessage,
  contentSugar,
  messageFromSend,
  readMediaBytes,
  sendWithFallbacks,
  UnsupportedError,
  unsupportedChatExtras,
  withResponding,
} from "@skyline-ts/core/host";
import {
  dmChatGuid,
  grpcTarget,
  ImessageGrpcClient,
  type InboundAttachment,
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
import { markdownToIMessageText } from "./markdown.js";

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
    url?: string;
  }
): Promise<string> {
  const bytes = await readMediaBytes({
    data: file.data,
    path: file.path,
    url: file.url,
  });
  const name =
    file.name ??
    file.path?.split("/").pop() ??
    (file.url ? "attachment" : "attachment");
  const up = await grpc.uploadAttachment(bytes, name);
  return up.attachment_guid;
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

const INITIAL_STREAM_THROTTLE_MS = 1000;
const STREAM_BACKOFF = 2;
const MAX_STREAM_EDITS = 5;

async function sendStreamText(
  grpc: ImessageGrpcClient,
  chatGuid: string,
  content: StreamTextContent,
  clientMessageId: string,
  sendOpts?: SendOptions
): Promise<string> {
  if (content.format === "markdown") {
    throw new UnsupportedError(
      "imessage",
      "sending stream_text content with markdown"
    );
  }
  let sentGuid: string | undefined;
  let full = "";
  let lastSent = "";
  let lastEditAt = 0;
  let editCount = 0;

  const flush = async (text: string) => {
    if (!(sentGuid && text !== lastSent)) {
      return;
    }
    await grpc.editMessage(chatGuid, sentGuid, text);
    lastSent = text;
    lastEditAt = Date.now();
    editCount += 1;
  };

  for await (const delta of content.stream()) {
    full += delta;
    if (!sentGuid) {
      const res = await grpc.send(
        chatGuid,
        full,
        clientMessageId,
        wireOpts(sendOpts)
      );
      sentGuid = res.guid;
      lastSent = full;
      lastEditAt = Date.now();
      continue;
    }
    const canInterim = editCount < MAX_STREAM_EDITS - 1;
    const gap = INITIAL_STREAM_THROTTLE_MS * STREAM_BACKOFF ** editCount;
    if (canInterim && Date.now() - lastEditAt >= gap) {
      await flush(full);
    }
  }
  if (!sentGuid) {
    throw new Error("stream_text produced no text");
  }
  await flush(full);
  return sentGuid;
}

function attachDownloads(
  grpc: ImessageGrpcClient,
  attachments: InboundAttachment[] | undefined
): MessageAttachment[] | undefined {
  if (!attachments?.length) {
    return;
  }
  return attachments.map((att) =>
    attachmentWithDownload(
      {
        guid: att.guid,
        mimeType: att.mimeType,
        name: att.name,
        size: att.size,
      },
      {
        read: () => grpc.downloadAttachment(att.guid),
        stream: async () => grpc.downloadAttachmentStream(att.guid),
      }
    )
  );
}

function inboundToMessage(
  channel: Channel,
  inbound: InboundTextMessage,
  channelTo: string,
  grpc: ImessageGrpcClient,
  toGroupCtx: (
    fallbackHandle: string,
    g?: InboundGroup
  ) => GroupContext | undefined,
  senderUser: (id: string | undefined, fallback: string) => User
): Message {
  return bindMessage(channel, {
    attachments: attachDownloads(grpc, inbound.attachments),
    content: { text: inbound.text, type: "text" },
    group: toGroupCtx(channelTo, inbound.group),
    guid: inbound.guid,
    isFromMe: inbound.isFromMe ?? false,
    platform: "imessage",
    replyTo: inbound.replyTo,
    sender: senderUser(inbound.senderId, channelTo),
    service: inbound.service,
    timestamp: inbound.date,
  });
}

async function groupChangeToContent(
  grpc: ImessageGrpcClient,
  event: {
    chatId: string;
    iconChanged?: boolean;
    iconRemoved?: boolean;
    participantAdded?: string;
    participantRemoved?: string;
    renamedTo?: string;
  }
): Promise<Content | undefined> {
  if (event.participantAdded) {
    return { type: "addMember", members: [event.participantAdded] };
  }
  if (event.participantRemoved) {
    return { type: "removeMember", members: [event.participantRemoved] };
  }
  if (event.renamedTo) {
    return { type: "rename", displayName: event.renamedTo };
  }
  if (event.iconRemoved) {
    return { type: "avatar", action: { kind: "clear" } };
  }
  if (event.iconChanged) {
    try {
      const data = await grpc.getIcon(event.chatId);
      if (!data) {
        return;
      }
      const snapshot = Uint8Array.from(data);
      return {
        type: "avatar",
        action: {
          kind: "set",
          mimeType: "image/png",
          read: async () => snapshot,
        },
      };
    } catch {
      return;
    }
  }
  return;
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
    channel: Channel,
    to: string,
    input: ContentInput,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const grpc = imFor(to);
    const id = host.newId();
    const content = await resolveContent(input);
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
        const rendered = markdownToIMessageText(content.body);
        const res = await grpc.send(chatGuid, rendered.text, id, {
          ...wireOpts(sendOpts),
          formatting: rendered.formatting.map((f) => ({
            length: f.length,
            start: f.start,
            type: f.type,
          })),
        });
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
      case "digital_touch": {
        const res = await grpc.sendDigitalTouch(chatGuid, {
          bpm: content.bpm,
          color: content.color,
          kind: content.kind,
          mediaPath: content.mediaPath,
          stillPath: content.stillPath,
          tapCount: content.tapCount,
        });
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
              guids.push(await uploadAttachmentGuid(grpc, item));
              break;
            }
            case "text":
              textParts.push(item.text);
              break;
            case "markdown":
              textParts.push(markdownToIMessageText(item.body).text);
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
      case "reply": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reply: target message has no guid");
        }
        return sendContent(channel, to, content.content, {
          ...sendOpts,
          replyTo: targetGuid,
        });
      }
      case "edit": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("edit: target message has no guid");
        }
        const inner = content.content;
        const newText =
          inner.type === "text"
            ? inner.text
            : inner.type === "markdown"
              ? inner.body
              : undefined;
        if (newText === undefined) {
          host.unsupported("imessage", `editing ${inner.type} content`);
        }
        await grpc.editMessage(chatGuid, targetGuid, newText);
        break;
      }
      case "unsend": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("unsend: target message has no guid");
        }
        await grpc.unsendMessage(chatGuid, targetGuid);
        break;
      }
      case "read": {
        await grpc.markRead(chatGuid);
        break;
      }
      case "typing": {
        if (content.state === "start") {
          await grpc.startTyping(chatGuid);
        } else {
          await grpc.stopTyping(chatGuid);
        }
        break;
      }
      case "reaction": {
        const targetGuid = content.target.guid;
        if (!targetGuid) {
          throw new Error("reaction: target message has no guid");
        }
        await grpc.sendReaction(chatGuid, targetGuid, content.emoji);
        break;
      }
      case "rename": {
        await grpc.setGroupName(chatGuid, content.displayName);
        break;
      }
      case "avatar": {
        if (content.action.kind === "clear") {
          await grpc.removeIcon(chatGuid);
        } else {
          await grpc.setIcon(chatGuid, await content.action.read());
        }
        break;
      }
      case "addMember": {
        for (const member of content.members) {
          await grpc.addParticipant(chatGuid, member);
        }
        break;
      }
      case "removeMember": {
        for (const member of content.members) {
          await grpc.removeParticipant(chatGuid, member);
        }
        break;
      }
      case "leaveChannel": {
        await grpc.leaveChat(chatGuid);
        break;
      }
      case "wa_media":
      case "wa_template":
      case "wa_interactive":
      case "wa_location":
      
      case "keyboard":
      case "location":
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
      case "rich_message":
      case "live_photo":
      case "media_album":
      case "wa_contacts":
      case "custom":
        host.unsupported("imessage", `sending ${content.type} content`);
        break;
      case "stream_text": {
        guid = await sendStreamText(grpc, chatGuid, content, id, sendOpts);
        break;
      }
      default: {
        const _exhaustive: never = content;
        throw new Error(`unsupported content: ${JSON.stringify(_exhaustive)}`);
      }
    }
    return messageFromSend(channel, content, guid, {
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: to,
    });
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
    let channel!: Channel;
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendContent(channel, to, resolved, sendOpts),
        content,
        "imessage"
      );
    const sugar = contentSugar(send);
    channel = {
      ...sugar,
      ...unsupportedChatExtras((verb) => host.unsupported("imessage", verb)),
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
      edit: (messageGuid, update) => {
        const text = typeof update === "string" ? update : update.text;
        if (text == null) {
          host.unsupported("imessage", "edit without text");
        }
        return grpcFor().editMessage(chatGuid, messageGuid, text);
      },
      focusStatus: async () => {
        try {
          return await grpcFor().getFocusStatus(to);
        } catch {
          return null;
        }
      },
      getAttachment: async (attachmentGuid) => {
        const grpc = grpcFor();
        const info = await grpc.getAttachmentInfo(attachmentGuid);
        if (!info) {
          return null;
        }
        return attachmentWithDownload(
          {
            guid: info.guid,
            mimeType: info.mimeType,
            name: info.name,
            size: info.size,
          },
          {
            read: () => grpc.downloadAttachment(info.guid),
            stream: async () => grpc.downloadAttachmentStream(info.guid),
          }
        );
      },
      getDisplayName: () => grpcFor().getChatDisplayName(chatGuid),
      getMessage: async (messageGuid) => {
        const raw = await grpcFor().getMessage(messageGuid);
        if (!raw) {
          return null;
        }
        return inboundToMessage(
          channel,
          raw,
          to,
          grpcFor(),
          toGroupCtx,
          senderUser
        );
      },
      group: {
        add: (handle) => sugar.add(handle),
        admins: async () => {
          const rows = await grpcFor().getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
        getIcon: () => grpcFor().getIcon(chatGuid),
        getName: () => grpcFor().getChatDisplayName(chatGuid),
        leave: () => sugar.leave(),
        memberCount: async () => {
          const rows = await grpcFor().getParticipants(chatGuid);
          return rows.length;
        },
        participants: async () => {
          const rows = await grpcFor().getParticipants(chatGuid);
          return rows.map((p) => ({ id: p.address }));
        },
        remove: (handle) => sugar.remove(handle),
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
          if (input === "clear") {
            await sugar.avatar("clear");
            return;
          }
          if (input.data) {
            await sugar.avatar(input.data, {
              mimeType: input.mimeType ?? "image/png",
            });
            return;
          }
          if (input.path) {
            await sugar.avatar(input.path, {
              mimeType: input.mimeType,
            });
            return;
          }
          await sugar.avatar("clear");
        },
        setName: (name) => sugar.rename(name),
      },
      listMessages: async (listOpts) => {
        const rows = await grpcFor().listMessages(chatGuid, listOpts);
        return rows.map((raw) =>
          inboundToMessage(channel, raw, to, grpcFor(), toGroupCtx, senderUser)
        );
      },
      poll: {
        addOption: (pollMessageGuid, optionText) =>
          grpcFor().addPollOption(chatGuid, pollMessageGuid, optionText),
        get: (pollMessageGuid) => grpcFor().getPoll(pollMessageGuid),
        stop: async () => host.unsupported("imessage", "poll.stop"),
        unvote: (pollMessageGuid) =>
          grpcFor().unvotePoll(chatGuid, pollMessageGuid),
        vote: (pollMessageGuid, optionIdentifier) =>
          grpcFor().votePoll(chatGuid, pollMessageGuid, optionIdentifier),
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
        send(content, { ...sendOpts, replyTo: messageGuid }),
      responding: (fn) => withResponding(channel, fn),
      send,
      sendFile: async (file: AttachmentSend, sendOpts) => {
        const grpc = grpcFor();
        const id = host.newId();
        const attachmentGuid = await uploadAttachmentGuid(grpc, {
          data: file.data,
          name: file.name,
          path: file.path,
          url: file.url,
        });
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
        return bindOutboundMessage(channel, {
          content: {
            type: "attachment",
            name: file.name,
            path: file.path,
            url: file.url,
            data: file.data
              ? file.data instanceof Uint8Array
                ? file.data
                : new Uint8Array(file.data)
              : undefined,
            isAudioMessage: file.audio,
          },
          guid: res.guid,
          replyTo: sendOpts?.replyTo
            ? { messageGuid: sendOpts.replyTo }
            : undefined,
          senderId: to,
        });
      },
      sendFiles: async (files, sendOpts) => {
        const grpc = grpcFor();
        const id = host.newId();
        const guids = await Promise.all(
          files.map((file) =>
            uploadAttachmentGuid(grpc, {
              data: file.data,
              name: file.name,
              path: file.path,
              url: file.url,
            })
          )
        );
        const res = await grpc.sendMultipart(
          chatGuid,
          id,
          guids,
          wireOpts(sendOpts)
        );
        return bindOutboundMessage(channel, {
          content: {
            type: "group",
            items: files.map((file) => ({
              type: "attachment" as const,
              name: file.name,
              path: file.path,
              data: file.data
                ? file.data instanceof Uint8Array
                  ? file.data
                  : new Uint8Array(file.data)
                : undefined,
              isAudioMessage: file.audio,
            })),
          },
          guid: res.guid,
          replyTo: sendOpts?.replyTo
            ? { messageGuid: sendOpts.replyTo }
            : undefined,
          senderId: to,
        });
      },
      shareContactCard: () => grpcFor().shareContactInfo(chatGuid),
      pin: async () => host.unsupported("imessage", "pin"),
      shareLocation: (locOpts) => grpcFor().shareLocation(chatGuid, locOpts),
      stopLocation: () => grpcFor().stopLocation(chatGuid),
      unpin: async () => host.unsupported("imessage", "unpin"),
      to,
      typing: async (on = true) => {
        const grpc = grpcFor();
        await (on ? grpc.startTyping(chatGuid) : grpc.stopTyping(chatGuid));
      },
      unsend: (messageGuid) => grpcFor().unsendMessage(chatGuid, messageGuid),
    };
    return channel;
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
          bindMessage(channel, {
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
          }),
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
          bindMessage(channel, {
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
          }),
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
          inboundToMessage(channel, inbound, to, grpc, toGroupCtx, senderUser),
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

    const groupStream = grpc.subscribeGroupEvents({
      onGroupChange(event) {
        host.emit(
          "group",
          {
            backgroundChanged: event.backgroundChanged,
            backgroundRemoved: event.backgroundRemoved,
            chatId: event.chatId,
            iconChanged: event.iconChanged,
            iconRemoved: event.iconRemoved,
            participantAdded: event.participantAdded,
            participantRemoved: event.participantRemoved,
            platform: "imessage",
            renamedTo: event.renamedTo,
            timestamp: event.date,
          },
          channel
        );

        void (async () => {
          const content = await groupChangeToContent(grpc, event);
          if (!content) {
            return;
          }
          host.queue.push([
            channel,
            bindMessage(channel, {
              content,
              guid: `${event.chatId}:group:${event.date.getTime()}`,
              isFromMe: false,
              platform: "imessage",
              sender: senderUser(undefined, to),
              timestamp: event.date,
              group: {
                chatId: event.chatId,
                isGroup: true,
                participant: senderUser(undefined, to),
              },
            }),
          ]);
        })();
      },
    });

    const pollStream = grpc.subscribePollEvents({
      onPollChange(event) {
        host.emit(
          "poll",
          {
            action: event.action,
            chatId: event.chatId,
            platform: "imessage",
            pollMessageGuid: event.pollMessageGuid,
            timestamp: event.date,
          },
          channel
        );
      },
    });

    host.live.set(to, {
      grpc,
      platform: "imessage",
      streams: [messageStream, chatStream, groupStream, pollStream],
    });
    host.ready.add(to);
  };

  return {
    platform: "imessage" as Platform,
    connectLine,
    async createChat(participants: string[]) {
      const line = [...host.live.values()].find((l) => l.platform === "imessage");
      if (!line?.grpc) {
        throw new Error("createChat: no ready iMessage line");
      }
      const grpc = line.grpc as ImessageGrpcClient;
      const { chatGuid } = await grpc.createChat(participants);
      return { to: chatGuid };
    },
    createFaceTimeLink(handles?: string[]) {
      const line = [...host.live.values()].find((l) => l.platform === "imessage");
      if (!line?.grpc) {
        throw new Error("createFaceTimeLink: no ready iMessage line");
      }
      return (line.grpc as ImessageGrpcClient).createFaceTimeLink(handles);
    },
    makeChannel,
    dedicatedLines: (config: unknown) =>
      dedicatedLines(config as ImessageDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: ImessageConfig): void {
  host.register(createBinder(host, host.projectId ?? "local"));
}
