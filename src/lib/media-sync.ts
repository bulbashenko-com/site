import { basename } from "node:path";
import type { MediaKind, MediaSection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isNextcloudConfigured, propfind, type DavEntry } from "@/lib/nextcloud";

// Keeps MediaItem in step with the Team folder: Gallery/ (images and videos) and Files/ (anything), any depth.
// Nextcloud changes a folder's etag whenever anything below it changes, so one depth-0 PROPFIND of the root tells
// whether there is anything to do; the full walk runs only then. Checked at most once a minute per process.

const SECTIONS: Record<string, MediaSection> = { Gallery: "GALLERY", Files: "FILES" };
const CHECK_INTERVAL = 60_000;
const TIMEOUT = 15_000;

let lastCheck = 0;
let lastRootEtag: string | null = null;
let running: Promise<SyncResult> | null = null;

export interface SyncResult {
  changed: boolean;
  added: number;
  updated: number;
  removed: number;
}

function kindOf(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return "FILE";
}

async function walk(dir: string, signal: AbortSignal): Promise<DavEntry[]> {
  const [, ...children] = await propfind(dir, 1, signal);
  const files: DavEntry[] = [];
  for (const entry of children) {
    // Dotfiles: .DS_Store, .nomedia, partial uploads of some clients.
    if (basename(entry.path).startsWith(".")) continue;
    if (entry.isDir) files.push(...(await walk(entry.path, signal)));
    else files.push(entry);
  }
  return files;
}

/** Legacy captions and order (GalleryImage, old media bucket), matched by file name: the migration kept the names. */
async function legacyByName(): Promise<Map<string, { caption: string | null; order: number }>> {
  const rows = await prisma.galleryImage.findMany();
  return new Map(rows.map((r) => [basename(new URL(r.src, "http://x").pathname), { caption: r.caption, order: r.order }]));
}

async function apply(entries: DavEntry[]): Promise<Omit<SyncResult, "changed">> {
  const wanted = entries.flatMap((e) => {
    const section = SECTIONS[e.path.split("/")[0]];
    if (!section) return [];
    const kind = kindOf(e.mime);
    // The gallery shows pictures and videos; anything else there is ignored rather than shown as a broken tile.
    if (section === "GALLERY" && kind === "FILE") return [];
    return [{ ...e, section, kind, name: basename(e.path) }];
  });

  const existing = new Map((await prisma.mediaItem.findMany()).map((m) => [m.fileId, m]));
  const legacy = await legacyByName();
  let added = 0, updated = 0;

  for (const e of wanted) {
    const data = {
      section: e.section, kind: e.kind, path: e.path, name: e.name, mime: e.mime,
      size: BigInt(e.size), etag: e.etag, modifiedAt: e.modifiedAt, hasPreview: e.hasPreview,
    };
    const old = existing.get(e.fileId);
    if (!old) {
      const carried = legacy.get(e.name);
      await prisma.mediaItem.create({ data: { fileId: e.fileId, ...data, caption: carried?.caption, order: carried?.order ?? 0 } });
      added++;
    } else if (old.etag !== e.etag || old.path !== e.path || old.hasPreview !== e.hasPreview) {
      await prisma.mediaItem.update({ where: { fileId: e.fileId }, data });
      updated++;
    }
  }

  const keep = new Set(wanted.map((e) => e.fileId));
  const gone = [...existing.values()].filter((m) => !keep.has(m.fileId)).map((m) => m.id);
  if (gone.length) await prisma.mediaItem.deleteMany({ where: { id: { in: gone } } });

  await linkLegacyPhoto();
  return { added, updated, removed: gone.length };
}

/** The profile photo was a URL in the old bucket; point it at the same file in Nextcloud once it shows up. */
async function linkLegacyPhoto() {
  const profile = await prisma.profile.findFirst({ where: { photo: { not: null }, photoMediaId: null } });
  if (!profile?.photo) return;
  const name = basename(new URL(profile.photo, "http://x").pathname);
  const item = await prisma.mediaItem.findFirst({ where: { name, kind: "IMAGE" } });
  if (item) await prisma.profile.update({ where: { id: profile.id }, data: { photoMediaId: item.id, photo: null } });
}

async function run(force: boolean): Promise<SyncResult> {
  const signal = AbortSignal.timeout(TIMEOUT);
  const [root] = await propfind("", 0, signal);
  if (!force && root.etag === lastRootEtag) return { changed: false, added: 0, updated: 0, removed: 0 };
  const result = await apply(await walk("", signal));
  lastRootEtag = root.etag;
  return { changed: true, ...result };
}

/**
 * Brings MediaItem up to date with Nextcloud. Without `force`, does nothing if it ran in the last minute or the
 * folder has not changed. Errors propagate; callers that only want fresh data (page render) use syncMediaQuietly.
 */
export async function syncMedia(force = false): Promise<SyncResult> {
  if (!isNextcloudConfigured()) return { changed: false, added: 0, updated: 0, removed: 0 };
  if (running) return running;
  if (!force && Date.now() - lastCheck < CHECK_INTERVAL) return { changed: false, added: 0, updated: 0, removed: 0 };
  lastCheck = Date.now();
  running = run(force).finally(() => { running = null; });
  return running;
}

/** For page renders: never fails the page; Nextcloud being down just means the last known list is shown. */
export async function syncMediaQuietly(): Promise<void> {
  try {
    await syncMedia();
  } catch (err) {
    console.error("[media-sync]", err instanceof Error ? err.message : err);
  }
}
