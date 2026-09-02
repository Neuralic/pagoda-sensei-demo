import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  enrichPublishedToursForAgentCatalog,
  type TourRowForAgentCatalog,
} from "@/lib/enrich-published-tours-for-agent-catalog";
import { fetchAssignedGuidesForTours } from "@/lib/guide-tour-assignments";
import { isGuideTier } from "@/lib/guide-tier";
import { activityTypePostgrestOrFilter } from "@/lib/tour-activity-types";

export const runtime = "nodejs";

const TOUR_SELECT =
  "id, user_id, name, activity_type, start_time, end_time, location, country, description, image, notes, languages, tour_date, adults, children, status, created_at, updated_at, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate";

function parseLimit(raw: string | null): number {
  const n = parseInt(raw || "60", 10);
  if (Number.isNaN(n)) return 60;
  return Math.min(100, Math.max(1, n));
}

function parseOffset(raw: string | null): number {
  const n = parseInt(raw || "0", 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

/** Escape value for PostgREST `or()` ilike clauses (avoid breaking the filter string). */
function escapeIlikeFragment(s: string): string {
  return s
    .replace(/%/g, "")
    .replace(/,/g, "")
    .replace(/[()]/g, "")
    .trim()
    .slice(0, 200);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseLimit(searchParams.get("limit"));
    const offset = parseOffset(searchParams.get("offset"));
    const location = searchParams.get("location")?.trim() || "";
    const activityType = searchParams.get("activityType")?.trim() || "";
    const qRaw = searchParams.get("q")?.trim() || "";
    const tierParam = searchParams.get("tier")?.trim() || "";
    const tierFilter = isGuideTier(tierParam) ? tierParam : null;

    const supabase = getSupabaseServer();

    let query = supabase
      .from("tour")
      .select(TOUR_SELECT, { count: "exact" })
      .eq("status", "published");

    // Match /api/tour/all and the tour library: partial case-insensitive match.
    // Exact .eq() on location/activity_type hid tours when DB values differed from
    // facet strings (whitespace, formatting) or when country vs location columns differ.
    if (location) {
      const locEsc = escapeIlikeFragment(location);
      if (locEsc.length > 0) {
        const p = `%${locEsc}%`;
        query = query.or(`location.ilike.${p},country.ilike.${p}`);
      }
    }
    if (activityType) {
      // Do NOT strip parentheses from the label before matching — e.g.
      // "Shinkansen Tickets (bullet train)" must stay intact for canonicalize/variants.
      // Quote values in `.or()` so spaces/parens do not break PostgREST parsing.
      const actOr = activityTypePostgrestOrFilter(activityType);
      if (actOr) {
        query = query.or(actOr);
      }
    }

    const esc = escapeIlikeFragment(qRaw);
    let guideMatchedTourIds: string[] = [];
    if (esc.length > 0) {
      const p = `%${esc}%`;
      // Also match tours by guide / operator name (first, last, or full "First Last")
      const { data: matchedUsers } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.${p},last_name.ilike.${p}`)
        .limit(80);
      const qLower = esc.toLowerCase();
      const userIds = (matchedUsers || [])
        .filter((u) => {
          const first = String((u as { first_name?: string }).first_name || "");
          const last = String((u as { last_name?: string }).last_name || "");
          const full = `${first} ${last}`.trim().toLowerCase();
          return (
            first.toLowerCase().includes(qLower) ||
            last.toLowerCase().includes(qLower) ||
            full.includes(qLower)
          );
        })
        .map((u) => String((u as { id?: string }).id || ""))
        .filter(Boolean);
      if (userIds.length > 0) {
        const [{ data: owned }, { data: assigned }] = await Promise.all([
          supabase.from("tour").select("id").eq("status", "published").in("user_id", userIds).limit(100),
          supabase
            .from("guide_tour_assignments")
            .select("tour_id")
            .in("guide_id", userIds)
            .limit(100),
        ]);
        guideMatchedTourIds = [
          ...new Set([
            ...(owned || []).map((r) => String((r as { id?: string }).id || "")),
            ...(assigned || []).map((r) => String((r as { tour_id?: string }).tour_id || "")),
          ].filter(Boolean)),
        ];
      }

      if (guideMatchedTourIds.length > 0) {
        const idList = guideMatchedTourIds.join(",");
        query = query.or(
          `name.ilike.${p},description.ilike.${p},location.ilike.${p},country.ilike.${p},activity_type.ilike.${p},id.in.(${idList})`
        );
      } else {
        query = query.or(
          `name.ilike.${p},description.ilike.${p},location.ilike.${p},country.ilike.${p},activity_type.ilike.${p}`
        );
      }
    }

    const end = offset + limit - 1;
    const { data: tours, error, count } = await query.order("created_at", { ascending: false }).range(offset, end);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Database error", detail: error.message },
        { status: 500 }
      );
    }

    const jar = await cookies();
    const role = jar.get("role")?.value;
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
      tierFilter,
    });

    let toursWithGuides = enrichedTours.map((t) => ({
      ...t,
      assignedGuides: guidesByTour[String(t.id)] || [],
    }));

    if (tierFilter) {
      toursWithGuides = toursWithGuides.filter(
        (t) => (t.assignedGuides as unknown[]).length > 0
      );
    }

    const total = count ?? 0;
    const returned = toursWithGuides.length;
    const hasMore = offset + returned < total;

    return NextResponse.json({
      ok: true,
      tours: toursWithGuides,
      total,
      limit,
      offset,
      hasMore,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
