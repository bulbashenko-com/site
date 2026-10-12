"use client";

import { useState, useEffect, useCallback } from "react";
import type { SiteData, Lang, SkullBackgroundData } from "@/types";
import { translations } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { SectionHeader, Card, Tag } from "@/components/ui";
import { StatusBar } from "./StatusBar";
import { Sidebar } from "./Sidebar";
import { WindowFrame } from "./WindowFrame";
import { Lightbox, type LightboxItem } from "./Lightbox";
import { TweaksPanel, type TweakState } from "./TweaksPanel";
import { CRTFilter } from "./CRTFilter";
import { SkullBackground, useSkullBackgroundMode } from "./SkullBackground";
import styles from "./PublicSite.module.css";

export type SectionId = "home" | "blog" | "projects" | "cv" | "gallery" | "contact";

const PALETTES = {
  green:  { bg: "#060b06", bg2: "#0b130b", bg3: "#101a10", g1: "#b8f0a4", g2: "#78b864", g3: "#4a7840", g4: "#243624" },
  amber:  { bg: "#090700", bg2: "#0f0c00", bg3: "#161000", g1: "#f0d060", g2: "#c8a030", g3: "#7a6018", g4: "#342800" },
  blue:   { bg: "#060912", bg2: "#0a0f1e", bg3: "#0e1428", g1: "#60d4f0", g2: "#3090b8", g3: "#1a5878", g4: "#0a2030" },
  white:  { bg: "#0c0f0c", bg2: "#121412", bg3: "#181818", g1: "#e8ede8", g2: "#a8b8a8", g3: "#607060", g4: "#283028" },
} as const;

export function PublicSite({ data, background }: { data: SiteData; background: SkullBackgroundData | null }) {
  const [section, setSection] = useState<SectionId>("home");
  const [lang, setLang] = useState<Lang>("en");
  const [lightboxItem, setLightboxItem] = useState<LightboxItem | null>(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweaks, setTweaks] = useState<TweakState>({ scanline: 6, glow: 31, palette: "green", pincushion: false, bg: true, bgDim: 80 });
  const bgMode = useSkullBackgroundMode();
  // live needs nothing from the server; the video and poster need this week's render
  const bgOn = tweaks.bg && (bgMode === "live" || (bgMode !== "off" && background !== null));

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem("bul_lang") as Lang | null;
      if (savedLang && ["en", "ru", "sk"].includes(savedLang)) setLang(savedLang);
      const savedSec = localStorage.getItem("bul_sec") as SectionId | null;
      if (savedSec) setSection(savedSec);
      const savedTweaks = localStorage.getItem("bul_tweaks");
      if (savedTweaks) setTweaks((prev) => ({ ...prev, ...JSON.parse(savedTweaks) }));
    } catch {}
  }, []);

  const goSection = useCallback((id: SectionId) => {
    setSection(id);
    try { localStorage.setItem("bul_sec", id); } catch {}
    const wc = document.querySelector("[data-wincontent]");
    if (wc) wc.scrollTop = 0;
  }, []);

  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    try { localStorage.setItem("bul_lang", l); } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--fm",
      lang === "ru" ? "'IBM Plex Mono', monospace" : "'Bitcount Single', monospace"
    );
  }, [lang]);

  useEffect(() => {
    const pal = PALETTES[tweaks.palette];
    const r = document.documentElement;
    r.style.setProperty("--bg", pal.bg);
    r.style.setProperty("--bg2", pal.bg2);
    r.style.setProperty("--bg3", pal.bg3);
    r.style.setProperty("--g1", pal.g1);
    r.style.setProperty("--g2", pal.g2);
    r.style.setProperty("--g3", pal.g3);
    r.style.setProperty("--g4", pal.g4);
    const gl = tweaks.glow / 100;
    r.style.setProperty("--gw", `0 0 ${Math.round(16 * gl)}px ${pal.g1}, 0 0 ${Math.round(48 * gl)}px ${pal.g1}66`);
    r.style.setProperty("--sl", String(tweaks.scanline / 20 * 0.14));
    r.style.setProperty("--app-alpha", `${tweaks.bgDim}%`);
  }, [tweaks]);

  const t = (key: keyof (typeof translations)["en"]) =>
    translations[lang]?.[key] ?? translations.en[key];

  return (
    <>
      {bgOn && <SkullBackground data={background} mode={bgMode} palette={PALETTES[tweaks.palette]} />}
      <div className={cn(styles.app, tweaks.pincushion && styles.pin)} data-bg={bgOn ? "on" : undefined}>
        <CRTFilter />
        <span className={styles.vhsNoise}   aria-hidden="true" />
        <span className={styles.vhsChroma}  aria-hidden="true" />
        <span className={styles.crtFlicker} aria-hidden="true" />
        <StatusBar />

        <div className={styles.mobileNav}>
          <div className={styles.mobileNavWrap}>
            <div className={styles.mobileNavScroll}>
              {(["home","blog","projects","cv","gallery","contact"] as SectionId[]).map((s) => (
                <button
                  key={s}
                  className={cn(styles.mobileNavBtn, section === s && styles.active)}
                  onClick={() => goSection(s)}
                >
                  {t(s)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.mobileNavLang}>
            {(["en", "ru", "sk"] as Lang[]).map((l) => (
              <button
                key={l}
                className={cn(styles.mobileLangBtn, lang === l && styles.active)}
                onClick={() => changeLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.main}>
          <Sidebar section={section} lang={lang} onSection={goSection} onLang={changeLang} profile={data.profile} />
          <WindowFrame title={t(section)} onTweaks={() => setTweaksOpen((o) => !o)}>
            {section === "home"     && <HomeSection     data={data}             lang={lang} t={t} />}
            {section === "blog"     && <BlogSection     posts={data.posts}      lang={lang} t={t} />}
            {section === "projects" && <ProjectsSection projects={data.projects} lang={lang} t={t} />}
            {section === "cv"       && <CVSection       data={data}             lang={lang} t={t} />}
            {section === "gallery"  && <GallerySection  gallery={data.gallery}  lang={lang} t={t} onOpen={setLightboxItem} />}
            {section === "contact"  && <ContactSection  profile={data.profile}  lang={lang} t={t} />}
          </WindowFrame>
        </div>
      </div>

      <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      <TweaksPanel
        open={tweaksOpen}
        tweaks={tweaks}
        onChange={(next) => {
          setTweaks(next);
          try { localStorage.setItem("bul_tweaks", JSON.stringify(next)); } catch {}
        }}
      />
    </>
  );
}

// ── INLINE SECTION COMPONENTS ──────────────────────────────────────────────

import type { PostData, ProjectData, GalleryImageData, ProfileData } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type T = (key: keyof (typeof translations)["en"]) => string;

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const pad = (x: number) => String(x).padStart(2, "0");

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function ageOf(b: string) {
  const d = new Date(b), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}

function excerpt(s: string, n = 150) {
  const r = s.replace(/[#*`>\[\]!]/g, "").replace(/\n+/g, " ").trim();
  return r.length > n ? r.slice(0, n) + "..." : r;
}

function getLocalized(lang: Lang, en?: string|null, ru?: string|null, sk?: string|null, fb = "") {
  if (lang === "ru" && ru) return ru;
  if (lang === "sk" && sk) return sk;
  return en || fb;
}

function parseEmails(email?: string | null): string[] {
  if (!email) return [];
  return email.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function contactDisplayText(type: string, raw: string): string {
  if (type === "telegram") {
    const username = raw.replace(/^https?:\/\/t\.me\//, "").replace(/^t\.me\//, "").replace(/^@/, "");
    return `@${username}`;
  }
  const url = raw.startsWith("http") ? raw
    : type === "github"   ? `https://github.com/${raw}`
    : `https://linkedin.com/in/${raw}`;
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/$/, "");
  } catch { return raw; }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cn(styles.copyBtn, copied && styles.copied)}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
    >
      {copied ? "✓" : "COPY"}
    </button>
  );
}

// HOME
function HomeSection({ data, lang, t }: { data: SiteData; lang: Lang; t: T }) {
  const p = data.profile;
  const name  = p.name  || "Aleksandr Albekov";
  const title = getLocalized(lang, p.titleEn, p.titleRu, p.titleSk, "DevOps Engineer");
  const bio   = getLocalized(lang, p.bioEn,   p.bioRu,   p.bioSk,   "");

  const linkDefs: [keyof ProfileData, string, (v: string) => string][] = [
    ["github",   "GITHUB",   (v) => v.startsWith("http") ? v : `https://github.com/${v}`],
    ["telegram", "TELEGRAM", (v) => v.startsWith("http") ? v : `https://t.me/${v}`],
    ["linkedin", "LINKEDIN", (v) => v.startsWith("http") ? v : `https://linkedin.com/in/${v}`],
  ];
  const emails = parseEmails(p.email);

  return (
    <>
      <div className={styles.hero}>
        <div>
          <div className={styles.heroName}>{name.toUpperCase()}</div>
          <div className={styles.heroTitle}>{title.toUpperCase()}</div>
          <div className={styles.heroBio}>{bio}</div>
          <div className={styles.heroLinks}>
            {linkDefs.filter(([k]) => p[k]).map(([k, label, href]) => (
              <a key={k} className={styles.heroLink} href={href(String(p[k]))} target="_blank" rel="noopener noreferrer">
                [{label}]
              </a>
            ))}
          </div>
          {emails.length > 0 && (
            <div className={styles.heroEmails}>
              {emails.map((em) => (
                <div key={em} className={styles.heroEmailRow}>
                  <a href={`mailto:${em}`} className={styles.heroEmailAddr}>{em}</a>
                  <CopyButton text={em} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.photo}>
          {p.photo
            ? <img src={p.photo} alt="photo" />
            : <span style={{ fontSize: 10, padding: 8, textAlign: "center" }}>PHOTO</span>
          }
        </div>
      </div>

      <SectionHeader>{t("skills")}</SectionHeader>
      <div className={styles.skillsGrid}>
        {(p.skills || []).map((cat, i) => (
          <Card key={i}>
            <div className={styles.skillCat}>{(cat.cat || "").toUpperCase()}</div>
            {(cat.items || []).map((item, j) => (
              <div className={styles.skillItem} key={j}>{item}</div>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}

function postTitle(p: PostData, lang: Lang): string {
  if (lang === "ru" && p.titleRu) return p.titleRu;
  if (lang === "sk" && p.titleSk) return p.titleSk;
  return p.title;
}

function postContent(p: PostData, lang: Lang): string {
  if (lang === "ru" && p.contentRu) return p.contentRu;
  if (lang === "sk" && p.contentSk) return p.contentSk;
  return p.content;
}

// BLOG
function BlogSection({ posts, lang, t }: { posts: PostData[]; lang: Lang; t: T }) {
  const [open, setOpen] = useState<PostData | null>(null);

  if (open) {
    const title   = postTitle(open, lang);
    const content = postContent(open, lang);
    return (
      <>
        <button className={styles.backBtn} onClick={() => setOpen(null)}>◂ {t("back")}</button>
        <div className={styles.postDate}>{fmtDate(open.date)}</div>
        <SectionHeader style={{ marginTop: 8 }}>{title.toUpperCase()}</SectionHeader>
        <div className={styles.postTags}>
          {(open.tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
        <div className={cn(styles.md)} style={{ marginTop: 20 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader>{t("blog")}</SectionHeader>
      {!posts.length
        ? <div className={styles.empty}>{t("noPosts")}</div>
        : posts.map((p) => {
          const title   = postTitle(p, lang);
          const content = postContent(p, lang);
          return (
            <Card key={p.id} onClick={() => setOpen(p)} style={{ cursor: "pointer" }}>
              <div className={styles.postDate}>{fmtDate(p.date)}</div>
              <div className={styles.postTitle}>{(title || "UNTITLED").toUpperCase()}</div>
              <div className={styles.postExcerpt}>{excerpt(content || "")}</div>
              {p.tags?.length ? (
                <div className={styles.postTags}>
                  {p.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </div>
              ) : null}
            </Card>
          );
        })
      }
    </>
  );
}

// PROJECTS
function ProjectsSection({ projects, lang, t }: { projects: ProjectData[]; lang: Lang; t: T }) {
  return (
    <>
      <SectionHeader>{t("projects")}</SectionHeader>
      {!projects.length
        ? <div className={styles.empty}>{t("noProj")}</div>
        : (
          <div className={styles.projectsGrid}>
            {projects.map((p) => {
              const name = getLocalized(lang, p.name, p.nameRu, p.nameSk, "PROJECT");
              const desc = getLocalized(lang, p.desc, p.descRu, p.descSk, "");
              return (
                <Card key={p.id}>
                  <div className={styles.projectName}>{name.toUpperCase()}</div>
                  {desc && <div className={styles.projectDesc}>{desc}</div>}
                  <div className={styles.projectStack}>
                    {(p.stack || []).map((s) => <Tag key={s} variant="stack">{s}</Tag>)}
                  </div>
                  {(p.github || p.url) && (
                    <div className={styles.projectLinks}>
                      {p.github && <a className={styles.projectLink} href={p.github} target="_blank" rel="noopener noreferrer">[GITHUB]</a>}
                      {p.url    && <a className={styles.projectLink} href={p.url}    target="_blank" rel="noopener noreferrer">[LIVE]</a>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      }
    </>
  );
}

// CV
function CVSection({ data, lang, t }: { data: SiteData; lang: Lang; t: T }) {
  const p = data.profile;
  const name  = p.name || "Aleksandr Albekov";
  const title = getLocalized(lang, p.titleEn, p.titleRu, p.titleSk, "DevOps Engineer");
  const experience     = data.cvEntries.filter((e) => e.type === "experience");
  const education      = data.cvEntries.filter((e) => e.type === "education");
  const certifications = data.cvEntries.filter((e) => e.type === "certification");

  return (
    <>
      <div className={styles.cvSection}>
        <div style={{ fontFamily: "var(--fw)", fontSize: 28, color: "var(--g1)", letterSpacing: 3, textShadow: "var(--gw)" }}>
          {name}
        </div>
        <div style={{ color: "var(--g3)", fontSize: 13, marginTop: 5, letterSpacing: 1 }}>
          {title}
          {p.location ? ` · ${p.location}` : ""}
          {p.birthday ? ` · ${ageOf(p.birthday)} y.o.` : ""}
        </div>
      </div>

      <div className={styles.cvSection}>
        <div className={styles.cvCatTitle}>{t("exp")}</div>
        {!experience.length
          ? <div className={styles.empty}>{t("noExp")}</div>
          : experience.map((e) => (
            <div className={styles.cvItem} key={e.id}>
              <div className={styles.cvItemHead}>
                <span className={styles.cvRole}>{e.role} @ {e.company}</span>
                <span className={styles.cvDate}>{e.start || ""} — {e.end || t("present")}</span>
              </div>
              {e.desc && <div className={styles.cvSub}>{e.desc}</div>}
            </div>
          ))
        }
      </div>

      <div className={styles.cvSection}>
        <div className={styles.cvCatTitle}>{t("edu")}</div>
        {!education.length
          ? <div className={styles.empty}>{t("noEdu")}</div>
          : education.map((e) => (
            <div className={styles.cvItem} key={e.id}>
              <div className={styles.cvItemHead}>
                <span className={styles.cvRole}>{e.degree} — {e.institution}</span>
                <span className={styles.cvDate}>{e.start || ""} — {e.end || t("present")}</span>
              </div>
            </div>
          ))
        }
      </div>

      <div className={styles.cvSection}>
        <div className={styles.cvCatTitle}>{t("skills")}</div>
        {(p.skills || []).map((cat, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div className={styles.skillCat}>{(cat.cat || "").toUpperCase()}</div>
            {(cat.items || []).map((item, j) => <div className={styles.skillItem} key={j}>{item}</div>)}
          </div>
        ))}
      </div>

      {certifications.length > 0 && (
        <div className={styles.cvSection}>
          <div className={styles.cvCatTitle}>{t("cert")}</div>
          {certifications.map((c) => (
            <div className={styles.cvItem} key={c.id}>
              <div className={styles.cvItemHead}>
                <span className={styles.cvRole}>{c.name}</span>
                <span className={styles.cvDate}>{c.date || ""}</span>
              </div>
              {c.issuer && <div className={styles.cvSub}>{c.issuer}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// GALLERY
function GallerySection({ gallery, lang, t, onOpen }: {
  gallery: GalleryImageData[];
  lang: Lang;
  t: T;
  onOpen: (item: LightboxItem) => void;
}) {
  return (
    <>
      <SectionHeader>{t("gallery")}</SectionHeader>
      {!gallery.length
        ? <div className={styles.empty} style={{ textAlign: "center", padding: 40 }}>{t("noGal")}</div>
        : (
          <div className={styles.galleryGrid}>
            {gallery.map((img) => (
              <div
                className={styles.galleryItem}
                key={img.id}
                onClick={() => onOpen({ src: img.src, caption: img.caption })}
              >
                <img src={img.src} alt={img.caption || ""} />
                {img.caption && <div className={styles.galleryCaption}>{img.caption}</div>}
              </div>
            ))}
          </div>
        )
      }
    </>
  );
}

// CONTACT
function ContactSection({ profile, lang, t }: { profile: ProfileData; lang: Lang; t: T }) {
  type LinkDef = { key: keyof ProfileData; label: string; href: (v: string) => string };
  const linkDefs: LinkDef[] = [
    { key: "github",   label: "GITHUB",   href: (v) => v.startsWith("http") ? v : `https://github.com/${v}` },
    { key: "telegram", label: "TELEGRAM", href: (v) => v.startsWith("http") ? v : `https://t.me/${v}` },
    { key: "linkedin", label: "LINKEDIN", href: (v) => v.startsWith("http") ? v : `https://linkedin.com/in/${v}` },
  ];
  const emails = parseEmails(profile.email);
  const hasAny = emails.length > 0 || linkDefs.some(({ key }) => profile[key]);

  return (
    <>
      <SectionHeader>{t("contact")}</SectionHeader>
      {!hasAny
        ? <div className={styles.empty}>{t("noCtct")}</div>
        : (
          <div className={styles.contactList}>
            {emails.map((em) => (
              <div className={styles.contactItem} key={em}>
                <span className={styles.contactLabel}>EMAIL</span>
                <span className={styles.contactVal} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <a href={`mailto:${em}`}>{em}</a>
                  <CopyButton text={em} />
                </span>
              </div>
            ))}
            {linkDefs.filter(({ key }) => profile[key]).map(({ key, label, href }) => {
              const raw = String(profile[key]);
              return (
                <div className={styles.contactItem} key={key}>
                  <span className={styles.contactLabel}>{label}</span>
                  <span className={styles.contactVal}>
                    <a href={href(raw)} target="_blank" rel="noopener noreferrer">
                      {contactDisplayText(key, raw)}
                    </a>
                  </span>
                </div>
              );
            })}
          </div>
        )
      }
    </>
  );
}
