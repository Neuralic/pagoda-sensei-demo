import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  enrichPublishedToursForAgentCatalog,
  type TourRowForAgentCatalog,
} from "@/lib/enrich-published-tours-for-agent-catalog";
import { fetchAssignedGuidesForTours } from "@/lib/guide-tour-assignments";
import { activityTypePostgrestOrFilter } from "@/lib/tour-activity-types";
import { getTourSoldCounts } from "@/lib/tour-sold-counts";

export const runtime = "nodejs";

const TOUR_SELECT =
  "id, user_id, name, activity_type, start_time, end_time, location, country, description, image, notes, languages, tour_date, adults, children, status, created_at, updated_at, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const activityType = searchParams.get("activityType") || "";
    const location = searchParams.get("location") || "";

    const supabase = getSupabaseServer();

    let query = supabase
      .from("tour")
      .select(TOUR_SELECT, { count: "exact" })
      .eq("status", "published");

    if (activityType) {
      const actOr = activityTypePostgrestOrFilter(activityType);
      if (actOr) query = query.or(actOr);
    }

    if (location) {
      query = query.ilike("location", `%${location}%`);
    }

    const { data: tours, error, count } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Database error", detail: error.message },
        { status: 500 }
      );
    }

    const jar = await cookies();
    const role = jar.get("role")?.value;
    const userId = jar.get("userId")?.value;
    const isAdmin = role === "admin";

    let enrichedTours: Record<string, unknown>[];
    try {
      enrichedTours = await enrichPublishedToursForAgentCatalog(
        supabase,
        (tours || []) as TourRowForAgentCatalog[],
        isAdmin
      );
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : "Unexpected error";
      return NextResponse.json(
        { ok: false, error: "Database error", detail },
        { status: 500 }
      );
    }

    const tourIds = enrichedTours.map((t) => String(t.id || "")).filter(Boolean);
    const guidesByTour = await fetchAssignedGuidesForTours(supabase, tourIds, {
      publishedToursOnly: true,
    });

    let soldCounts: Record<string, number> = {};
    try {
      soldCounts = await getTourSoldCounts(supabase, tourIds);
    } catch {
      soldCounts = {};
    }

    const favoriteIds = new Set<string>();
    if (userId && (role === "agent" || role === "agency" || role === "admin")) {
      try {
        const { data: favRows, error: favErr } = await supabase
          .from("advisor_tour_favorites")
          .select("tour_id")
          .eq("user_id", userId);
        if (!favErr) {
          for (const row of favRows || []) {
            const id = (row as { tour_id?: string | number }).tour_id;
            if (id != null) favoriteIds.add(String(id));
          }
        }
      } catch {
        // Table may not exist until migration is applied.
      }
    }

    const toursWithGuides = enrichedTours.map((t) => {
      const id = String(t.id || "");
      return {
        ...t,
        assignedGuides: guidesByTour[id] || [],
        bookingCount: soldCounts[id] || 0,
        isFavorite: favoriteIds.has(id),
      };
    });

    return NextResponse.json({
      ok: true,
      tours: toursWithGuides,
      total: count || 0,
      filters: {
        activityType,
        location,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
