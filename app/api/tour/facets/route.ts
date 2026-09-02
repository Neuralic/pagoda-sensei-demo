import { NextResponse } from "next/server";
import { requireSessionActor } from "@/lib/itinerary-access";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  CATALOG_ALWAYS_ACTIVITY_TYPES,
  canonicalizeActivityTypeLabel,
  sortActivityTypesForMenu,
} from "@/lib/tour-activity-types";

export const runtime = "nodejs";

/**
 * Distinct published-tour locations and activity types for filter dropdowns
 * (lightweight: two columns only).
 */
export async function GET() {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("tour")
      .select("location, country, activity_type")
      .eq("status", "published");

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Database error", detail: error.message },
        { status: 500 }
      );
    }

    /** Destination filter values: distinct cities/areas (location) and countries, aligned with list OR filter. */
    const locSet = new Set<string>();
    const actSet = new Set<string>();
    for (const row of data || []) {
      const loc = typeof row.location === "string" ? row.location.trim() : "";
      const country =
        typeof (row as { country?: string | null }).country === "string"
          ? (row as { country: string }).country.trim()
          : "";
      const act = typeof row.activity_type === "string" ? row.activity_type.trim() : "";
      if (loc) locSet.add(loc);
      if (country) locSet.add(country);
      // Collapse legacy labels (Private Tour, old airport names) into one menu entry each.
      if (act) {
        actSet.add(canonicalizeActivityTypeLabel(act));
      }
    }

    /** Always offer these so agents can filter/book even when no published tour uses them yet. */
    for (const t of CATALOG_ALWAYS_ACTIVITY_TYPES) {
      actSet.add(t);
    }

    return NextResponse.json({
      ok: true,
      locations: [...locSet].sort((a, b) => a.localeCompare(b)),
      activityTypes: sortActivityTypesForMenu(actSet),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
