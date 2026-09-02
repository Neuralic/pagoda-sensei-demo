import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  assertItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from "@/lib/itinerary-access";
import {
  calendarDayDiff,
  shiftDayKeyedRecord,
  shiftTimestampByDays,
} from "@/lib/itinerary-job-day-move";
import {
  intakeDataForApi,
  parseIntakeData,
  type ItineraryIntakeData,
} from "@/lib/itinerary-intake";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseJsonObject<T extends Record<string, unknown>>(
  raw: unknown
): T | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as T;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Keep trip preferences / stays; clear client identity for the new trip. */
function intakeForDuplicatedItinerary(raw: unknown): ItineraryIntakeData | null {
  if (raw == null) return null;
  const intake = parseIntakeData(raw);
  return intakeDataForApi({
    ...intake,
    clientFullName: "",
    clientEmail: "",
  });
}

/**
 * POST /api/itineraries/[id]/duplicate
 * Copy an itinerary (and its guide jobs) for another client with new dates.
 * Does not copy bids, hires, or Transferz bookings.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { id: sourceId } = await context.params;
    if (!sourceId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      name?: string;
      startDate?: string;
      endDate?: string;
      location?: string;
    } | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
    const locationOverride =
      typeof body.location === "string" ? body.location.trim() : "";

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: "Name, start date, and end date are required" },
        { status: 400 }
      );
    }
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
      return NextResponse.json({ ok: false, error: "Invalid date format" }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { ok: false, error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyActivityUnlessAdmin(session.actor, supabase);
    if (activityBlock) return activityBlock;

    const access = await assertItineraryAccess(supabase, session.actor, sourceId, "write");
    if (!access.ok) return access.response;

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", access.ownerUserId)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
    if (!profile?.id) {
      return NextResponse.json(
        {
          ok: false,
          code: "PROFILE_REQUIRED",
          error: "Please complete your profile before creating an itinerary.",
        },
        { status: 400 }
      );
    }

    const { data: source, error: sourceErr } = await supabase
      .from("itineraries")
      .select(
        `id, user_id, profile_id, name, location, description, image, highlights,
         arrival_transfer, arrival_flight_number, arrival_flight_time,
         departure_transfer, departure_flight_number, departure_flight_time,
         trips_summary, arrival_location, arrival_heading, pdf_title, pdf_subtitle,
         build_mode, intake_data, start_date, end_date`
      )
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceErr) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const sourceStart = String(source.start_date || "").slice(0, 10);
    if (!ISO_DATE.test(sourceStart)) {
      return NextResponse.json(
        { ok: false, error: "Source itinerary has invalid start date" },
        { status: 400 }
      );
    }

    const dayDelta = calendarDayDiff(sourceStart, startDate);
    const tripsSummary = shiftDayKeyedRecord(
      parseJsonObject<Record<string, unknown>>(source.trips_summary),
      dayDelta
    );
    const arrivalLocation = shiftDayKeyedRecord(
      parseJsonObject<Record<string, unknown>>(source.arrival_location),
      dayDelta
    );
    const arrivalHeading = shiftDayKeyedRecord(
      parseJsonObject<Record<string, unknown>>(source.arrival_heading),
      dayDelta
    );

    const insertItinerary = {
      user_id: access.ownerUserId,
      profile_id: profile.id as string,
      name,
      location: locationOverride || source.location,
      start_date: startDate,
      end_date: endDate,
      image: source.image,
      description: source.description,
      status: "draft",
      highlights: source.highlights,
      arrival_transfer: source.arrival_transfer ?? false,
      arrival_flight_number: source.arrival_flight_number,
      arrival_flight_time: source.arrival_flight_time,
      departure_transfer: source.departure_transfer ?? false,
      departure_flight_number: source.departure_flight_number,
      departure_flight_time: source.departure_flight_time,
      trips_summary: tripsSummary,
      arrival_location: arrivalLocation,
      arrival_heading: arrivalHeading,
      pdf_title: source.pdf_title,
      pdf_subtitle: source.pdf_subtitle,
      build_mode: source.build_mode === "pagoda_build" ? "self" : source.build_mode,
      // Keep destinations / preferences; clear client name & email for the new trip
      intake_data: intakeForDuplicatedItinerary(source.intake_data),
    };

    const { data: created, error: createErr } = await supabase
      .from("itineraries")
      .insert(insertItinerary)
      .select("id, name, location, start_date, end_date, status, image, created_at")
      .single();

    if (createErr || !created?.id) {
      return NextResponse.json(
        { ok: false, error: createErr?.message || "Failed to create itinerary" },
        { status: 500 }
      );
    }

    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        `name, activity_type, start_time, end_time, location, description, images,
         languages, group_size, adults, children, infants, notes, advisor_comments,
         tour_id, tour_field_snapshot, min_price, max_price`
      )
      .eq("itinerary_id", sourceId);

    if (jobsErr) {
      return NextResponse.json(
        {
          ok: true,
          itinerary: created,
          warning: "Itinerary created but activities could not be copied",
        },
        { status: 200 }
      );
    }

    const jobRows = (jobs ?? [])
      .map((job) => {
        const startShifted = job.start_time
          ? shiftTimestampByDays(String(job.start_time), dayDelta)
          : null;
        const endShifted = job.end_time
          ? shiftTimestampByDays(String(job.end_time), dayDelta)
          : null;
        if (!startShifted || !endShifted) return null;

        const row: Record<string, unknown> = {
          itinerary_id: created.id,
          created_by: access.ownerUserId,
          name: job.name,
          activity_type: job.activity_type,
          start_time: startShifted,
          end_time: endShifted,
          location: job.location,
          description: job.description,
          images: job.images,
          languages: job.languages,
          group_size: job.group_size,
          adults: job.adults,
          children: job.children,
          infants: job.infants,
          notes: job.notes,
          advisor_comments: job.advisor_comments,
          min_price: job.min_price,
          max_price: job.max_price,
          job_available: true,
        };
        if (job.tour_id != null) row.tour_id = job.tour_id;
        if ((job as { tour_field_snapshot?: unknown }).tour_field_snapshot != null) {
          row.tour_field_snapshot = (job as { tour_field_snapshot?: unknown }).tour_field_snapshot;
        }
        return row;
      })
      .filter((r): r is Record<string, unknown> => r != null);

    let copiedJobs = 0;
    if (jobRows.length > 0) {
      const { error: insertJobsErr } = await supabase.from("jobs").insert(jobRows);
      if (insertJobsErr && insertJobsErr.message?.includes("tour_id")) {
        const withoutTourId = jobRows.map((r) => {
          const copy = { ...r };
          delete copy.tour_id;
          return copy;
        });
        const retry = await supabase.from("jobs").insert(withoutTourId);
        if (!retry.error) copiedJobs = withoutTourId.length;
      } else if (!insertJobsErr) {
        copiedJobs = jobRows.length;
      }
    }

    return NextResponse.json({
      ok: true,
      itinerary: created,
      copiedJobs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
