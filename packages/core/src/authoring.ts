/**
 * Provider authoring surface — helpers for building platform binders.
 * Consumer apps use the main entry / `./content` / `./miniapp` instead.
 */

export type {
  Emitter,
  InboundQueue,
  LiveLine,
  PlatformBinder,
  SkylineHost,
  StreamHandle,
} from "./host-types.js";
export {
  UnsupportedError,
  unsupported,
} from "./host-types.js";
export {
  contentSugar,
  unsupportedChatExtras,
  unsupportedGroupExtras,
  unsupportedPollOps,
  withResponding,
} from "./channel-helpers.js";
export type { MessageData } from "./message.js";
export {
  attachmentWithDownload,
  bindMessage,
  bindOutboundMessage,
  messageFromSend,
  stubAttachmentDownload,
} from "./message.js";
export {
  fetchUrlBytes,
  mimeToMediaName,
  readMediaBytes,
} from "./io.js";
export { markdownToPlainText, renderInlineTokens } from "./markdown.js";
export { drainStreamText, sendWithFallbacks } from "./send-fallback.js";
export type {
  Content,
  ContentBuilder,
  ContentInput,
  PayloadContent,
} from "./content/index.js";
export {
  app,
  attachment,
  custom,
  markdown,
  streamText,
  text,
  voice,
} from "./content/index.js";
