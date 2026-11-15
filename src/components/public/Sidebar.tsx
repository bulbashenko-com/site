"use client";

import { cn } from "@/lib/cn";
import type { Lang, ProfileData } from "@/types";
import { SECTIONS, type SectionId } from "./sections";
import { translations } from "@/lib/i18n";
import Link from "next/link";
import styles from "./Sidebar.module.css";

const LANGS: Lang[] = ["en", "ru", "sk"];

interface Props {
  section: SectionId;
  lang: Lang;
  onSection: (s: SectionId) => void;
  onLang: (l: Lang) => void;
  profile: ProfileData;
}

export function Sidebar({ section, lang, onSection, onLang, profile }: Props) {
  const t = (key: keyof (typeof translations)["en"]) =>
    translations[lang]?.[key] ?? translations.en[key];

  const lastName = (profile.name || "Albekov").split(" ").slice(-1)[0].toUpperCase();
  const title =
    (lang === "ru" ? profile.titleRu : lang === "sk" ? profile.titleSk : profile.titleEn) ||
    "DevOps Engineer";

  return (
    <div className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.name}>{lastName}</div>
        <div className={styles.sub}>{title}</div>
      </div>

      <nav className={styles.nav}>
        {SECTIONS.map((s) => (
          <button
            key={s}
            className={cn(styles.navBtn, section === s && styles.active)}
            onClick={() => onSection(s)}
          >
            {t(s)}
          </button>
        ))}
      </nav>

      <div className={styles.bottom}>
        <div className={styles.langWrap}>
          {LANGS.map((l) => (
            <button
              key={l}
              className={cn(styles.langBtn, lang === l && styles.active)}
              onClick={() => onLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Link href="/admin" className={styles.siteLink}>[ ADMIN ]</Link>
      </div>
    </div>
  );
}
