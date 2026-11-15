import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toMediaData } from "@/lib/media";

// Caption and visibility. The file itself is changed or deleted in Nextcloud, never here.
const schema = z.object({
  caption: z.string().max(500).nullable().optional(),
  hidden: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  try {
    const item = await prisma.mediaItem.update({ where: { id }, data: parsed.data });
    revalidatePath("/");
    return NextResponse.json(toMediaData(item));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
