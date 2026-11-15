import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { PREVIEW_SIZES } from "@/lib/media";
import { syncMedia } from "@/lib/media-sync";
import { fetchFile, fetchPreview, isNextcloudConfigured } from "@/lib/nextcloud";

// Serves media from Nextcloud to visitors at MEDIA_PUBLIC_URL/m/<id>/<name>:
//   (no query)  the file itself, streamed with Range support (video seeking, resumable downloads), any size
//   ?w=400|1600 a scaled preview of an image
//   ?dl=1       the file as a download
// Files/ is always a download; the gallery is shown inline. Hidden items answer 404 (except the profile photo).

// Response headers taken over from Nextcloud's answer.
const PASS_RESPONSE = ["content-length", "content-range", "accept-ranges", "etag", "last-modified"];

// Media is served from its own origin; even so, nothing served here may run script or embed anything.
const SANDBOX = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

const contentDisposition = (type: "inline" | "attachment", name: string) =>
  `${type}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

async function serve(req: NextRequest, params: Promise<{ id: string }>, method: "GET" | "HEAD") {
  if (!isNextcloudConfigured()) return notFound();
  const { id } = await params;
  const item = await prisma.mediaItem.findUnique({ where: { id } });
  if (!item) return notFound();
  if (item.hidden) {
    const isPhoto = await prisma.profile.count({ where: { photoMediaId: item.id } });
    if (!isPhoto) return notFound();
  }

  const query = req.nextUrl.searchParams;
  const size = Number(query.get("w"));
  if (query.has("w")) {
    if (!item.hasPreview || !PREVIEW_SIZES.includes(size as (typeof PREVIEW_SIZES)[number])) return notFound();
    const upstream = await fetchPreview(item.fileId, size, req.headers);
    if (upstream.status === 304) return new Response(null, { status: 304 });
    if (!upstream.ok) return notFound();
    return new Response(method === "HEAD" ? null : upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        ETag: upstream.headers.get("etag") ?? "",
        // The URL carries the file's etag, so a changed file gets a new URL.
        "Cache-Control": "public, max-age=604800, no-transform",
        "Content-Security-Policy": SANDBOX,
      },
    });
  }

  const upstream = await fetchFile(item.path, method, req.headers);
  if (upstream.status === 404) {
    // Moved or deleted in Nextcloud since the last sync: catch up so the next request finds it (or not).
    syncMedia(true).catch(() => {});
    return notFound();
  }
  if (![200, 206, 304, 412, 416].includes(upstream.status)) {
    console.error(`[media] ${item.path}: Nextcloud answered ${upstream.status}`);
    upstream.body?.cancel();
    return new Response("Bad gateway", { status: 502 });
  }
  if (upstream.status === 412 || upstream.status === 416) {
    // A range past the end, or an If-Range/If-Match that no longer holds: no body, just the file's real length.
    upstream.body?.cancel();
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (upstream.status === 416) headers["Content-Range"] = `bytes */${item.size}`;
    return new Response(null, { status: upstream.status, headers });
  }

  const headers = new Headers();
  for (const name of PASS_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const download = item.section === "FILES" || query.get("dl") === "1";
  headers.set("Content-Type", item.mime);
  headers.set("Content-Disposition", contentDisposition(download ? "attachment" : "inline", item.name));
  // Revalidation is cheap (ETag); no-transform keeps any compression layer away from ranges and large bodies.
  headers.set("Cache-Control", "public, max-age=300, no-transform");
  headers.set("Content-Security-Policy", SANDBOX);
  headers.set("Accept-Ranges", "bytes");
  const bodyless = method === "HEAD" || upstream.status === 304;
  if (bodyless) upstream.body?.cancel();
  return new Response(bodyless ? null : upstream.body, { status: upstream.status, headers });
}

type Ctx = { params: Promise<{ id: string; name: string }> };

export function GET(req: NextRequest, { params }: Ctx) {
  return serve(req, params, "GET");
}

export function HEAD(req: NextRequest, { params }: Ctx) {
  return serve(req, params, "HEAD");
}
