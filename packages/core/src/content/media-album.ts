import type { AttachmentInput } from "./builders.js";

/** Album of 2–10 media items (Telegram `sendMediaGroup` and similar). */
export interface MediaAlbumContent {
  items: AttachmentInput[];
  type: "media_album";
}

export function mediaAlbum(
  items: AttachmentInput[]
): MediaAlbumContent {
  if (items.length < 2 || items.length > 10) {
    throw new Error("mediaAlbum: needs 2–10 items");
  }
  return { items, type: "media_album" };
}
