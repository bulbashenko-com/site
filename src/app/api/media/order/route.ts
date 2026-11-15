import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

// The new order of one section: ids top to bottom. Items left out (new uploads since the admin loaded the list)
// keep order 0 and so stay on top.
const schema = z.object({ ids: z.array(z.string()).max(10000) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  await prisma.$transaction(
    parsed.data.ids.map((id, i) => prisma.mediaItem.updateMany({ where: { id }, data: { order: i + 1 } }))
  );
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
