import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { canPerformFullActivity } from "@/lib/activity-approval";
import {
  fetchGuideAvailability,
  isAvailabilityConfigured,
} from "@/lib/guide-availability";
import { getGuideBookingCount } from "@/lib/guide-profile-stats";

export const runtime = "nodejs";

/** GET — whether the logged-in guide can bid (approval + availability calendar for first booking). */
export async function GET() {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;

  if (!userId || role !== "guide") {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  const { data: user } = await supabase
    .from("users")
    .select("guide_approved, role")
    .eq("id", userId)
    .maybeSingle();

  const guideApproved = canPerformFullActivity({
    role: user?.role ?? "guide",
    guide_approved: user?.guide_approved,
  });

  const bookingCount = await getGuideBookingCount(supabase, userId);
  const cal = await fetchGuideAvailability(supabase, userId);
  const availabilityConfigured = isAvailabilityConfigured(cal);

  return NextResponse.json({
    ok: true,
    guideApproved,
    availabilityConfigured,
    bookingCount,
    canBid: guideApproved && (bookingCount > 0 || availabilityConfigured),
  });
}
