"use client";

import { useState, useEffect, useRef } from "react";
import type { GalleryImageData } from "@/types";
import { Button, Input, SectionHeader } from "@/components/ui";
import a from "./admin.module.css";

export function GalleryTab() {
  const [gallery, setGallery] = useState<GalleryImageData[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/gallery");
    if (res.ok) {
      const data: GalleryImageData[] = await res.json();
      setGallery(data);
      setCaptions(Object.fromEntries(data.map((i) => [i.id, i.caption || ""])));
    }
  }

  useEffect(() => { load(); }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files || [])];
    const errors: string[] = [];
    setUploading(true);
    setUploadError("");
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        errors.push(`${file.name}: ${body?.error || `HTTP ${res.status}`}`);
        continue;
      }
      const { url } = await res.json();
      const saveRes = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: url, caption: "" }),
      });
      if (!saveRes.ok) errors.push(`${file.name}: could not save to gallery (HTTP ${saveRes.status})`);
    }
    e.target.value = "";
    setUploading(false);
    setUploadError(errors.join("\n"));
    load();
  }

  async function saveCaption(id: string) {
    await fetch(`/api/gallery/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: captions[id] || null }),
    });
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 1800);
  }

  async function del(id: string) {
    if (!confirm("Delete image?")) return;
    await fetch(`/api/gallery/${id}`, { method: "DELETE" });
    setGallery((g) => g.filter((i) => i.id !== id));
  }

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">GALLERY</SectionHeader>
        <Button variant="primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? "UPLOADING…" : "+ UPLOAD IMAGES"}
        </Button>
        <input ref={fileInput} type="file" accept="image/*" multiple onChange={upload} style={{ display: "none" }} />
      </div>
      <div className={a.notice}>Images are uploaded to server storage. Max 5 MB per file.</div>
      {uploadError && <div className={a.notice} style={{ whiteSpace: "pre-line", color: "#d06060" }}>{uploadError}</div>}
      {!gallery.length && <div className={a.empty}>No images uploaded yet.</div>}
      <div className={a.galleryGrid}>
        {gallery.map((img) => (
          <div className={a.galleryItem} key={img.id}>
            <img src={img.src} alt={captions[img.id] || ""} />
            <button className={a.galleryItemDel} onClick={() => del(img.id)}>✕</button>
            <div className={a.galleryItemCaption}>
              <Input
                style={{ fontSize: 11, padding: "3px 6px" }}
                placeholder="Add caption…"
                value={captions[img.id] ?? ""}
                onChange={(e) => setCaptions((c) => ({ ...c, [img.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && saveCaption(img.id)}
              />
              <Button size="sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => saveCaption(img.id)}>
                {saved[img.id] ? "✓" : "SAVE"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
