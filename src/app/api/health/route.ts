import { prisma } from "@/lib/db";

// Readiness of this instance: the database answers. `revision` is the commit the image was built from (Dockerfile
// ARG REVISION), so the staging smoke test can wait for exactly the version it was built for.
export const dynamic = "force-dynamic";

export async function GET() {
  const revision = process.env.SITE_REVISION ?? "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, revision });
  } catch {
    return Response.json({ ok: false, revision }, { status: 503 });
  }
}
