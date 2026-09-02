import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { parseTourIdParam } from "@/lib/advisor-tour-library";

export const runtime = "nodejs";

function canFavorite(role: string | undefined): boolean {
  return role === "agent" || role === "agency" || role === "admin";
}

export async function GET() {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;
    if (!userId || !canFavorite(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseServer();
    if (role !== "admin") {
      const block = await denyIfActivityNotApproved(userId, supabase);
      if (block) return block;
    }

    const { data, error } = await supabase
      .from("advisor_tour_favorites")
      .select("tour_id")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const tourIds = (data || []).map((r) => String((r as { tour_id: number }).tour_id));
    return NextResponse.json({ ok: true, tourIds });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;
    if (!userId || !canFavorite(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      tourId?: string | number;
      favorite?: boolean;
    };
    const tourId = parseTourIdParam(body.tourId);
    if (tourId == null) {
      return NextResponse.json({ ok: false, error: "tourId is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (role !== "admin") {
      const block = await denyIfActivityNotApproved(userId, supabase);
      if (block) return block;
    }

    const { data: tour, error: tourErr } = await supabase
      .from("tour")
      .select("id")
      .eq("id", tourId)
      .maybeSingle();

    if (tourErr || !tour) {
      return NextResponse.json({ ok: false, error: "Tour not found" }, { status: 404 });
    }

    const favorite = body.favorite !== false;

    if (favorite) {
      const { error } = await supabase.from("advisor_tour_favorites").upsert(
        { user_id: userId, tour_id: tourId },
        { onConflict: "user_id,tour_id" }
      );
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favorite: true, tourId: String(tourId) });
    }

    const { error } = await supabase
      .from("advisor_tour_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("tour_id", tourId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, favorite: false, tourId: String(tourId) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
