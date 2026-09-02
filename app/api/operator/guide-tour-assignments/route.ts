import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireOperatorAccount } from "@/lib/operator-auth";
import {
  assertGuideAssignableToOperator,
  assertTourOwnedByOperator,
  fetchAssignedGuidesForTours,
  fetchAssignedToursForGuide,
  setTourGuideAssignments,
  validateGuidesHavePublishedProfiles,
} from "@/lib/guide-tour-assignments";
import { isGuideTier } from "@/lib/guide-tier";

export const runtime = "nodejs";

async function requireOperator() {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return { error: auth.response };
  return { userId: auth.session.userId, supabase: auth.session.supabase };
}

/**
 * GET ?guideId= | ?tourId= | (no params = all assignments for operator)
 */
export async function GET(req: Request) {
  const auth = await requireOperator();
  if ("error" in auth && auth.error) return auth.error;
  const { userId, supabase } = auth as { userId: string; supabase: ReturnType<typeof getSupabaseServer> };

  const { searchParams } = new URL(req.url);
  const guideId = searchParams.get("guideId")?.trim();
  const tourId = searchParams.get("tourId")?.trim();

  if (guideId) {
    const assignable = await assertGuideAssignableToOperator(supabase, userId, guideId);
    if (!assignable) {
      return NextResponse.json({ ok: false, error: "Guide not on your roster" }, { status: 404 });
    }
    const { data: assigned } = await supabase
      .from("guide_tour_assignments")
      .select("tour_id")
      .eq("operator_id", userId)
      .eq("guide_id", guideId);
    const tourIds = (assigned || []).map((a) => String((a as { tour_id: string | number }).tour_id));

    const { data: allTours } = await supabase
      .from("tour")
      .select("id, name, location, country, activity_type, status, image")
      .eq("user_id", userId)
      .order("name");

    return NextResponse.json({
      ok: true,
      guideId,
      assignedTourIds: tourIds,
      tours: allTours || [],
    });
  }

  if (tourId) {
    const owned = await assertTourOwnedByOperator(supabase, userId, tourId);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Tour not found" }, { status: 404 });
    }
    const { data: assigned } = await supabase
      .from("guide_tour_assignments")
      .select("guide_id")
      .eq("operator_id", userId)
      .eq("tour_id", tourId);
    const guideIds = (assigned || []).map((a) => (a as { guide_id: string }).guide_id);

    const { data: roster } = await supabase
      .from("operator_roster")
      .select("guide_id")
      .eq("operator_id", userId);

    const rosterGuideIds = [
      userId,
      ...(roster || []).map((r) => (r as { guide_id: string }).guide_id),
    ];
    const byTour = await fetchAssignedGuidesForTours(supabase, [tourId]);

    return NextResponse.json({
      ok: true,
      tourId,
      assignedGuideIds: guideIds,
      rosterGuideIds: [...new Set(rosterGuideIds)],
      assignedGuides: byTour[String(tourId)] || [],
      selfGuideId: userId,
    });
  }

  const { data: assignments } = await supabase
    .from("guide_tour_assignments")
    .select("tour_id, guide_id")
    .eq("operator_id", userId);

  return NextResponse.json({ ok: true, assignments: assignments || [] });
}

/**
 * PUT { guideId, tourIds: string[] } — set tours for a guide
 * PUT { tourId, guideIds: string[] } — set guides for a tour
 */
export async function PUT(req: Request) {
  const auth = await requireOperator();
  if ("error" in auth && auth.error) return auth.error;
  const { userId, supabase } = auth as { userId: string; supabase: ReturnType<typeof getSupabaseServer> };

  const body = (await req.json().catch(() => ({}))) as {
    guideId?: string;
    tourIds?: string[];
    tourId?: string;
    guideIds?: string[];
  };

  if (body.guideId && Array.isArray(body.tourIds)) {
    const guideId = body.guideId.trim();
    if (!(await assertGuideAssignableToOperator(supabase, userId, guideId))) {
      return NextResponse.json(
        { ok: false, error: "Guide not on your roster (or not yourself)" },
        { status: 400 }
      );
    }
    for (const tid of body.tourIds) {
      if (!(await assertTourOwnedByOperator(supabase, userId, tid))) {
        return NextResponse.json({ ok: false, error: `Tour ${tid} not found` }, { status: 400 });
      }
    }

    await supabase
      .from("guide_tour_assignments")
      .delete()
      .eq("operator_id", userId)
      .eq("guide_id", guideId);

      if (body.tourIds.length > 0) {
      const check = await validateGuidesHavePublishedProfiles(supabase, [guideId]);
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }
      const rows = body.tourIds.map((rawId) => {
        const tid = String(rawId);
        return {
          operator_id: userId,
          tour_id: /^\d+$/.test(tid) ? Number(tid) : tid,
          guide_id: guideId,
        };
      });
      const { error } = await supabase.from("guide_tour_assignments").insert(rows);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.tourId && Array.isArray(body.guideIds)) {
    const tourId = body.tourId.trim();
    if (!(await assertTourOwnedByOperator(supabase, userId, tourId))) {
      return NextResponse.json({ ok: false, error: "Tour not found" }, { status: 400 });
    }
    if (body.guideIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Every tour needs at least one linked guide profile." },
        { status: 400 }
      );
    }
    const result = await setTourGuideAssignments(supabase, userId, tourId, body.guideIds);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, error: "Provide guideId+tourIds or tourId+guideIds" },
    { status: 400 }
  );
}

/** Public/agent: assigned guides for tour(s) */
export async function POST(req: Request) {
  const jar = await cookies();
  const session = jar.get("session")?.value;
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tourIds?: string[];
    guideId?: string;
    tier?: string;
  };
  const supabase = getSupabaseServer();
  const tierFilter = isGuideTier(body.tier) ? body.tier : null;

  if (body.guideId) {
    const tours = await fetchAssignedToursForGuide(supabase, body.guideId.trim(), {
      publishedOnly: true,
    });
    return NextResponse.json({ ok: true, tours });
  }

  const tourIds = body.tourIds || [];
  if (tourIds.length === 0) {
    return NextResponse.json({ ok: false, error: "tourIds or guideId required" }, { status: 400 });
  }

  const byTour = await fetchAssignedGuidesForTours(supabase, tourIds, {
    publishedToursOnly: true,
    tierFilter,
  });
  return NextResponse.json({ ok: true, guidesByTour: byTour });
}
