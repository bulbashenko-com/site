import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncMedia } from "@/lib/media-sync";
import { isNextcloudConfigured } from "@/lib/nextcloud";

// Admin "refresh": reads the Team folder now instead of waiting for the next check.
export async function POST() {
  if (!isNextcloudConfigured()) return NextResponse.json({ error: "Nextcloud is not configured" }, { status: 503 });
  try {
    const result = await syncMedia(true);
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
