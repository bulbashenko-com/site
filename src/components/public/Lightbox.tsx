"use client";

import { useEffect } from "react";
import type { MediaItemData } from "@/types";
import { cn } from "@/lib/cn";
import styles from "./Lightbox.module.css";

export type LightboxItem = Pick<MediaItemData, "kind" | "url" | "downloadUrl" | "large" | "caption" | "name">;

interface Props {
  item: LightboxItem | null;
  onClose: () => void;
}

export function Lightbox({ item, onClose }: Props) {
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [item, onClose]);

  return (
    <div
      className={cn(styles.lightbox, item && styles.open)}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.toolbar}>
        <button className={styles.toolbarBtn} onClick={onClose}>✕ CLOSE</button>
        {item && item.kind === "IMAGE" && item.large && (
          <a className={styles.toolbarBtn} href={item.url} target="_blank" rel="noopener">⤢ ORIGINAL</a>
        )}
        {item && <a className={styles.toolbarBtn} href={item.downloadUrl} download>↓ DOWNLOAD</a>}
      </div>
      {item && (
        <>
          {item.kind === "VIDEO"
            ? <video key={item.url} src={item.url} controls autoPlay playsInline preload="metadata" />
            // The 1600 px preview: originals can be tens of megabytes; ORIGINAL opens the full file.
            : <img src={item.large ?? item.url} alt={item.caption || item.name} />}
          {item.caption && <div className={styles.caption}>{item.caption}</div>}
        </>
      )}
    </div>
  );
}
