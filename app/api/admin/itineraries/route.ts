import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { todayUtcDateString } from "@/lib/itinerary-timeframe";
import { parseIntakeData } from "@/lib/itinerary-intake";

export const runtime = "nodejs";

type AdvisorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function advisorName(u: AdvisorRow | null | undefined): string {
  if (!u) return "Advisor";
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return name || u.email || "Advisor";
}

/**
 * Admin overall access — list every itinerary on the platform.
 * Optional filters: search, buildMode (all|pagoda_build|self), status, page, perPage.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const offset = (page - 1) * perPage;
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const safeSearch = search.replace(/[%(),]/g, "").slice(0, 80);
    const buildModeRaw = (searchParams.get("buildMode") || "all").trim().toLowerCase();
    const statusRaw = (searchParams.get("status") || "all").trim().toLowerCase();
    const userIdFilter = (searchParams.get("userId") || "").trim();

    const buildMode =
      buildModeRaw === "pagoda_build" || buildModeRaw === "self" ? buildModeRaw : "all";
    const status =
      statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived"
        ? statusRaw
        : "all";

    let query = auth.supabase
      .from("itineraries")
      .select(
        "id, name, location, status, start_date, end_date, created_at, updated_at, build_mode, intake_data, user_id, arrival_transfer, arrival_flight_number, arrival_flight_time, departure_transfer, departure_flight_number, departure_flight_time",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (buildMode !== "all") {
      query = query.eq("build_mode", buildMode);
    }
    // A trip whose dates have passed is archived, whatever its stored status. The advisor's
    // own list has always worked this way (isItineraryArchived); admin did not, so finished
    // trips kept sitting in Published and All.
    const today = todayUtcDateString();
    if (status === "archived") {
      query = query.or(`status.eq.archived,end_date.lt.${today}`);
    } else if (status !== "all") {
      query = query.eq("status", status).or(`end_date.gte.${today},end_date.is.null`);
    } else {
      query = query.or(`end_date.gte.${today},end_date.is.null`).neq("status", "archived");
    }
    if (userIdFilter) {
      query = query.eq("user_id", userIdFilter);
    }

    // When searching by advisor name/email, resolve matching user ids first.
    let advisorIdFilter: string[] | null = null;
    if (safeSearch) {
      const { data: matchedAdvisors } = await auth.supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .or(
          `email.ilike.%${safeSearch}%,first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%`
        )
        .limit(100);

      advisorIdFilter = (matchedAdvisors ?? []).map((a) => a.id);
    }

    if (safeSearch) {
      const orParts = [
        `name.ilike.%${safeSearch}%`,
        `location.ilike.%${safeSearch}%`,
      ];
      if (advisorIdFilter && advisorIdFilter.length > 0) {
        orParts.push(`user_id.in.(${advisorIdFilter.join(",")})`);
      }
      query = query.or(orParts.join(","));
    }

    const { data: rows, error, count } = await query.range(offset, offset + perPage - 1);

    if (error) {
      console.error("[admin/itineraries] list error:", error);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
    const advisorsById = new Map<string, AdvisorRow>();

    if (userIds.length > 0) {
      const { data: advisors } = await auth.supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", userIds);

      for (const a of advisors ?? []) {
        advisorsById.set(a.id, a as AdvisorRow);
      }
    }

    // Job counts per itinerary (for overall control panel)
    const itineraryIds = (rows ?? []).map((r) => r.id);
    const jobCountByItinerary = new Map<string, number>();
    if (itineraryIds.length > 0) {
      const { data: jobs } = await auth.supabase
        .from("jobs")
        .select("id, itinerary_id")
        .in("itinerary_id", itineraryIds);

      for (const j of jobs ?? []) {
        const iid = j.itinerary_id as string;
        if (!iid) continue;
        jobCountByItinerary.set(iid, (jobCountByItinerary.get(iid) || 0) + 1);
      }
    }

    const items = (rows ?? []).map((row) => {
      const advisor = advisorsById.get(row.user_id);
      return {
        id: row.id,
        name: row.name,
        location: row.location,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at ?? null,
        build_mode: row.build_mode || "self",
        intake_data: parseIntakeData(row.intake_data),
        advisor_id: row.user_id,
        advisor_name: advisorName(advisor),
        advisor_email: advisor?.email ?? "",
        job_count: jobCountByItinerary.get(row.id) || 0,
        arrival_transfer: row.arrival_transfer,
        arrival_flight_number: row.arrival_flight_number,
        arrival_flight_time: row.arrival_flight_time,
        departure_transfer: row.departure_transfer,
        departure_flight_number: row.departure_flight_number,
        departure_flight_time: row.departure_flight_time,
      };
    });

    return NextResponse.json({
      ok: true,
      itineraries: items,
      total: count ?? items.length,
      page,
      perPage,
      filters: { buildMode, status, search: safeSearch },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
