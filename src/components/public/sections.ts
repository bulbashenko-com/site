/** The public site's sections, in menu order (desktop sidebar and mobile nav). */
export const SECTIONS = ["home", "blog", "projects", "cv", "gallery", "files", "contact"] as const;
export type SectionId = (typeof SECTIONS)[number];
