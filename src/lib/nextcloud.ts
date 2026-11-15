import { XMLParser } from "fast-xml-parser";

// Read-only access to the site's Team folder in Nextcloud (WebDAV and the preview API). The owner uploads into it
// through Nextcloud itself; the site only lists, streams and asks for previews, as a user that can only read.
//   NEXTCLOUD_URL       where the app reaches Nextcloud (in-cluster Service in production)
//   NEXTCLOUD_USER      the read-only user (`site`), NEXTCLOUD_PASSWORD its password
//   NEXTCLOUD_ROOT      the Team folder's name as that user sees it (`Site`)
//   NEXTCLOUD_PUBLIC_URL the address the owner opens Nextcloud at (links in the admin panel only)

const config = () => ({
  url: (process.env.NEXTCLOUD_URL ?? "").replace(/\/$/, ""),
  user: process.env.NEXTCLOUD_USER ?? "",
  password: process.env.NEXTCLOUD_PASSWORD ?? "",
  root: (process.env.NEXTCLOUD_ROOT ?? "Site").replace(/^\/|\/$/g, ""),
});

export function isNextcloudConfigured(): boolean {
  const c = config();
  return Boolean(c.url && c.user && c.password);
}

export function nextcloudPublicUrl(): string | null {
  return process.env.NEXTCLOUD_PUBLIC_URL?.replace(/\/$/, "") || null;
}

/** A path inside the root, e.g. "Gallery/2026/a.jpg". */
export type RelPath = string;

export interface DavEntry {
  path: RelPath;
  isDir: boolean;
  fileId: number;
  etag: string;
  mime: string;
  size: number;
  modifiedAt: Date;
  hasPreview: boolean;
}

function authHeader(): string {
  const { user, password } = config();
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

const encodePath = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

function davUrl(rel: RelPath): string {
  const { url, user, root } = config();
  return `${url}/remote.php/dav/files/${encodeURIComponent(user)}/${encodePath(`${root}/${rel}`)}`;
}

const PROPFIND_BODY = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:resourcetype/><d:getetag/><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/>
    <oc:fileid/><oc:size/><nc:has-preview/>
  </d:prop>
</d:propfind>`;

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === "response" || name === "propstat",
});

type PropStat = { status?: string; prop?: Record<string, unknown> };
type DavResponse = { href: string; propstat: PropStat[] };

/** Lists `rel` (depth 0: the entry itself; depth 1: plus its children). Paths come back relative to the root. */
export async function propfind(rel: RelPath, depth: 0 | 1, signal?: AbortSignal): Promise<DavEntry[]> {
  const res = await fetch(davUrl(rel), {
    method: "PROPFIND",
    headers: { Authorization: authHeader(), Depth: String(depth), "Content-Type": "application/xml" },
    body: PROPFIND_BODY,
    signal,
    cache: "no-store",
  });
  if (res.status !== 207) throw new Error(`PROPFIND ${rel || "/"}: HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const responses: DavResponse[] = doc?.multistatus?.response ?? [];
  const { user, root } = config();
  const base = `/remote.php/dav/files/${user}/${root}/`;
  return responses.map((r) => {
    const prop = r.propstat.find((p) => String(p.status).includes(" 200 "))?.prop ?? {};
    const href = decodeURIComponent(r.href);
    const at = href.indexOf(base);
    const path = (at >= 0 ? href.slice(at + base.length) : "").replace(/\/$/, "");
    const isDir = typeof prop.resourcetype === "object" && prop.resourcetype !== null && "collection" in prop.resourcetype;
    return {
      path,
      isDir,
      fileId: Number(prop.fileid),
      etag: String(prop.getetag ?? "").replace(/"/g, ""),
      mime: String(prop.getcontenttype || "application/octet-stream"),
      size: Number(prop.getcontentlength ?? prop.size ?? 0),
      modifiedAt: new Date(String(prop.getlastmodified)),
      hasPreview: String(prop["has-preview"]) === "true",
    };
  });
}

// Conditional and range headers the visitor's request may carry; passed through so Nextcloud answers 206/304/416.
const PASS_REQUEST = ["range", "if-range", "if-none-match", "if-modified-since"];

/** GET or HEAD of a file, streamed: the body is never buffered here, whatever the file's size. */
export async function fetchFile(rel: RelPath, method: "GET" | "HEAD", incoming: Headers): Promise<Response> {
  const headers = new Headers({ Authorization: authHeader() });
  for (const name of PASS_REQUEST) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }
  return fetch(davUrl(rel), { method, headers, cache: "no-store" });
}

/** A scaled preview (JPEG/PNG/WebP, Nextcloud's own cache) fitting in size×size. */
export async function fetchPreview(fileId: number, size: number, incoming: Headers): Promise<Response> {
  const { url } = config();
  const headers = new Headers({ Authorization: authHeader() });
  const etag = incoming.get("if-none-match");
  if (etag) headers.set("if-none-match", etag);
  const query = new URLSearchParams({ fileId: String(fileId), x: String(size), y: String(size), a: "1", forceIcon: "0" });
  return fetch(`${url}/index.php/core/preview?${query}`, { headers, cache: "no-store" });
}
