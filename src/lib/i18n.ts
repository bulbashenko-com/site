import type { Lang } from "@/types";

export const translations = {
  en: {
    home: "HOME",
    blog: "BLOG",
    projects: "PROJECTS",
    cv: "CV",
    gallery: "GALLERY",
    files: "FILES",
    contact: "CONTACT",
    skills: "SKILLS",
    back: "BACK",
    exp: "EXPERIENCE",
    edu: "EDUCATION",
    cert: "CERTIFICATIONS",
    present: "PRESENT",
    noPosts: "NO POSTS YET.",
    noProj: "NO PROJECTS YET.",
    noGal: "NO IMAGES YET.",
    noFiles: "NO FILES YET.",
    noCtct: "NO CONTACT INFO.",
    noExp: "NO EXPERIENCE LISTED.",
    noEdu: "NO EDUCATION LISTED.",
    noCert: "NO CERTIFICATIONS.",
  },
  ru: {
    home: "ГЛАВНАЯ",
    blog: "БЛОГ",
    projects: "ПРОЕКТЫ",
    cv: "РЕЗЮМЕ",
    gallery: "ГАЛЕРЕЯ",
    files: "ФАЙЛЫ",
    contact: "КОНТАКТЫ",
    skills: "НАВЫКИ",
    back: "НАЗАД",
    exp: "ОПЫТ РАБОТЫ",
    edu: "ОБРАЗОВАНИЕ",
    cert: "СЕРТИФИКАЦИИ",
    present: "НАСТ. ВРЕМЯ",
    noPosts: "НЕТ СТАТЕЙ.",
    noProj: "НЕТ ПРОЕКТОВ.",
    noGal: "НЕТ ИЗОБРАЖЕНИЙ.",
    noFiles: "НЕТ ФАЙЛОВ.",
    noCtct: "НЕТ КОНТАКТОВ.",
    noExp: "НЕТ ОПЫТА.",
    noEdu: "НЕТ ОБРАЗОВАНИЯ.",
    noCert: "НЕТ СЕРТИФИКАЦИЙ.",
  },
  sk: {
    home: "DOMOV",
    blog: "BLOG",
    projects: "PROJEKTY",
    cv: "CV",
    gallery: "GALÉRIA",
    files: "SÚBORY",
    contact: "KONTAKT",
    skills: "ZRUČNOSTI",
    back: "SPÄŤ",
    exp: "SKÚSENOSTI",
    edu: "VZDELANIE",
    cert: "CERTIFIKÁCIE",
    present: "SÚČASNOSŤ",
    noPosts: "ŽIADNE PRÍSPEVKY.",
    noProj: "ŽIADNE PROJEKTY.",
    noGal: "ŽIADNE OBRÁZKY.",
    noFiles: "ŽIADNE SÚBORY.",
    noCtct: "ŽIADNE KONTAKTY.",
    noExp: "ŽIADNE SKÚSENOSTI.",
    noEdu: "ŽIADNE VZDELANIE.",
    noCert: "ŽIADNE CERTIFIKÁCIE.",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export function t(lang: Lang, key: TranslationKey): string {
  return translations[lang]?.[key] ?? translations.en[key];
}

export function gloc(
  lang: Lang,
  obj: Partial<Record<Lang, string | null>> | string | null | undefined,
  fallback = ""
): string {
  if (!obj) return fallback;
  if (typeof obj === "string") return obj;
  return obj[lang] || obj.en || Object.values(obj).find(Boolean) || fallback;
}
