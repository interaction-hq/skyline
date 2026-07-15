import type {
  AttachmentSend,
  Content,
  ContentInput,
  Reaction,
  SendOptions,
} from "@skyline-ts/core/content";
import type {
  BusinessConnectionInfo,
  BusinessOps,
  Channel,
  EphemeralOps,
  GameHighScore,
  GiftsPage,
  Message,
  MessageEdit,
  OwnedGift,
  Platform,
  PostsOps,
  PreparedInlineResult,
  PreparedKeyboardResult,
  StickerInfo,
  StickerOps,
  StickerSet,
  StoryOps,
  StoryRef,
  User,
  WebAppOps,
} from "@skyline-ts/core";
import type { ResolvedLine, SkylineHost } from "@skyline-ts/core/host";
import {
  attachmentWithDownload,
  contentSugar,
  messageFromSend,
  mimeToMediaName,
  readMediaBytes,
  sendWithFallbacks,
  withResponding,
} from "@skyline-ts/core/host";
import {
  TelegramClient,
  asTelegramParams,
  createTelegramWebhookHandler,
  ensureTelegramWebhook,
  inlineQueryResultToTelegram,
  replyMarkupToTelegram,
  startTelegramPolling,
} from "./client.js";
import {
  botIdFromToken,
  telegramDedicatedLines,
  type TelegramConfig,
  type TelegramDedicatedConfig,
} from "./config.js";
import {
  dispatchTelegramUpdate,
  getCachedPoll,
  rememberPollFromTelegram,
} from "./inbound.js";
import {
  isAllowedReactionEmoji,
  normalizeReactionEmoji,
  sendContent,
} from "./send.js";

function telegramUser(user: {
  first_name?: string;
  id: number;
  username?: string;
}): User {
  return {
    displayName: user.first_name ?? user.username,
    handle: user.username,
    id: String(user.id),
  };
}

const webhookHandlers = new Map<
  string,
  (request: Request) => Promise<Response>
>();

/** Fetch handler registered when `telegram.config({ webhookUrl })` is used. */
export function telegramWebhookFetch(
  request: Request,
  botId?: string
): Promise<Response> {
  const handler = botId
    ? webhookHandlers.get(botId)
    : webhookHandlers.values().next().value;
  if (!handler) {
    return Promise.resolve(
      new Response("telegram webhook not configured", { status: 503 })
    );
  }
  return handler(request);
}

function createBinder(host: SkylineHost) {
  const clientFor = (_to: string): TelegramClient => {
    // Lines are keyed by bot id; chat targets (@user / chat_id) are not live keys.
    const line = host.lineForPlatform("telegram");
    const client = line.telegram as TelegramClient | undefined;
    if (!client) {
      throw new Error("telegram client not ready");
    }
    return client;
  };

  const sendResolved = async (
    channel: Channel,
    to: string,
    content: Content,
    sendOpts?: SendOptions
  ): Promise<Message | undefined> => {
    const client = clientFor(to);
    const guid = await sendContent(client, to, content, sendOpts, (verb) =>
      host.unsupported("telegram", verb)
    );
    if (!guid) {
      return;
    }
    return messageFromSend(channel, content, guid, {
      replyTo: sendOpts?.replyTo
        ? { messageGuid: sendOpts.replyTo }
        : undefined,
      senderId: to,
      threadId: sendOpts?.threadId,
    });
  };

  const editMessage = async (
    to: string,
    messageGuid: string,
    update: MessageEdit
  ): Promise<void> => {
    const client = clientFor(to);
    if (typeof update === "string") {
      await client.editMessageText(to, messageGuid, update);
      return;
    }
    if (update.text != null) {
      await client.editMessageText(to, messageGuid, update.text);
    }
    if (update.caption != null) {
      await client.call("editMessageCaption", {
        caption: update.caption,
        chat_id: to,
        message_id: Number(messageGuid),
      });
    }
    if (update.markup !== undefined) {
      await client.call("editMessageReplyMarkup", {
        chat_id: to,
        message_id: Number(messageGuid),
        reply_markup: replyMarkupToTelegram(update.markup),
      });
    }
    if (update.media) {
      const file = update.media;
      const bytes = await readMediaBytes({
        data:
          file.data instanceof ArrayBuffer
            ? new Uint8Array(file.data)
            : file.data,
        path: file.path,
        url: file.url,
      });
      const mime = file.mimeType ?? "application/octet-stream";
      const name = file.name ?? mimeToMediaName(mime, "file");
      const kind = mime.startsWith("video/")
        ? "video"
        : mime.startsWith("image/")
          ? "photo"
          : "document";
      await client.upload(
        "editMessageMedia",
        {
          chat_id: to,
          media: JSON.stringify({
            media: "attach://file",
            type: kind,
          }),
          message_id: Number(messageGuid),
        },
        { bytes, field: "file", filename: name, mimeType: mime }
      );
    }
    if (update.checklist !== undefined) {
      const checklist = update.checklist;
      await client.call("editMessageChecklist", {
        chat_id: to,
        checklist: {
          others_can_add_tasks: checklist.othersCanAddTasks,
          others_can_mark_tasks_as_done: checklist.othersCanMarkTasksAsDone,
          tasks: checklist.items.map((item, index) => ({
            id: item.id ?? String(index + 1),
            text: item.text,
          })),
          title: checklist.title,
        },
        message_id: Number(messageGuid),
      });
    }
  };

  const makeChannel = (to: string): Channel => {
    let channel!: Channel;
    const client = () => clientFor(to);
    const send = (content: ContentInput, sendOpts?: SendOptions) =>
      sendWithFallbacks(
        (resolved) => sendResolved(channel, to, resolved, sendOpts),
        content,
        "telegram"
      );
    const sugar = contentSugar(send);
    const listAdmins = async () => {
      const admins = await client().call<
        { user: { id: number; username?: string; first_name?: string } }[]
      >("getChatAdministrators", { chat_id: to });
      return admins.map((row) => ({
        displayName: row.user.first_name ?? row.user.username,
        handle: row.user.username,
        id: String(row.user.id),
      }));
    };
    channel = {
      ...sugar,
      add: async () =>
        host.unsupported(
          "telegram",
          "add — bots cannot add members; use invite.create / invite.export"
        ),
      answerCallback: (queryId, opts) =>
        client().answerCallbackQuery(queryId, opts).then(() => undefined),
      answerInline: async (queryId, results, opts) => {
        await client().call("answerInlineQuery", {
          inline_query_id: queryId,
          results: results.map(inlineQueryResultToTelegram),
          ...asTelegramParams(opts ?? {}),
        });
      },
      answerPreCheckout: async (queryId, opts) => {
        await client().call("answerPreCheckoutQuery", {
          error_message: opts?.errorMessage,
          ok: opts?.ok ?? !opts?.errorMessage,
          pre_checkout_query_id: queryId,
        });
      },
      answerShipping: async (queryId, opts) => {
        await client().call("answerShippingQuery", {
          error_message: opts.errorMessage,
          ok: opts.ok,
          shipping_options: opts.shippingOptions?.map((option) =>
            asTelegramParams(option)
          ),
          shipping_query_id: queryId,
        });
      },
      answerWebApp: async (queryId, result) => {
        await client().call("answerWebAppQuery", {
          result: inlineQueryResultToTelegram(result),
          web_app_query_id: queryId,
        });
      },
      approveJoin: async (userId) => {
        await client().call("approveChatJoinRequest", {
          chat_id: to,
          user_id: Number(userId),
        });
      },
      background: async () => host.unsupported("telegram", "background"),
      banSender: async (senderChatId) => {
        await client().call("banChatSenderChat", {
          chat_id: to,
          sender_chat_id: Number(senderChatId),
        });
      },
      business: createTelegramBusinessOps((method, params) =>
        client().call(method, params)
      ),
      clearReactions: async (messageGuid) => {
        await client().call("deleteAllMessageReactions", {
          chat_id: to,
          message_id: Number(messageGuid),
        });
      },
      commands: {
        clear: async (opts) => {
          await client().call(
            "deleteMyCommands",
            asTelegramParams(opts ?? {})
          );
        },
        get: async (opts) => {
          const commands = await client().call<
            { command: string; description: string }[]
          >("getMyCommands", asTelegramParams(opts ?? {}));
          return commands.map((command) => ({
            command: command.command,
            description: command.description,
          }));
        },
        set: async (commands, opts) => {
          await client().call("setMyCommands", {
            commands,
            ...asTelegramParams(opts ?? {}),
          });
        },
      },
      contact: async () => null,
      declineJoin: async (userId) => {
        await client().call("declineChatJoinRequest", {
          chat_id: to,
          user_id: Number(userId),
        });
      },
      edit: (messageGuid, update) => editMessage(to, messageGuid, update),
      ephemeral: createTelegramEphemeralOps(
        (method, params) => client().call(method, params),
        to
      ),
      focusStatus: async () => null,
      game: {
        highScores: async (messageGuid, opts) => {
          const rows = await client().call<
            {
              position: number;
              score: number;
              user: { first_name?: string; id: number; username?: string };
            }[]
          >("getGameHighScores", {
            chat_id: to,
            message_id: Number(messageGuid),
            ...asTelegramParams(opts ?? {}),
          });
          return rows.map(
            (row): GameHighScore => ({
              position: row.position,
              score: row.score,
              user: telegramUser(row.user),
            })
          );
        },
        setScore: async (userId, score, opts) => {
          await client().call("setGameScore", {
            chat_id: to,
            score,
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
        },
      },
      getAttachment: async (guid) => {
        const bytes = await client().downloadFile(guid);
        return attachmentWithDownload(
          { guid, size: bytes.length },
          {
            read: async () => bytes,
            stream: async () =>
              new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                },
              }),
          }
        );
      },
      getDisplayName: async () => {
        try {
          const chat = await client().getChat(to);
          return chat.title ?? null;
        } catch {
          return null;
        }
      },
      getMember: async (userId) => {
        try {
          const member = await client().call<{
            user: { id: number; username?: string; first_name?: string };
          }>("getChatMember", {
            chat_id: to,
            user_id: Number(userId),
          });
          return {
            displayName: member.user.first_name ?? member.user.username,
            handle: member.user.username,
            id: String(member.user.id),
          };
        } catch {
          return null;
        }
      },
      getMessage: async () => null,
      getPersonalMessages: async (userId, opts) => {
        const result = await client().call<{
          messages?: {
            date?: number;
            message_id: number;
            text?: string;
          }[];
        }>("getUserPersonalChatMessages", {
          user_id: Number(userId),
          limit: opts?.limit,
          offset_id: opts?.offsetId,
        });
        return {
          messages: (result.messages ?? []).map((msg) => ({
            messageGuid: String(msg.message_id),
            text: msg.text,
            timestamp:
              msg.date != null ? new Date(msg.date * 1000) : undefined,
          })),
        };
      },
      info: async () => {
        const chat = await client().call<{
          description?: string;
          id: number;
          invite_link?: string;
          is_forum?: boolean;
          title?: string;
          type: string;
          username?: string;
        }>("getChat", { chat_id: to });
        return {
          description: chat.description,
          id: String(chat.id),
          inviteLink: chat.invite_link,
          isForum: chat.is_forum,
          title: chat.title,
          type: chat.type,
          username: chat.username,
        };
      },
      group: {
        add: () =>
          host.unsupported(
            "telegram",
            "group.add — use invite.create / invite.export"
          ),
        admins: listAdmins,
        getIcon: async () => null,
        getName: async () => {
          try {
            const chat = await client().getChat(to);
            return chat.title ?? null;
          } catch {
            return null;
          }
        },
        leave: () => sugar.leave(),
        memberCount: async () =>
          client().call<number>("getChatMemberCount", { chat_id: to }),
        /** Bot API: administrators (full member lists are not available to bots). */
        participants: listAdmins,
        remove: (handle) => sugar.remove(handle),
        setBackground: async () =>
          host.unsupported("telegram", "group.setBackground"),
        setIcon: (input) => sugar.avatar(input as never),
        setName: (name) => sugar.rename(name),
      },
      invite: {
        create: async (opts) => {
          const link = await client().call<{ invite_link: string }>(
            "createChatInviteLink",
            { chat_id: to, ...asTelegramParams(opts ?? {}) }
          );
          return link.invite_link;
        },
        createSubscription: async (opts) => {
          const link = await client().call<{ invite_link: string }>(
            "createChatSubscriptionInviteLink",
            { chat_id: to, ...asTelegramParams(opts) }
          );
          return link.invite_link;
        },
        edit: async (inviteLink, opts) => {
          const link = await client().call<{ invite_link: string }>(
            "editChatInviteLink",
            {
              chat_id: to,
              invite_link: inviteLink,
              ...asTelegramParams(opts ?? {}),
            }
          );
          return link.invite_link;
        },
        editSubscription: async (inviteLink, opts) => {
          const link = await client().call<{ invite_link: string }>(
            "editChatSubscriptionInviteLink",
            {
              chat_id: to,
              invite_link: inviteLink,
              ...asTelegramParams(opts ?? {}),
            }
          );
          return link.invite_link;
        },
        export: async () =>
          client().call<string>("exportChatInviteLink", { chat_id: to }),
        revoke: async (inviteLink) => {
          await client().call("revokeChatInviteLink", {
            chat_id: to,
            invite_link: inviteLink,
          });
        },
      },
      invoiceLink: async (input) => {
        const {
          currency,
          description,
          payload,
          prices,
          providerToken,
          title,
          ...rest
        } = input;
        return client().call<string>("createInvoiceLink", {
          currency,
          description,
          payload,
          prices,
          provider_token: providerToken,
          title,
          ...asTelegramParams(rest),
        });
      },
      listMessages: async () => [],
      pin: async (messageGuid, opts) => {
        await client().call("pinChatMessage", {
          chat_id: to,
          disable_notification: opts?.silent,
          message_id: Number(messageGuid),
        });
      },
      platform: "telegram",
      poll: {
        addOption: async () => host.unsupported("telegram", "poll.addOption"),
        get: async (pollMessageGuid) => getCachedPoll(to, pollMessageGuid),
        stop: async (pollMessageGuid) => {
          const poll = await client().call<{
            id: string;
            options: { text: string; voter_count: number }[];
            question: string;
          }>("stopPoll", {
            chat_id: to,
            message_id: Number(pollMessageGuid),
          });
          rememberPollFromTelegram(to, pollMessageGuid, poll);
        },
        unvote: async () =>
          host.unsupported(
            "telegram",
            "poll.unvote — Bot API cannot cast or revoke votes"
          ),
        vote: async () =>
          host.unsupported(
            "telegram",
            "poll.vote — Bot API cannot cast votes; listen on app.on('poll')"
          ),
      },
      posts: createTelegramPostsOps(
        (method, params) => client().call(method, params),
        to
      ),
      profile: {
        avatar: async (input) => {
          if (input === "clear") {
            await client().call("removeMyProfilePhoto");
            return;
          }
          if (
            input &&
            typeof input === "object" &&
            "type" in input &&
            typeof (input as { type?: unknown }).type === "string"
          ) {
            await client().call("setMyProfilePhoto", {
              photo: asTelegramParams(input),
            });
            return;
          }
          host.unsupported(
            "telegram",
            'profile.avatar — pass { type: "static"|"animated", ... } or "clear"'
          );
        },
        close: async () => {
          await client().call("close");
        },
        editStarSubscription: async (userId, opts) => {
          await client().call("editUserStarSubscription", {
            user_id: Number(userId),
            ...asTelegramParams(opts),
          });
        },
        getDefaultAdminRights: async (opts) => {
          const rights = await client().call<{
            can_change_info?: boolean;
            can_delete_messages?: boolean;
            can_delete_stories?: boolean;
            can_edit_messages?: boolean;
            can_edit_stories?: boolean;
            can_invite_users?: boolean;
            can_manage_chat?: boolean;
            can_manage_direct_messages?: boolean;
            can_manage_tags?: boolean;
            can_manage_topics?: boolean;
            can_manage_video_chats?: boolean;
            can_pin_messages?: boolean;
            can_post_messages?: boolean;
            can_post_stories?: boolean;
            can_promote_members?: boolean;
            can_restrict_members?: boolean;
            is_anonymous?: boolean;
          }>("getMyDefaultAdministratorRights", {
            for_channels: opts?.forChannels,
          });
          return {
            canChangeInfo: rights.can_change_info,
            canDeleteMessages: rights.can_delete_messages,
            canDeleteStories: rights.can_delete_stories,
            canEditMessages: rights.can_edit_messages,
            canEditStories: rights.can_edit_stories,
            canInviteUsers: rights.can_invite_users,
            canManageChat: rights.can_manage_chat,
            canManageDirectMessages: rights.can_manage_direct_messages,
            canManageTags: rights.can_manage_tags,
            canManageTopics: rights.can_manage_topics,
            canManageVideoChats: rights.can_manage_video_chats,
            canPinMessages: rights.can_pin_messages,
            canPostMessages: rights.can_post_messages,
            canPostStories: rights.can_post_stories,
            canPromoteMembers: rights.can_promote_members,
            canRestrictMembers: rights.can_restrict_members,
            isAnonymous: rights.is_anonymous,
          };
        },
        getDescription: async (opts) => {
          const res = await client().call<{ description: string }>(
            "getMyDescription",
            asTelegramParams(opts ?? {})
          );
          return { description: res.description };
        },
        getMenuButton: async (opts) => {
          const button = await client().call<{
            text?: string;
            type: "commands" | "web_app" | "default";
            web_app?: { url: string };
          }>("getChatMenuButton", {
            chat_id: opts?.chatId,
          });
          return {
            text: button.text,
            type: button.type,
            webApp: button.web_app,
          };
        },
        getName: async (opts) => {
          const res = await client().call<{ name: string }>(
            "getMyName",
            asTelegramParams(opts ?? {})
          );
          return { name: res.name };
        },
        getShortDescription: async (opts) => {
          const res = await client().call<{ short_description: string }>(
            "getMyShortDescription",
            asTelegramParams(opts ?? {})
          );
          return { shortDescription: res.short_description };
        },
        getUserAudios: async (userId, opts) => {
          const result = await client().call<{
            audios?: {
              duration?: number;
              file_id: string;
              file_size?: number;
              mime_type?: string;
              title?: string;
            }[];
          }>("getUserProfileAudios", {
            limit: opts?.limit,
            offset: opts?.offset,
            user_id: Number(userId),
          });
          return (result.audios ?? []).map((audio) => ({
            duration: audio.duration,
            fileId: audio.file_id,
            fileSize: audio.file_size,
            mimeType: audio.mime_type,
            title: audio.title,
          }));
        },
        getUserBoosts: async (userId) => {
          const result = await client().call<{
            boosts?: {
              add_date?: number;
              boost_id: string;
              expiration_date?: number;
              source?: { user?: { id: number } };
            }[];
          }>("getUserChatBoosts", {
            chat_id: to,
            user_id: Number(userId),
          });
          return {
            boosts: (result.boosts ?? []).map((boost) => ({
              addDate: boost.add_date,
              boostId: boost.boost_id,
              expirationDate: boost.expiration_date,
              userId:
                boost.source?.user != null
                  ? String(boost.source.user.id)
                  : undefined,
            })),
          };
        },
        getUserPhotos: async (userId, opts) => {
          const photos = await client().call<{
            photos: {
              file_id: string;
              file_size?: number;
              height?: number;
              width?: number;
            }[][];
            total_count: number;
          }>("getUserProfilePhotos", {
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
          return {
            photos: photos.photos.map((row) =>
              row.map((p) => ({
                fileId: p.file_id,
                fileSize: p.file_size,
                height: p.height,
                width: p.width,
              }))
            ),
            totalCount: photos.total_count,
          };
        },
        logOut: async () => {
          await client().call("logOut");
        },
        me: async () => {
          const me = await client().call<{
            can_connect_to_business?: boolean;
            can_join_groups?: boolean;
            can_read_all_group_messages?: boolean;
            first_name: string;
            id: number;
            is_bot: boolean;
            supports_inline_queries?: boolean;
            username?: string;
          }>("getMe");
          return {
            canConnectToBusiness: me.can_connect_to_business,
            canJoinGroups: me.can_join_groups,
            canReadAllGroupMessages: me.can_read_all_group_messages,
            firstName: me.first_name,
            id: String(me.id),
            isBot: me.is_bot,
            supportsInlineQueries: me.supports_inline_queries,
            username: me.username,
          };
        },
        setDefaultAdminRights: async (opts) => {
          await client().call("setMyDefaultAdministratorRights", {
            for_channels: opts?.forChannels,
            rights: opts?.rights
              ? asTelegramParams(opts.rights)
              : undefined,
          });
        },
        setDescription: async (description, opts) => {
          await client().call("setMyDescription", {
            description,
            ...asTelegramParams(opts ?? {}),
          });
        },
        setEmojiStatus: async (userId, opts) => {
          await client().call("setUserEmojiStatus", {
            user_id: Number(userId),
            ...asTelegramParams(opts ?? {}),
          });
        },
        setMenuButton: async (opts) => {
          await client().call(
            "setChatMenuButton",
            asTelegramParams(opts ?? {})
          );
        },
        setName: async (name, opts) => {
          await client().call("setMyName", {
            name,
            ...asTelegramParams(opts ?? {}),
          });
        },
        setPassportErrors: async (userId, errors) => {
          await client().call("setPassportDataErrors", {
            errors: errors.map((e) => asTelegramParams(e)),
            user_id: Number(userId),
          });
        },
        setShortDescription: async (shortDescription, opts) => {
          await client().call("setMyShortDescription", {
            short_description: shortDescription,
            ...asTelegramParams(opts ?? {}),
          });
        },
        starBalance: async () => {
          const balance = await client().call<{
            amount: number;
            nanostar_amount?: number;
          }>("getMyStarBalance");
          return {
            amount: balance.amount,
            nanostarAmount: balance.nanostar_amount,
          };
        },
        starTransactions: async (opts) => {
          const result = await client().call<{
            transactions?: {
              amount: number;
              date: number;
              id: string;
              nanostar_amount?: number;
              source?: { type?: string };
            }[];
          }>("getStarTransactions", {
            limit: opts?.limit,
            offset: opts?.offset,
          });
          return {
            transactions: (result.transactions ?? []).map((tx) => ({
              amount: tx.amount,
              date: tx.date,
              id: tx.id,
              nanostarAmount: tx.nanostar_amount,
              source: tx.source?.type,
            })),
          };
        },
      },
      promote: async (userId, rights) => {
        await client().call("promoteChatMember", {
          chat_id: to,
          user_id: Number(userId),
          ...asTelegramParams(rights ?? {}),
        });
      },
      reachable: async () => true,
      react: async (messageGuid, reaction: Reaction, reactOpts) => {
        if (reactOpts?.remove) {
          await client().setMessageReaction(to, messageGuid, null);
          return;
        }
        const emoji = normalizeReactionEmoji(reaction);
        if (!isAllowedReactionEmoji(emoji)) {
          host.unsupported("telegram", `reaction emoji "${reaction}"`);
        }
        await client().setMessageReaction(to, messageGuid, emoji);
      },
      read: async () => {},
      readReceipt: async () => {},
      refundPayment: async (opts) => {
        await client().call("refundStarPayment", {
          telegram_payment_charge_id: opts.chargeId,
          user_id: Number(opts.userId),
        });
      },
      removeReaction: async (messageGuid, opts) => {
        await client().call("deleteMessageReaction", {
          chat_id: to,
          message_id: Number(messageGuid),
          ...asTelegramParams(opts ?? {}),
        });
      },
      responding: (fn) => withResponding(channel, fn),
      restrict: async (userId, opts) => {
        await client().call("restrictChatMember", {
          chat_id: to,
          permissions: asTelegramParams(opts.permissions),
          until_date: opts.untilDate,
          use_independent_chat_permissions:
            opts.useIndependentChatPermissions,
          user_id: Number(userId),
        });
      },
      reply: (messageGuid, content, sendOpts) =>
        send(content, { ...sendOpts, replyTo: messageGuid }),
      send,
      sendFile: async (file: AttachmentSend, sendOpts) =>
        send(
          {
            data:
              file.data instanceof ArrayBuffer
                ? new Uint8Array(file.data)
                : file.data,
            isAudioMessage: file.audio,
            isSticker: file.sticker,
            mimeType: file.mimeType,
            name: file.name,
            path: file.path,
            type: "attachment",
            url: file.url,
          },
          sendOpts
        ),
      sendFiles: async (files, sendOpts) => {
        if (files.length === 0) {
          throw new Error("sendFiles: needs at least one file");
        }
        if (files.length === 1) {
          return channel.sendFile(files[0]!, sendOpts);
        }
        if (files.length > 10) {
          throw new Error("sendFiles: Telegram albums support 2–10 items");
        }
        return send(
          {
            items: files.map((file) => ({
              data:
                file.data instanceof ArrayBuffer
                  ? new Uint8Array(file.data)
                  : file.data,
              mimeType: file.mimeType,
              name: file.name,
              path: file.path,
              url: file.url,
            })),
            type: "media_album",
          },
          sendOpts
        );
      },
      setAdminTitle: async (userId, customTitle) => {
        await client().call("setChatAdministratorCustomTitle", {
          chat_id: to,
          custom_title: customTitle,
          user_id: Number(userId),
        });
      },
      setDescription: async (description) => {
        await client().call("setChatDescription", {
          chat_id: to,
          description,
        });
      },
      setMemberTag: async (userId, tag, opts) => {
        await client().call("setChatMemberTag", {
          chat_id: to,
          tag,
          user_id: Number(userId),
          ...asTelegramParams(opts ?? {}),
        });
      },
      setPermissions: async (opts) => {
        const permissions =
          "permissions" in opts && opts.permissions
            ? opts.permissions
            : opts;
        const useIndependent =
          "useIndependentChatPermissions" in opts
            ? opts.useIndependentChatPermissions
            : undefined;
        await client().call("setChatPermissions", {
          chat_id: to,
          permissions: asTelegramParams(permissions),
          use_independent_chat_permissions: useIndependent,
        });
      },
      shareContactCard: async () =>
        host.unsupported(
          "telegram",
          "shareContactCard — use contact() / contactCard()"
        ),
      stickers: createTelegramStickerOps(
        (method, params) => client().call(method, params),
        to
      ),
      stories: createTelegramStoryOps(
        (method, params) => client().call(method, params),
        to
      ),
      shareLocation: async (opts) => {
        if (opts?.latitude == null || opts?.longitude == null) {
          host.unsupported(
            "telegram",
            "shareLocation without latitude/longitude"
          );
        }
        await send({
          address: opts!.address,
          latitude: opts!.latitude!,
          livePeriod: opts!.livePeriod ?? opts!.durationSeconds,
          longitude: opts!.longitude!,
          title: opts!.title,
          type: "location",
        });
      },
      stopLocation: async (messageGuid) => {
        if (!messageGuid) {
          host.unsupported("telegram", "stopLocation requires messageGuid");
        }
        await client().call("stopMessageLiveLocation", {
          chat_id: to,
          message_id: Number(messageGuid),
        });
      },
      to,
      topic: {
        close: async (threadId) => {
          await client().call("closeForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        closeGeneral: async () => {
          await client().call("closeGeneralForumTopic", { chat_id: to });
        },
        create: async (name, opts) => {
          const topic = await client().call<{ message_thread_id: number }>(
            "createForumTopic",
            {
              chat_id: to,
              name,
              ...asTelegramParams(opts ?? {}),
            }
          );
          return { threadId: String(topic.message_thread_id) };
        },
        delete: async (threadId) => {
          await client().call("deleteForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        edit: async (threadId, opts) => {
          await client().call("editForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
            ...asTelegramParams(opts ?? {}),
          });
        },
        hideGeneral: async () => {
          await client().call("hideGeneralForumTopic", { chat_id: to });
        },
        iconStickers: async () => {
          const stickers = await client().call<
            {
              custom_emoji_id?: string;
              emoji?: string;
              file_id: string;
            }[]
          >("getForumTopicIconStickers");
          return stickers.map((sticker) => ({
            customEmojiId: sticker.custom_emoji_id,
            emoji: sticker.emoji,
            fileId: sticker.file_id,
          }));
        },
        reopen: async (threadId) => {
          await client().call("reopenForumTopic", {
            chat_id: to,
            message_thread_id: Number(threadId),
          });
        },
        reopenGeneral: async () => {
          await client().call("reopenGeneralForumTopic", { chat_id: to });
        },
        unhideGeneral: async () => {
          await client().call("unhideGeneralForumTopic", { chat_id: to });
        },
        unpinAll: async (threadId) => {
          if (threadId != null) {
            await client().call("unpinAllForumTopicMessages", {
              chat_id: to,
              message_thread_id: Number(threadId),
            });
            return;
          }
          await client().call("unpinAllGeneralForumTopicMessages", {
            chat_id: to,
          });
        },
      },
      typing: async (onOrAction = true) => {
        if (onOrAction === false) {
          return;
        }
        const action = typeof onOrAction === "string" ? onOrAction : "typing";
        await client().sendChatAction(to, action);
      },
      webApp: createTelegramWebAppOps((method, params) =>
        client().call(method, params)
      ),
      unban: async (userId) => {
        await client().call("unbanChatMember", {
          chat_id: to,
          user_id: Number(userId),
        });
      },
      unbanSender: async (senderChatId) => {
        await client().call("unbanChatSenderChat", {
          chat_id: to,
          sender_chat_id: Number(senderChatId),
        });
      },
      unpin: async (messageGuid) => {
        if (messageGuid) {
          await client().call("unpinChatMessage", {
            chat_id: to,
            message_id: Number(messageGuid),
          });
          return;
        }
        await client().call("unpinAllChatMessages", { chat_id: to });
      },
      unsend: async (messageGuid) => {
        await client().deleteMessage(to, messageGuid);
      },
      unsendMany: async (messageGuids) => {
        await client().call("deleteMessages", {
          chat_id: to,
          message_ids: messageGuids.map(Number),
        });
      },
    };
    return channel;
  };

  const connectLine = (line: ResolvedLine): void => {
    if (!line.telegram) {
      return;
    }
    const botToken = line.telegram.botToken;
    const botId = botIdFromToken(botToken);
    const key = line.phone || botId;
    const client = new TelegramClient({
      baseUrl: line.telegram.baseUrl,
      botToken,
    });
    const onUpdate = (update: Parameters<typeof dispatchTelegramUpdate>[5]) => {
      dispatchTelegramUpdate(host, makeChannel, client, botId, key, update);
    };

    const webhookUrl = line.telegram.webhookUrl;
    const webhookSecret = line.telegram.webhookSecret;
    if (webhookUrl) {
      void ensureTelegramWebhook(client, webhookUrl, webhookSecret);
      webhookHandlers.set(
        botId,
        createTelegramWebhookHandler({
          onUpdate,
          secretToken: webhookSecret,
        })
      );
      host.live.set(key, {
        platform: "telegram",
        streams: [],
        telegram: client,
      });
      host.ready.add(key);
      return;
    }

    const poll = startTelegramPolling(client, { onUpdate });
    host.live.set(key, {
      platform: "telegram",
      streams: [poll],
      telegram: client,
    });
    host.ready.add(key);
  };

  return {
    platform: "telegram" as Platform,
    connectLine,
    makeChannel,
    dedicatedLines: (config: unknown) =>
      telegramDedicatedLines(config as TelegramDedicatedConfig),
  };
}

export function bind(host: SkylineHost, _config: TelegramConfig): void {
  host.register(createBinder(host));
}

type TelegramOwnedGift = {
  gift?: { id?: string | number; star_count?: number };
  owned_gift_id?: string;
  send_date?: number;
  type?: string;
};

function ownedGiftFromTelegram(gift: TelegramOwnedGift): OwnedGift {
  return {
    giftId: String(gift.gift?.id ?? ""),
    ownedGiftId: gift.owned_gift_id,
    sendDate: gift.send_date,
    starCount: gift.gift?.star_count,
    type: gift.type,
  };
}

function giftsPageFromTelegram(result: {
  gifts?: TelegramOwnedGift[];
  next_offset?: string;
  total_count?: number;
}): GiftsPage {
  return {
    gifts: (result.gifts ?? []).map(ownedGiftFromTelegram),
    nextOffset: result.next_offset,
    totalCount: result.total_count,
  };
}

type Call = TelegramClient["call"];

type TelegramSticker = {
  emoji?: string;
  file_id: string;
  is_animated?: boolean;
  is_video?: boolean;
  set_name?: string;
};

function stickerInfo(sticker: TelegramSticker): StickerInfo {
  return {
    emoji: sticker.emoji,
    fileId: sticker.file_id,
    isAnimated: sticker.is_animated,
    isVideo: sticker.is_video,
    setName: sticker.set_name,
  };
}

function storyRef(result: {
  chat?: { id: number };
  id?: number;
  story_id?: number;
}): StoryRef {
  const storyId = result.story_id ?? result.id;
  return {
    chatId: result.chat != null ? String(result.chat.id) : undefined,
    storyId: storyId != null ? String(storyId) : "",
  };
}

export function createTelegramStickerOps(
  call: Call,
  chatId: string
): StickerOps {
  return {
    addToSet: async (input) => {
      await call("addStickerToSet", asTelegramParams(input));
    },
    clearChatSet: async () => {
      await call("deleteChatStickerSet", { chat_id: chatId });
    },
    createSet: async (input) => {
      await call("createNewStickerSet", asTelegramParams(input));
    },
    deleteFromSet: async (sticker) => {
      await call("deleteStickerFromSet", { sticker });
    },
    deleteSet: async (name) => {
      await call("deleteStickerSet", { name });
    },
    getCustomEmoji: async (customEmojiIds) => {
      const stickers = await call<TelegramSticker[]>(
        "getCustomEmojiStickers",
        { custom_emoji_ids: customEmojiIds }
      );
      return stickers.map(stickerInfo);
    },
    getSet: async (name) => {
      const set = await call<{
        is_animated?: boolean;
        is_video?: boolean;
        name: string;
        sticker_type?: string;
        stickers: TelegramSticker[];
        title: string;
      }>("getStickerSet", { name });
      const mapped: StickerSet = {
        isAnimated: set.is_animated,
        isVideo: set.is_video,
        name: set.name,
        stickerType: set.sticker_type,
        stickers: set.stickers.map(stickerInfo),
        title: set.title,
      };
      return mapped;
    },
    replaceInSet: async (input) => {
      await call("replaceStickerInSet", asTelegramParams(input));
    },
    setChatSet: async (name) => {
      await call("setChatStickerSet", {
        chat_id: chatId,
        sticker_set_name: name,
      });
    },
    setCustomEmojiSetThumbnail: async (input) => {
      await call(
        "setCustomEmojiStickerSetThumbnail",
        asTelegramParams(input)
      );
    },
    setEmojiList: async (sticker, emojiList) => {
      await call("setStickerEmojiList", {
        emoji_list: emojiList,
        sticker,
      });
    },
    setKeywords: async (sticker, keywords) => {
      await call("setStickerKeywords", { keywords, sticker });
    },
    setMaskPosition: async (sticker, maskPosition) => {
      await call("setStickerMaskPosition", {
        mask_position: asTelegramParams(maskPosition),
        sticker,
      });
    },
    setPosition: async (sticker, position) => {
      await call("setStickerPositionInSet", { position, sticker });
    },
    setSetThumbnail: async (input) => {
      await call("setStickerSetThumbnail", asTelegramParams(input));
    },
    setSetTitle: async (name, title) => {
      await call("setStickerSetTitle", { name, title });
    },
    uploadFile: async (input) => {
      const file = await call<{ file_id: string }>(
        "uploadStickerFile",
        asTelegramParams(input)
      );
      return { fileId: file.file_id };
    },
  };
}

export function createTelegramStoryOps(
  call: Call,
  chatId: string
): StoryOps {
  return {
    delete: async (storyId, opts) => {
      await call("deleteStory", {
        business_connection_id: opts?.businessConnectionId,
        chat_id: chatId,
        story_id: Number(storyId),
      });
    },
    edit: async (storyId, input) => {
      await call("editStory", {
        chat_id: chatId,
        story_id: Number(storyId),
        ...asTelegramParams(input),
      });
    },
    post: async (input) =>
      storyRef(
        await call("postStory", {
          chat_id: chatId,
          ...asTelegramParams(input),
        })
      ),
    repost: async (input) =>
      storyRef(
        await call("repostStory", {
          chat_id: chatId,
          ...asTelegramParams(input),
        })
      ),
  };
}

export function createTelegramBusinessOps(call: Call): BusinessOps {
  return {
    availableGifts: async () => {
      const result = await call<{
        gifts?: { id: string | number; star_count?: number }[];
      }>("getAvailableGifts");
      return {
        gifts: (result.gifts ?? []).map((gift) => ({
          id: String(gift.id),
          starCount: gift.star_count,
        })),
      };
    },
    chatGifts: async (opts) =>
      giftsPageFromTelegram(
        await call("getChatGifts", asTelegramParams(opts ?? {}))
      ),
    connection: async (businessConnectionId) => {
      const conn = await call<{
        can_reply?: boolean;
        date?: number;
        id: string;
        is_enabled?: boolean;
        user?: { id: number };
      }>("getBusinessConnection", {
        business_connection_id: businessConnectionId,
      });
      const mapped: BusinessConnectionInfo = {
        canReply: conn.can_reply,
        date: conn.date,
        id: conn.id,
        isEnabled: conn.is_enabled,
        userId: conn.user != null ? String(conn.user.id) : undefined,
      };
      return mapped;
    },
    convertGiftToStars: async (input) => {
      await call("convertGiftToStars", asTelegramParams(input));
    },
    deleteMessages: async (messageIds, opts) => {
      await call("deleteBusinessMessages", {
        business_connection_id: opts.businessConnectionId,
        message_ids: messageIds.map(Number),
      });
    },
    giftPremium: async (input) => {
      await call("giftPremiumSubscription", asTelegramParams(input));
    },
    gifts: async (opts) =>
      giftsPageFromTelegram(
        await call("getBusinessAccountGifts", asTelegramParams(opts))
      ),
    managedAccessSettings: async (opts) => {
      const settings = await call<{
        can_change_gift_settings?: boolean;
        can_delete_all_messages?: boolean;
        can_delete_sent_messages?: boolean;
        can_delete_stories?: boolean;
        can_edit_bio?: boolean;
        can_edit_name?: boolean;
        can_edit_profile_photo?: boolean;
        can_edit_stories?: boolean;
        can_edit_username?: boolean;
        can_manage_bot?: boolean;
        can_manage_stories?: boolean;
        can_post_stories?: boolean;
        can_read_messages?: boolean;
        can_reply?: boolean;
        can_sell_gifts?: boolean;
        can_view_gifts_and_stars?: boolean;
      }>("getManagedBotAccessSettings", asTelegramParams(opts ?? {}));
      return {
        canChangeGiftSettings: settings.can_change_gift_settings,
        canDeleteAllMessages: settings.can_delete_all_messages,
        canDeleteSentMessages: settings.can_delete_sent_messages,
        canDeleteStories: settings.can_delete_stories,
        canEditBio: settings.can_edit_bio,
        canEditName: settings.can_edit_name,
        canEditProfilePhoto: settings.can_edit_profile_photo,
        canEditStories: settings.can_edit_stories,
        canEditUsername: settings.can_edit_username,
        canManageBot: settings.can_manage_bot,
        canManageStories: settings.can_manage_stories,
        canPostStories: settings.can_post_stories,
        canReadMessages: settings.can_read_messages,
        canReply: settings.can_reply,
        canSellGifts: settings.can_sell_gifts,
        canViewGiftsAndStars: settings.can_view_gifts_and_stars,
      };
    },
    managedToken: async () => {
      const result = await call<string | { token?: string }>(
        "getManagedBotToken"
      );
      if (typeof result === "string") {
        return { token: result };
      }
      return { token: result.token ?? "" };
    },
    readMessage: async (messageId, opts) => {
      await call("readBusinessMessage", {
        business_connection_id: opts.businessConnectionId,
        message_id: Number(messageId),
      });
    },
    removeChatVerification: async (opts) => {
      await call("removeChatVerification", asTelegramParams(opts ?? {}));
    },
    removeProfilePhoto: async (opts) => {
      await call(
        "removeBusinessAccountProfilePhoto",
        asTelegramParams(opts)
      );
    },
    removeUserVerification: async (userId) => {
      await call("removeUserVerification", { user_id: Number(userId) });
    },
    replaceManagedToken: async (opts) => {
      const result = await call<string | { token?: string }>(
        "replaceManagedBotToken",
        asTelegramParams(opts ?? {})
      );
      if (typeof result === "string") {
        return { token: result };
      }
      return { token: result.token ?? "" };
    },
    setBio: async (bio, opts) => {
      await call("setBusinessAccountBio", {
        bio,
        business_connection_id: opts.businessConnectionId,
      });
    },
    setGiftSettings: async (input) => {
      await call("setBusinessAccountGiftSettings", asTelegramParams(input));
    },
    setManagedAccessSettings: async (input) => {
      await call("setManagedBotAccessSettings", asTelegramParams(input));
    },
    setName: async (input) => {
      await call("setBusinessAccountName", asTelegramParams(input));
    },
    setProfilePhoto: async (input) => {
      await call("setBusinessAccountProfilePhoto", asTelegramParams(input));
    },
    setUsername: async (username, opts) => {
      await call("setBusinessAccountUsername", {
        business_connection_id: opts.businessConnectionId,
        username,
      });
    },
    starBalance: async (opts) => {
      const balance = await call<{
        amount: number;
        nanostar_amount?: number;
      }>("getBusinessAccountStarBalance", asTelegramParams(opts));
      return {
        amount: balance.amount,
        nanostarAmount: balance.nanostar_amount,
      };
    },
    transferGift: async (input) => {
      await call("transferGift", asTelegramParams(input));
    },
    transferStars: async (input) => {
      await call("transferBusinessAccountStars", asTelegramParams(input));
    },
    upgradeGift: async (input) => {
      await call("upgradeGift", asTelegramParams(input));
    },
    userGifts: async (userId, opts) =>
      giftsPageFromTelegram(
        await call("getUserGifts", {
          user_id: Number(userId),
          ...asTelegramParams(opts ?? {}),
        })
      ),
    verifyChat: async (opts) => {
      await call("verifyChat", asTelegramParams(opts ?? {}));
    },
    verifyUser: async (userId, opts) => {
      await call("verifyUser", {
        user_id: Number(userId),
        ...asTelegramParams(opts ?? {}),
      });
    },
  };
}

export function createTelegramWebAppOps(call: Call): WebAppOps {
  return {
    answerGuest: async (queryId, opts) => {
      await call("answerGuestQuery", {
        guest_query_id: queryId,
        cache_time: opts?.cacheTime,
        is_personal: opts?.isPersonal,
        next_offset: opts?.nextOffset,
        results: opts?.results?.map(inlineQueryResultToTelegram),
      });
    },
    answerJoinRequest: async (queryId, opts) => {
      await call("answerChatJoinRequestQuery", {
        query_id: queryId,
        cache_time: opts?.cacheTime,
        is_personal: opts?.isPersonal,
        next_offset: opts?.nextOffset,
        results: opts?.results?.map(inlineQueryResultToTelegram),
      });
    },
    savePreparedInline: async (input) => {
      const result = await call<{
        expiration_date?: number;
        id: string;
      }>("savePreparedInlineMessage", {
        allow_bot_chats: input.allowBotChats,
        allow_channel_chats: input.allowChannelChats,
        allow_group_chats: input.allowGroupChats,
        allow_paid_broadcast: input.allowPaidBroadcast,
        allow_user_chats: input.allowUserChats,
        result: inlineQueryResultToTelegram(input.result),
        user_id: Number(input.userId),
      });
      const mapped: PreparedInlineResult = {
        expirationDate: result.expiration_date,
        id: result.id,
      };
      return mapped;
    },
    savePreparedKeyboard: async (input) => {
      const result = await call<{
        expiration_date?: number;
        id: string;
      }>("savePreparedKeyboardButton", {
        button: asTelegramParams(input.button),
        user_id: Number(input.userId),
      });
      const mapped: PreparedKeyboardResult = {
        expirationDate: result.expiration_date,
        id: result.id,
      };
      return mapped;
    },
    sendJoinRequest: async (input) => {
      await call("sendChatJoinRequestWebApp", {
        chat_id: input.chatId,
        request_id: input.requestId,
      });
    },
  };
}

export function createTelegramEphemeralOps(
  call: Call,
  chatId: string
): EphemeralOps {
  return {
    delete: async (messageGuid) => {
      await call("deleteEphemeralMessage", {
        chat_id: chatId,
        message_id: Number(messageGuid),
      });
    },
    editCaption: async (messageGuid, caption, opts) => {
      await call("editEphemeralMessageCaption", {
        caption,
        chat_id: chatId,
        message_id: Number(messageGuid),
        ...asTelegramParams(opts ?? {}),
      });
    },
    editMarkup: async (messageGuid, markup) => {
      await call("editEphemeralMessageReplyMarkup", {
        chat_id: chatId,
        message_id: Number(messageGuid),
        reply_markup: replyMarkupToTelegram(markup),
      });
    },
    editMedia: async (messageGuid, media, opts) => {
      await call("editEphemeralMessageMedia", {
        chat_id: chatId,
        media: {
          media: media.fileId ?? media.url,
          type: media.type,
        },
        message_id: Number(messageGuid),
        ...(opts?.replyMarkup
          ? { reply_markup: replyMarkupToTelegram(opts.replyMarkup) }
          : {}),
      });
    },
    editText: async (messageGuid, text, opts) => {
      await call("editEphemeralMessageText", {
        chat_id: chatId,
        entities: opts?.entities?.map((entity) => asTelegramParams(entity)),
        message_id: Number(messageGuid),
        parse_mode: opts?.parseMode,
        reply_markup: opts?.replyMarkup
          ? replyMarkupToTelegram(opts.replyMarkup)
          : undefined,
        text,
      });
    },
    sendDraft: async (draftId, text, opts) => {
      await call("sendMessageDraft", {
        chat_id: Number(chatId),
        draft_id: draftId,
        entities: opts?.entities?.map((entity) => asTelegramParams(entity)),
        message_thread_id:
          opts?.threadId != null ? Number(opts.threadId) : undefined,
        parse_mode: opts?.parseMode,
        text,
      });
    },
    sendRichDraft: async (draftId, richMessage, opts) => {
      await call("sendRichMessageDraft", {
        chat_id: Number(chatId),
        draft_id: draftId,
        message_thread_id:
          opts?.threadId != null ? Number(opts.threadId) : undefined,
        rich_message: {
          html: richMessage.html,
          is_rtl: richMessage.isRtl,
          markdown: richMessage.markdown,
          skip_entity_detection: richMessage.skipEntityDetection,
        },
      });
    },
  };
}

export function createTelegramPostsOps(
  call: Call,
  chatId: string
): PostsOps {
  return {
    approve: async (messageGuid, opts) => {
      await call("approveSuggestedPost", {
        chat_id: chatId,
        message_id: Number(messageGuid),
        ...asTelegramParams(opts ?? {}),
      });
    },
    decline: async (messageGuid, opts) => {
      await call("declineSuggestedPost", {
        chat_id: chatId,
        message_id: Number(messageGuid),
        ...asTelegramParams(opts ?? {}),
      });
    },
  };
}
