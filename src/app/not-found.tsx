"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import styles from "./not-found.module.css";

const GLITCH_CHARS = "!@#$%^&*<>?/\\|{}[]~`";

// The scrambled frame while a glitch runs; outside one (or after its 12 frames) the plain text shows.
function useGlitch(text: string, running: boolean) {
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    if (!running) return;
    let count = 0;
    const id = setInterval(() => {
      count++;
      if (count > 12) { setFrame(null); clearInterval(id); return; }
      setFrame(
        text.split("").map((c) =>
          c !== " " && Math.random() < 0.35
            ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
            : c
        ).join("")
      );
    }, 40);
    return () => clearInterval(id);
  }, [text, running]);
  return running && frame !== null ? frame : text;
}

interface Meme {
  title: string;
  url: string;
  subreddit: string;
  postLink: string;
}

type Category = "dev";

/** A safe-for-work meme with an image; one retry when the first pick is unusable. */
async function loadMeme(category: Category): Promise<Meme> {
  const attempt = async () => {
    const res = await fetch(`/api/meme?cat=${category}`);
    if (!res.ok) throw new Error(`meme: ${res.status}`);
    return res.json();
  };
  let data = await attempt();
  if (!data.url || data.nsfw || data.spoiler) data = await attempt();
  return data;
}

export default function NotFound() {
  const [glitching, setGlitching] = useState(false);
  const [cat, setCat] = useState<Category>("dev");
  const [meme, setMeme] = useState<Meme | null>(null);
  const [memeLoading, setMemeLoading] = useState(true);
  const [memeError, setMemeError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const fetchMeme = useCallback(async (category: Category = cat) => {
    setMemeLoading(true);
    setMemeError(false);
    setImgLoaded(false);
    setMeme(null);
    try {
      setMeme(await loadMeme(category));
    } catch {
      setMemeError(true);
    } finally {
      setMemeLoading(false);
    }
  }, [cat]);

  // First meme: the loading state is already set initially; state changes only once the response is in.
  useEffect(() => {
    let active = true;
    loadMeme(cat).then(
      (data) => { if (active) { setMeme(data); setMemeLoading(false); } },
      () => { if (active) { setMemeError(true); setMemeLoading(false); } },
    );
    return () => { active = false; };
  }, [cat]);

  useEffect(() => {
    const id = setInterval(() => {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 500);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const code = useGlitch("404", glitching);
  const msg  = useGlitch("PAGE NOT FOUND", glitching);

  return (
    <div className={styles.root}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <span className={styles.barTitle}>ERROR.EXE</span>
          <span className={styles.barDots}>● ● ●</span>
        </div>

        <div className={styles.body}>
          {/* left column */}
          <div className={styles.left}>
            <div className={styles.code}>{code}</div>
            <div className={styles.msg}>{msg}</div>

            <div className={styles.sep} />

            <div className={styles.lines}>
              <div className={styles.line}><span className={styles.prompt}>&gt;</span> KERNEL PANIC: requested route not found</div>
              <div className={styles.line}><span className={styles.prompt}>&gt;</span> STATUS: 404 — FATAL</div>
            </div>

            <div className={styles.sep} />

            <Link href="/" className={styles.btn}>[  REBOOT → HOME  ]</Link>
          </div>

          {/* right column — meme */}
          <div className={styles.right}>

            <div className={styles.memeWindow}>
              <div className={styles.memeBar}>
                <span className={styles.memeBarTitle}>
                  {meme ? `r/${meme.subreddit}` : memeLoading ? "LOADING..." : "—"}
                </span>
                <button
                  className={styles.memeNext}
                  onClick={() => fetchMeme(cat)}
                  disabled={memeLoading}
                  title="Next meme"
                >
                  ↻
                </button>
              </div>

              <div className={styles.memeBody}>
                {memeLoading && (
                  <div className={styles.memeStatus}>
                    <span className={styles.blink}>█</span> FETCHING MEME...
                  </div>
                )}

                {!memeLoading && memeError && (
                  <div className={styles.memeStatus}>
                    ERR: FAILED TO LOAD
                    <button className={styles.btn} style={{ marginTop: 12 }} onClick={() => fetchMeme(cat)}>
                      [ RETRY ]
                    </button>
                  </div>
                )}

                {!memeLoading && !memeError && meme && (
                  <>
                    {!imgLoaded && (
                      <div className={styles.memeStatus}>
                        <span className={styles.blink}>█</span> RENDERING...
                      </div>
                    )}
                    <div className={styles.memeImgWrap} style={{ opacity: imgLoaded ? 1 : 0 }}>
                      <a href={meme.postLink} target="_blank" rel="noopener noreferrer">
                        <img
                          src={meme.url}
                          alt={meme.title}
                          className={styles.memeImg}
                          onLoad={() => setImgLoaded(true)}
                          onError={() => setImgLoaded(true)}
                        />
                      </a>
                    </div>
                    <div className={styles.memeTitle} style={{ opacity: imgLoaded ? 1 : 0 }}>
                      {meme.title}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
