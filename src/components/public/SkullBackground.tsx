"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SkullBackgroundData } from "@/types";
import styles from "./SkullBackground.module.css";

// live:   rendered in the browser with WebGL2 (./background/*.js), in the active palette, reacts to the pointer.
// video:  the weekly pre-render of the same scene (scripts/skull-render) for devices without WebGL2, with software-only
//         WebGL, or too slow to hold the frame rate.
// poster: one still frame of it for reduced motion and Save-Data.
// off:    phones and touch devices; not a single byte is fetched.
export type SkullBackgroundMode = "off" | "poster" | "video" | "live";
export type BackgroundPalette = { bg: string; g1: string; g2: string; g3: string };

const DESKTOP = "(min-width: 1024px) and (pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";
// Set when WebGL failed or frames were too slow; kept for the tab session so later pages don't try again.
const DOWNGRADED = "bg:video";

const listeners = new Set<() => void>();
let downgraded: boolean | undefined;

function isDowngraded() {
  if (downgraded === undefined) {
    try {
      downgraded = sessionStorage.getItem(DOWNGRADED) === "1";
    } catch {
      downgraded = false;
    }
  }
  return downgraded;
}

function downgrade() {
  if (isDowngraded()) return;
  downgraded = true;
  try {
    sessionStorage.setItem(DOWNGRADED, "1");
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  const queries = [DESKTOP, REDUCED].map((q) => window.matchMedia(q));
  queries.forEach((m) => m.addEventListener("change", onChange));
  // The custom elements report a missing, software-only or lost WebGL2 context with this event.
  if (listeners.size === 0) window.addEventListener("background:fail", downgrade);
  listeners.add(onChange);
  return () => {
    queries.forEach((m) => m.removeEventListener("change", onChange));
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("background:fail", downgrade);
  };
}

function getMode(): SkullBackgroundMode {
  if (!window.matchMedia(DESKTOP).matches) return "off";
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData || window.matchMedia(REDUCED).matches) return "poster";
  return isDowngraded() || typeof WebGL2RenderingContext === "undefined" ? "video" : "live";
}

export function useSkullBackgroundMode(): SkullBackgroundMode {
  return useSyncExternalStore(subscribe, getMode, () => "off");
}

/**
 * Falls back to the video when the page can't hold its frame rate: the mean interval between animation frames stays
 * above 35 ms (under ~28 fps) over a 3 s window. The first second after load and hidden tabs don't count.
 */
function useFrameWatchdog() {
  useEffect(() => {
    let raf = 0, prev = 0, sum = 0, count = 0;
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - prev;
      prev = now;
      // Gaps over 250 ms are a backgrounded tab or a one-off hitch, not a slow device.
      if (now - start < 1000 || document.hidden || dt > 250) return;
      sum += dt;
      count++;
      if (sum < 3000) return;
      if (sum / count > 35) downgrade();
      sum = count = 0;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export function SkullBackground({ data, mode, palette }: {
  data: SkullBackgroundData | null;
  mode: SkullBackgroundMode;
  palette: BackgroundPalette;
}) {
  if (mode === "live") return <LiveBackground palette={palette} />;
  if (mode === "off" || !data) return null;
  return <RenderedBackground data={data} mode={mode} />;
}

function LiveBackground({ palette }: { palette: BackgroundPalette }) {
  const [ready, setReady] = useState(false);
  useFrameWatchdog();

  useEffect(() => {
    let alive = true;
    // three.js comes with the skull element: only this mode downloads it.
    Promise.all([import("./background/ascii-bg.js"), import("./background/skull-ascii.js")]).then(
      () => alive && setReady(true),
      downgrade,
    );
    return () => {
      alive = false;
    };
  }, []);

  const colors = `${palette.bg},${palette.g1},${palette.g2},${palette.g3}`;
  return (
    <div className={`${styles.bg} ${styles.live}`} aria-hidden="true">
      {ready && (
        <>
          <ascii-bg dim="0.35" colors={colors} />
          <skull-ascii colors={colors} />
        </>
      )}
      <span className={styles.roll} />
      <span className={styles.scan} />
    </div>
  );
}

function RenderedBackground({ data, mode }: { data: SkullBackgroundData; mode: "poster" | "video" }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, data.mp4]);

  return (
    <div className={styles.bg} aria-hidden="true">
      {mode === "video" ? (
        <video
          key={data.mp4}
          ref={videoRef}
          className={styles.media}
          poster={data.poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={data.webm} type="video/webm" />
          <source src={data.mp4} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.media} src={data.poster} alt="" />
      )}
      {/* the render is grayscale; multiply tints it with the active palette */}
      <span className={styles.tint} />
      {mode === "video" && <span className={styles.roll} />}
      <span className={styles.scan} />
    </div>
  );
}
