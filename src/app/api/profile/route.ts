import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/media";

const skillSchema = z.object({
  cat: z.string().max(100),
  items: z.array(z.string().max(200)).max(50),
});

const schema = z.object({
  name: z.string().min(1).max(200),
  birthday: z.string().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  titleEn: z.string().max(200).optional().nullable(),
  titleRu: z.string().max(200).optional().nullable(),
  titleSk: z.string().max(200).optional().nullable(),
  bioEn: z.string().max(5000).optional().nullable(),
  bioRu: z.string().max(5000).optional().nullable(),
  bioSk: z.string().max(5000).optional().nullable(),
  photoMediaId: z.string().optional().nullable(),
  email: z.string().max(2000).optional().nullable(),
  github: z.string().max(200).optional().nullable(),
  telegram: z.string().max(200).optional().nullable(),
  linkedin: z.string().max(200).optional().nullable(),
  skills: z.array(skillSchema).max(20),
});

const DEFAULT_PROFILE = {
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

export async function GET() {
  const profile = await prisma.profile.findFirst({ include: { photoMedia: true } });
  if (!profile) return NextResponse.json(DEFAULT_PROFILE);
  const { photoMedia, ...rest } = profile;
  return NextResponse.json({ ...rest, photo: photoUrl(photoMedia) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });

  const profile = await prisma.profile.upsert({
    where: { id: 1 },
    create: { id: 1, ...parsed.data },
    update: parsed.data,
    include: { photoMedia: true },
  });
  revalidatePath("/");
  const { photoMedia, ...rest } = profile;
  return NextResponse.json({ ...rest, photo: photoUrl(photoMedia) });
}
