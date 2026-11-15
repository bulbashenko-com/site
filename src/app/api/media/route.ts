import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MEDIA_ORDER, toMediaData } from "@/lib/media";
import { syncMediaQuietly } from "@/lib/media-sync";
import { isNextcloudConfigured } from "@/lib/nextcloud";

// Public: what the site shows (gallery and files, hidden items left out).
export async function GET() {
  // Without Nextcloud nothing can be served, so nothing is listed (rows may still exist, e.g. copied into staging).
  if (!isNextcloudConfigured()) return NextResponse.json([]);
  await syncMediaQuietly();
  const items = await prisma.mediaItem.findMany({ where: { hidden: false }, orderBy: MEDIA_ORDER });
  return NextResponse.json(items.map(toMediaData));
}
