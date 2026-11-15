import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  console.log("Seeding database...");

  await prisma.profile.upsert({
    where: { id: 1 },
    create: {
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
      skills: [
        { cat: "Systems & DevOps", items: ["Linux (Ubuntu, Debian, RHEL)", "Docker", "Kubernetes (K8s)", "Jenkins", "GitLab CI", "Git / GitHub"] },
        { cat: "Programming", items: ["Python", "TypeScript / JavaScript", "Bash"] },
        { cat: "Infrastructure & Cloud", items: ["Network Configuration", "VPN (NetBird)", "Vercel", "Coolify"] },
        { cat: "Databases", items: ["SQL", "NoSQL"] },
      ],
    },
    update: {},
  });

  console.log("Seed complete. Admin sign-in goes through the SSO provider (OIDC_* env vars).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
