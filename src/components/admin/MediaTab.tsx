"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItemData } from "@/types";
import { cn } from "@/lib/cn";
import { Button, Input, SectionHeader } from "@/components/ui";
import { fetchJson } from "@/lib/fetch-json";
import a from "./admin.module.css";

type Section = MediaItemData["section"];
type MediaList = { configured: boolean; nextcloudUrl: string | null; root: string; items: MediaItemData[] };

const FOLDER: Record<Section, string> = { GALLERY: "Gallery", FILES: "Files" };

// Formats every current browser plays; anything else (HEVC .mov from phones, .mkv, .avi) may not play everywhere.
const PLAYABLE_VIDEO = ["video/mp4", "video/webm"];

function fmtSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${i === 0 ? bytes : bytes.toFixed(1)} ${units[i]}`;
}

export function MediaTab() {
  const [data, setData] = useState<MediaList | null>(null);
  const [section, setSection] = useState<Section>("GALLERY");
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const show = useCallback((list: MediaList) => {
    setData(list);
    setCaptions(Object.fromEntries(list.items.map((i) => [i.id, i.caption || ""])));
  }, []);

  const load = useCallback(async () => {
    const list = await fetchJson<MediaList>("/api/media/all");
    if (list) show(list);
  }, [show]);

  useEffect(() => {
    let active = true;
    fetchJson<MediaList>("/api/media/all").then((list) => { if (active && list) show(list); });
    return () => { active = false; };
  }, [show]);

  if (!data) return <div className={a.empty}>Loading...</div>;
  const items = data.items.filter((i) => i.section === section);
  const folder = `${data.root}/${FOLDER[section]}`;
  const nextcloudLink = data.nextcloudUrl ? `${data.nextcloudUrl}/apps/files/files?dir=${encodeURIComponent(`/${folder}`)}` : null;

  async function sync() {
    setSyncing(true);
    setMessage("");
    const res = await fetch("/api/media/sync", { method: "POST" });
    const body = await res.json().catch(() => null);
    setSyncing(false);
    if (!res.ok) { setMessage(`Sync failed: ${body?.error ?? `HTTP ${res.status}`}`); return; }
    setMessage(body.changed ? `Synced: ${body.added} new, ${body.updated} changed, ${body.removed} removed.` : "Nothing changed.");
    load();
  }

  async function patch(id: string, body: { caption?: string | null; hidden?: boolean }) {
    const res = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const item: MediaItemData = await res.json();
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? item : i)) });
    return true;
  }

  async function saveCaption(id: string) {
    if (!(await patch(id, { caption: captions[id] || null }))) return;
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1800);
  }

  async function move(id: string, delta: -1 | 1) {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const order = new Map(ids.map((x, i) => [x, i + 1]));
    setData((d) => d && {
      ...d,
      items: [...d.items]
        .map((i) => (order.has(i.id) ? { ...i, order: order.get(i.id)! } : i))
        .sort((x, y) => x.order - y.order),
    });
    await fetch("/api/media/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  const controls = (item: MediaItemData, index: number) => (
    <div className={a.mediaActions}>
      <Button size="sm" disabled={index === 0} onClick={() => move(item.id, -1)} title="Move up">↑</Button>
      <Button size="sm" disabled={index === items.length - 1} onClick={() => move(item.id, 1)} title="Move down">↓</Button>
      <Button size="sm" variant={item.hidden ? "primary" : "default"} onClick={() => patch(item.id, { hidden: !item.hidden })}>
        {item.hidden ? "SHOW" : "HIDE"}
      </Button>
    </div>
  );

  const captionField = (item: MediaItemData) => (
    <div className={a.galleryItemCaption}>
      <Input
        style={{ fontSize: 11, padding: "3px 6px" }}
        placeholder="Add caption…"
        value={captions[item.id] ?? ""}
        onChange={(e) => setCaptions((c) => ({ ...c, [item.id]: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && saveCaption(item.id)}
      />
      <Button size="sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => saveCaption(item.id)}>
        {saved[item.id] ? "✓" : "SAVE"}
      </Button>
    </div>
  );

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">MEDIA</SectionHeader>
        <div style={{ display: "flex", gap: 8 }}>
          {nextcloudLink && (
            <a href={nextcloudLink} target="_blank" rel="noopener noreferrer">
              <Button>OPEN IN NEXTCLOUD ↗</Button>
            </a>
          )}
          <Button variant="primary" disabled={syncing || !data.configured} onClick={sync}>
            {syncing ? "SYNCING…" : "↻ SYNC"}
          </Button>
        </div>
      </div>

      {data.configured ? (
        <div className={a.notice}>
          Upload in Nextcloud, folder <b>{data.root}/Gallery</b> (pictures and videos) or <b>{data.root}/Files</b> (anything,
          any size; subfolders become groups). New files show up on the site within a minute, or press SYNC.
          Here: captions, order, and HIDE to keep a file off the site without deleting it.
        </div>
      ) : (
        <div className={a.notice}>Nextcloud is not configured in this environment (NEXTCLOUD_URL), so there is nothing to show.</div>
      )}
      {message && <div className={a.notice}>{message}</div>}

      <div className={a.langTabs} style={{ marginBottom: 12 }}>
        {(["GALLERY", "FILES"] as Section[]).map((s) => (
          <button key={s} className={cn(a.langTab, section === s && a.active)} onClick={() => setSection(s)}>
            {s} ({data.items.filter((i) => i.section === s).length})
          </button>
        ))}
      </div>

      {!items.length && <div className={a.empty}>Nothing in {folder} yet.</div>}

      {section === "GALLERY" ? (
        <div className={a.galleryGrid}>
          {items.map((item, index) => (
            <div className={cn(a.galleryItem, item.hidden && a.mediaHidden)} key={item.id}>
              {item.kind === "VIDEO"
                ? <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline className={a.mediaThumb} />
                : <img src={item.thumb ?? item.url} alt={item.caption || item.name} />}
              <div className={a.mediaBadges}>
                {item.hidden && <span className={a.mediaBadge}>HIDDEN</span>}
                {item.kind === "VIDEO" && <span className={a.mediaBadge}>VIDEO</span>}
                {item.kind === "VIDEO" && !PLAYABLE_VIDEO.includes(item.mime) && (
                  <span className={cn(a.mediaBadge, a.mediaWarn)} title={`${item.mime}: may not play in every browser; MP4 (H.264) or WebM plays everywhere`}>
                    ⚠ {item.mime.replace("video/", "")}
                  </span>
                )}
              </div>
              <div className={a.mediaName} title={item.path}>{item.name} · {fmtSize(item.size)}</div>
              {captionField(item)}
              {controls(item, index)}
            </div>
          ))}
        </div>
      ) : (
        <div className={a.mediaFiles}>
          {items.map((item, index) => (
            <div className={cn(a.mediaFileRow, item.hidden && a.mediaHidden)} key={item.id}>
              <div className={a.mediaFileInfo}>
                <a href={item.downloadUrl} className={a.mediaFileName}>{item.path.split("/").slice(1).join("/")}</a>
                <span className={a.mediaFileMeta}>
                  {fmtSize(item.size)} · {new Date(item.modifiedAt).toLocaleString()}
                  {item.hidden && <span className={a.mediaBadge}>HIDDEN</span>}
                </span>
              </div>
              {captionField(item)}
              {controls(item, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
