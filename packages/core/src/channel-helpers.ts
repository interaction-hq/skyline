import {
  type AvatarInput,
  addMember,
  avatar,
  type ContentInput,
  leaveChannel,
  type MemberInput,
  removeMember,
  rename,
  type SendOptions,
} from "./content/index.js";
import type {
  BusinessOps,
  Channel,
  EphemeralOps,
  Message,
  PollOps,
  PostsOps,
  ProfileOps,
  StickerOps,
  StoryOps,
  WebAppOps,
} from "./types.js";

export async function withResponding<T>(
  channel: Pick<Channel, "typing">,
  fn: () => T | Promise<T>
): Promise<T> {
  await channel.typing(true);
  try {
    return await fn();
  } finally {
    try {
      await channel.typing(false);
    } catch {}
  }
}

export function unsupportedPollOps(
  unsupported: (verb: string) => never
): PollOps {
  return {
    addOption: async () => unsupported("poll.addOption"),
    get: async () => null,
    stop: async () => unsupported("poll.stop"),
    unvote: async () => unsupported("poll.unvote"),
    vote: async () => unsupported("poll.vote"),
  };
}

const deny =
  (unsupported: (verb: string) => never, verb: string) =>
  async (..._args: never[]) =>
    unsupported(verb);

function unsupportedStickers(
  unsupported: (verb: string) => never
): StickerOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    addToSet: d("stickers.addToSet"),
    clearChatSet: d("stickers.clearChatSet"),
    createSet: d("stickers.createSet"),
    deleteFromSet: d("stickers.deleteFromSet"),
    deleteSet: d("stickers.deleteSet"),
    getCustomEmoji: d("stickers.getCustomEmoji"),
    getSet: d("stickers.getSet"),
    replaceInSet: d("stickers.replaceInSet"),
    setChatSet: d("stickers.setChatSet"),
    setCustomEmojiSetThumbnail: d("stickers.setCustomEmojiSetThumbnail"),
    setEmojiList: d("stickers.setEmojiList"),
    setKeywords: d("stickers.setKeywords"),
    setMaskPosition: d("stickers.setMaskPosition"),
    setPosition: d("stickers.setPosition"),
    setSetThumbnail: d("stickers.setSetThumbnail"),
    setSetTitle: d("stickers.setSetTitle"),
    uploadFile: d("stickers.uploadFile"),
  };
}

function unsupportedStories(
  unsupported: (verb: string) => never
): StoryOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    delete: d("stories.delete"),
    edit: d("stories.edit"),
    post: d("stories.post"),
    repost: d("stories.repost"),
  };
}

function unsupportedBusiness(
  unsupported: (verb: string) => never
): BusinessOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    availableGifts: d("business.availableGifts"),
    chatGifts: d("business.chatGifts"),
    connection: d("business.connection"),
    convertGiftToStars: d("business.convertGiftToStars"),
    deleteMessages: d("business.deleteMessages"),
    giftPremium: d("business.giftPremium"),
    gifts: d("business.gifts"),
    managedAccessSettings: d("business.managedAccessSettings"),
    managedToken: d("business.managedToken"),
    readMessage: d("business.readMessage"),
    removeChatVerification: d("business.removeChatVerification"),
    removeProfilePhoto: d("business.removeProfilePhoto"),
    removeUserVerification: d("business.removeUserVerification"),
    replaceManagedToken: d("business.replaceManagedToken"),
    setBio: d("business.setBio"),
    setGiftSettings: d("business.setGiftSettings"),
    setManagedAccessSettings: d("business.setManagedAccessSettings"),
    setName: d("business.setName"),
    setProfilePhoto: d("business.setProfilePhoto"),
    setUsername: d("business.setUsername"),
    starBalance: d("business.starBalance"),
    transferGift: d("business.transferGift"),
    transferStars: d("business.transferStars"),
    upgradeGift: d("business.upgradeGift"),
    userGifts: d("business.userGifts"),
    verifyChat: d("business.verifyChat"),
    verifyUser: d("business.verifyUser"),
  };
}

function unsupportedWebApp(
  unsupported: (verb: string) => never
): WebAppOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    answerGuest: d("webApp.answerGuest"),
    answerJoinRequest: d("webApp.answerJoinRequest"),
    savePreparedInline: d("webApp.savePreparedInline"),
    savePreparedKeyboard: d("webApp.savePreparedKeyboard"),
    sendJoinRequest: d("webApp.sendJoinRequest"),
  };
}

function unsupportedEphemeral(
  unsupported: (verb: string) => never
): EphemeralOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    delete: d("ephemeral.delete"),
    editCaption: d("ephemeral.editCaption"),
    editMarkup: d("ephemeral.editMarkup"),
    editMedia: d("ephemeral.editMedia"),
    editText: d("ephemeral.editText"),
    sendDraft: d("ephemeral.sendDraft"),
    sendRichDraft: d("ephemeral.sendRichDraft"),
  };
}

function unsupportedPosts(
  unsupported: (verb: string) => never
): PostsOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    approve: d("posts.approve"),
    decline: d("posts.decline"),
  };
}

function unsupportedProfile(
  unsupported: (verb: string) => never
): ProfileOps {
  const d = (v: string) => deny(unsupported, v);
  return {
    avatar: d("profile.avatar"),
    close: d("profile.close"),
    editStarSubscription: d("profile.editStarSubscription"),
    getDefaultAdminRights: d("profile.getDefaultAdminRights"),
    getDescription: d("profile.getDescription"),
    getMenuButton: d("profile.getMenuButton"),
    getName: d("profile.getName"),
    getShortDescription: d("profile.getShortDescription"),
    getUserAudios: d("profile.getUserAudios"),
    getUserBoosts: d("profile.getUserBoosts"),
    getUserPhotos: d("profile.getUserPhotos"),
    logOut: d("profile.logOut"),
    me: d("profile.me"),
    setDefaultAdminRights: d("profile.setDefaultAdminRights"),
    setDescription: d("profile.setDescription"),
    setEmojiStatus: d("profile.setEmojiStatus"),
    setMenuButton: d("profile.setMenuButton"),
    setName: d("profile.setName"),
    setPassportErrors: d("profile.setPassportErrors"),
    setShortDescription: d("profile.setShortDescription"),
    starBalance: d("profile.starBalance"),
    starTransactions: d("profile.starTransactions"),
  };
}

/** Stubs for Channel APIs unsupported on a platform. */
export function unsupportedChatExtras(
  unsupported: (verb: string) => never
): Pick<
  Channel,
  | "answerCallback"
  | "answerInline"
  | "answerPreCheckout"
  | "answerShipping"
  | "answerWebApp"
  | "approveJoin"
  | "banSender"
  | "business"
  | "clearReactions"
  | "commands"
  | "declineJoin"
  | "ephemeral"
  | "game"
  | "getMember"
  | "getPersonalMessages"
  | "info"
  | "invite"
  | "invoiceLink"
  | "messageStatus"
  | "posts"
  | "profile"
  | "promote"
  | "refundPayment"
  | "removeReaction"
  | "restrict"
  | "setAdminTitle"
  | "setDescription"
  | "setMemberTag"
  | "setPermissions"
  | "stickers"
  | "stories"
  | "topic"
  | "unban"
  | "unbanSender"
  | "unsendMany"
  | "webApp"
> {
  const d = (v: string) => deny(unsupported, v);
  return {
    answerCallback: d("answerCallback"),
    answerInline: d("answerInline"),
    answerPreCheckout: d("answerPreCheckout"),
    answerShipping: d("answerShipping"),
    answerWebApp: d("answerWebApp"),
    approveJoin: d("approveJoin"),
    banSender: d("banSender"),
    business: unsupportedBusiness(unsupported),
    clearReactions: d("clearReactions"),
    commands: {
      clear: d("commands.clear"),
      get: d("commands.get"),
      set: d("commands.set"),
    },
    declineJoin: d("declineJoin"),
    ephemeral: unsupportedEphemeral(unsupported),
    game: {
      highScores: d("game.highScores"),
      setScore: d("game.setScore"),
    },
    getMember: d("getMember"),
    getPersonalMessages: d("getPersonalMessages"),
    info: d("info"),
    invite: {
      create: d("invite.create"),
      createSubscription: d("invite.createSubscription"),
      edit: d("invite.edit"),
      editSubscription: d("invite.editSubscription"),
      export: d("invite.export"),
      revoke: d("invite.revoke"),
    },
    invoiceLink: d("invoiceLink"),
    messageStatus: async () => null,
    posts: unsupportedPosts(unsupported),
    profile: unsupportedProfile(unsupported),
    promote: d("promote"),
    refundPayment: d("refundPayment"),
    removeReaction: d("removeReaction"),
    restrict: d("restrict"),
    setAdminTitle: d("setAdminTitle"),
    setDescription: d("setDescription"),
    setMemberTag: d("setMemberTag"),
    setPermissions: d("setPermissions"),
    stickers: unsupportedStickers(unsupported),
    stories: unsupportedStories(unsupported),
    topic: {
      close: d("topic.close"),
      closeGeneral: d("topic.closeGeneral"),
      create: d("topic.create"),
      delete: d("topic.delete"),
      edit: d("topic.edit"),
      editGeneral: d("topic.editGeneral"),
      hideGeneral: d("topic.hideGeneral"),
      iconStickers: d("topic.iconStickers"),
      reopen: d("topic.reopen"),
      reopenGeneral: d("topic.reopenGeneral"),
      unhideGeneral: d("topic.unhideGeneral"),
      unpinAll: d("topic.unpinAll"),
    },
    unban: d("unban"),
    unbanSender: d("unbanSender"),
    unsendMany: d("unsendMany"),
    webApp: unsupportedWebApp(unsupported),
  };
}

/** Stubs for GroupOps extras not available on a platform. */
export function unsupportedGroupExtras(
  unsupported: (verb: string) => never
): Pick<Channel["group"], "admins" | "member" | "memberCount"> {
  return {
    admins: async () => unsupported("group.admins"),
    member: async () => unsupported("group.member"),
    memberCount: async () => unsupported("group.memberCount"),
  };
}

export function contentSugar(
  send: (
    content: ContentInput,
    opts?: SendOptions
  ) => Promise<Message | undefined>
): Pick<Channel, "add" | "avatar" | "leave" | "remove" | "rename"> {
  return {
    add: async (users: MemberInput) => {
      await send(addMember(users));
    },
    avatar: async (input: AvatarInput, options?: { mimeType?: string }) => {
      if (typeof input === "string" || input instanceof URL) {
        await send(avatar(input, options));
        return;
      }
      if (!options?.mimeType) {
        throw new Error(
          "avatar(Uint8Array) requires options.mimeType — pass { mimeType: '...' }"
        );
      }
      await send(avatar(input, { mimeType: options.mimeType }));
    },
    leave: async () => {
      await send(leaveChannel());
    },
    remove: async (
      users: MemberInput,
      opts?: { revokeMessages?: boolean; untilDate?: number }
    ) => {
      await send(removeMember(users, opts));
    },
    rename: async (displayName: string) => {
      await send(rename(displayName));
    },
  };
}
