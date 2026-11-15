import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MEDIA_ORDER, toMediaData } from "@/lib/media";
import { syncMediaQuietly } from "@/lib/media-sync";
import { isNextcloudConfigured, nextcloudPublicUrl } from "@/lib/nextcloud";

// Admin: every item, hidden ones included, and where to upload.
export async function GET() {
  await syncMediaQuietly();
  const items = await prisma.mediaItem.findMany({ orderBy: MEDIA_ORDER });
  return NextResponse.json({
    configured: isNextcloudConfigured(),
    nextcloudUrl: nextcloudPublicUrl(),
    root: process.env.NEXTCLOUD_ROOT ?? "Site",
    items: items.map(toMediaData),
  });
}
