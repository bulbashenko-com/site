import { cache } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { MEDIA_ORDER, photoUrl, toMediaData } from "@/lib/media";
import { syncMediaQuietly } from "@/lib/media-sync";
import { isNextcloudConfigured } from "@/lib/nextcloud";
import { PublicSite } from "@/components/public/PublicSite";
import type { SiteData, ProfileData, SkillCategory } from "@/types";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bulbashenko.com";

const getProfileForMeta = cache(async () => {
  try {
    return await prisma.profile.findFirst();
  } catch {
    return null;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfileForMeta();
  const name = profile?.name ?? "Aleksandr Albekov";
  const description = profile?.bioEn ?? "Linux systems, containers, pipelines. Building infrastructure that doesn't wake me at 3am.";
  const pageTitle = `${name} — Personal Site About Networks`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      url: siteUrl,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
    },
    alternates: { canonical: siteUrl },
  };
}

type DbPost = Awaited<ReturnType<typeof prisma.post.findMany>>[number];
type DbProject = Awaited<ReturnType<typeof prisma.project.findMany>>[number];
type DbCVEntry = Awaited<ReturnType<typeof prisma.cVEntry.findMany>>[number];

async function getSiteData(): Promise<SiteData> {
  try {
    await syncMediaQuietly();
    const [profile, posts, projects, media, cvEntries] = await Promise.all([
      prisma.profile.findFirst({ include: { photoMedia: true } }),
      prisma.post.findMany({ where: { published: true }, orderBy: { date: "desc" } }),
      prisma.project.findMany({ orderBy: { order: "asc" } }),
      // Without Nextcloud nothing can be served (see /api/media).
      isNextcloudConfigured() ? prisma.mediaItem.findMany({ where: { hidden: false }, orderBy: MEDIA_ORDER }) : [],
      prisma.cVEntry.findMany({ orderBy: { order: "asc" } }),
    ]);

    const defaultProfile: ProfileData = {
      id: 1,
      name: "Aleksandr Albekov",
      birthday: "2004-07-13",
      location: "Slovakia",
      titleEn: "DevOps Engineer",
      titleRu: "DevOps инженер",
      titleSk: "DevOps inžinier",
      bioEn: "Linux systems, containers, pipelines. Building infrastructure that doesn't wake me at 3am.",
      bioRu: "Linux системы, контейнеры, пайплайны. Строю инфраструктуру, которая не разбудит меня в 3 ночи.",
      bioSk: "Linux systémy, kontajnery, pipeline. Budujem infraštruktúru, ktorá ma nezobudí o 3 ráno.",
      photo: null,
      email: "",
      github: "",
      telegram: "",
      linkedin: "",
      skills: [
        { cat: "Systems & DevOps", items: ["Linux (Ubuntu, Debian, RHEL)", "Docker", "Kubernetes (K8s)", "Jenkins", "GitLab CI", "Git / GitHub"] },
        { cat: "Programming", items: ["Python", "TypeScript / JavaScript", "Bash"] },
        { cat: "Infrastructure & Cloud", items: ["Network Configuration", "VPN (NetBird)", "Vercel", "Coolify"] },
        { cat: "Databases", items: ["SQL", "NoSQL"] },
      ],
    };

    const profileData: ProfileData = profile
      ? {
          id: profile.id,
          name: profile.name,
          birthday: profile.birthday,
          location: profile.location,
          titleEn: profile.titleEn,
          titleRu: profile.titleRu,
          titleSk: profile.titleSk,
          bioEn: profile.bioEn,
          bioRu: profile.bioRu,
          bioSk: profile.bioSk,
          photo: isNextcloudConfigured() ? photoUrl(profile.photoMedia) : null,
          email: profile.email,
          github: profile.github,
          telegram: profile.telegram,
          linkedin: profile.linkedin,
          skills: (profile.skills as unknown as SkillCategory[]) || defaultProfile.skills,
        }
      : defaultProfile;

    return {
      profile: profileData,
      posts: posts.map((p: DbPost) => ({
        id: p.id,
        title: p.title,
        titleRu: p.titleRu,
        titleSk: p.titleSk,
        content: p.content,
        contentRu: p.contentRu,
        contentSk: p.contentSk,
        date: p.date,
        tags: p.tags,
        published: p.published,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      projects: projects.map((p: DbProject) => ({
        id: p.id,
        name: p.name,
        nameRu: p.nameRu,
        nameSk: p.nameSk,
        desc: p.desc,
        descRu: p.descRu,
        descSk: p.descSk,
        stack: p.stack,
        github: p.github,
        url: p.url,
        order: p.order,
      })),
      gallery: media.filter((m) => m.section === "GALLERY").map(toMediaData),
      files: media.filter((m) => m.section === "FILES").map(toMediaData),
      cvEntries: cvEntries.map((e: DbCVEntry) => ({
        id: e.id,
        type: e.type as "experience" | "education" | "certification",
        role: e.role,
        company: e.company,
        degree: e.degree,
        institution: e.institution,
        name: e.name,
        issuer: e.issuer,
        start: e.start,
        end: e.end,
        desc: e.desc,
        date: e.date,
        order: e.order,
      })),
    };
  } catch {
    // If DB is not available (e.g. first run), return defaults
    return {
      profile: {
        id: 1,
        name: "Aleksandr Albekov",
        birthday: "2004-07-13",
        location: "Slovakia",
        titleEn: "DevOps Engineer",
        titleRu: "DevOps инженер",
        titleSk: "DevOps inžinier",
        bioEn: "Linux systems, containers, pipelines.",
        bioRu: "Linux системы, контейнеры, пайплайны.",
        bioSk: "Linux systémy, kontajnery, pipeline.",
        photo: null,
        email: "",
        github: "",
        telegram: "",
        linkedin: "",
        skills: [],
      },
      posts: [],
      projects: [],
      gallery: [],
      files: [],
      cvEntries: [],
    };
  }
}

// Rendered per request: the Docker image is built without database access.
export const dynamic = "force-dynamic";

function buildJsonLd(profile: ProfileData) {
  const social = [profile.github, profile.linkedin, profile.telegram]
    .filter(Boolean)
    .map((s) => (s!.startsWith("http") ? s! : `https://${s}`));

  const skills = (profile.skills as SkillCategory[]).flatMap((c) => c.items);

  const person = {
    "@type": "Person",
    "@id": `${siteUrl}/#person`,
    name: profile.name,
    alternateName: ["Александр Албеков", "Albekov", "bulbashenko"],
    url: siteUrl,
    jobTitle: profile.titleEn,
    description: profile.bioEn,
    ...(profile.birthday && { birthDate: profile.birthday }),
    ...(profile.photo && { image: { "@type": "ImageObject", url: profile.photo } }),
    ...(profile.email && { email: profile.email }),
    ...(social.length > 0 && { sameAs: [siteUrl, ...social] }),
    ...(profile.location && {
      address: { "@type": "PostalAddress", addressCountry: "SK", addressLocality: profile.location },
    }),
    ...(skills.length > 0 && { knowsAbout: skills }),
  };

  const website = {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: profile.name,
    description: profile.bioEn,
    author: { "@id": `${siteUrl}/#person` },
    inLanguage: ["en", "ru", "sk"],
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [person, website],
  };
}

export default async function HomePage() {
  const data = await getSiteData();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(data.profile)) }}
      />
      <PublicSite data={data} />
    </>
  );
}
