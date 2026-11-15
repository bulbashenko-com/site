import type { MediaItem } from "@prisma/client";
import type { MediaItemData } from "@/types";

// Where visitors fetch media: MEDIA_PUBLIC_URL (https://media.bulbashenko.com, outside Cloudflare's proxy, since
// its terms keep video and large files off the free CDN), or this app itself when unset (local development).
export function mediaBase(): string {
  return (process.env.MEDIA_PUBLIC_URL ?? "").replace(/\/$/, "");
}

/** Host of MEDIA_PUBLIC_URL; requests for /m/ on any other host are refused when it is set (src/proxy.ts). */
export function mediaHost(): string | null {
  const base = mediaBase();
  return base ? new URL(base).host : null;
}

/** Preview sizes the media route serves: the grid and the lightbox. Fixed, so nobody can make Nextcloud render arbitrary sizes. */
export const PREVIEW_SIZES = [400, 1600] as const;

// The etag in the query changes the URL when the file changes, so caches never serve an old version.
const version = (item: Pick<MediaItem, "etag">) => item.etag.slice(0, 12);

export function fileUrl(item: Pick<MediaItem, "id" | "name" | "etag">, download = false): string {
  return `${mediaBase()}/m/${item.id}/${encodeURIComponent(item.name)}?v=${version(item)}${download ? "&dl=1" : ""}`;
}

export function previewUrl(item: Pick<MediaItem, "id" | "name" | "etag" | "hasPreview">, size: (typeof PREVIEW_SIZES)[number]): string | null {
  return item.hasPreview ? `${mediaBase()}/m/${item.id}/${encodeURIComponent(item.name)}?v=${version(item)}&w=${size}` : null;
}

export function toMediaData(item: MediaItem): MediaItemData {
  return {
    id: item.id,
    section: item.section,
    kind: item.kind,
    path: item.path,
    name: item.name,
    mime: item.mime,
    size: Number(item.size),
    modifiedAt: item.modifiedAt.toISOString(),
    caption: item.caption,
    order: item.order,
    hidden: item.hidden,
    url: fileUrl(item),
    downloadUrl: fileUrl(item, true),
    thumb: previewUrl(item, 400),
    large: previewUrl(item, 1600),
  };
}

/** Public order: explicit order first, then newest first (new uploads have order 0 and land on top). */
export const MEDIA_ORDER = [{ order: "asc" as const }, { modifiedAt: "desc" as const }];

/** The profile photo's URL: the grid-sized preview, or the file itself if Nextcloud has no preview for it. */
export function photoUrl(item: MediaItem | null | undefined): string | null {
  return item ? (previewUrl(item, 400) ?? fileUrl(item)) : null;
}
