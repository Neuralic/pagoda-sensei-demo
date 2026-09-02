import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import {
  parseMarkupPct,
  parseMoney,
  resolveLineNetPrice,
} from "@/lib/advisor-markup";
import {
  advisorMarkupPctForLine,
  bookedGuideIdFromApplications,
  loadJobCommissionLookup,
  priceLineForCommission,
  type JobForCommission,
} from "@/lib/pagoda-pricing";
import {
  BOOKING_PROGRESS_LABEL,
  deriveBookingProgress,
} from "@/lib/booking-status";
import { BUCKETS } from "@/lib/buckets";
import {
  assertItineraryAccess,
  assertJobItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from "@/lib/itinerary-access";
import { shiftJobTimestampsToDate } from "@/lib/itinerary-job-day-move";
import { jobCalendarDateFromTimestamp } from "@/lib/itinerary-activity-timestamps";
import {
  errorItineraryDrag,
  logItineraryDrag,
  warnItineraryDrag,
} from "@/lib/booking-flow-log";
import { jobReferenceFromId } from "@/lib/job-reference";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  computeGuideTotalFromTour,
  isGroupSizeOverTourLimit,
  normalizeJobParticipants,
} from "@/lib/tour-price";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";
import {
  buildTourFieldSnapshot,
  tourLinkedFieldUpdatesForSave,
  withResolvedTourLinkedFields,
} from "@/lib/tour-linked-line-fields";
import { isMissingColumnError } from "@/lib/api-response";
import { bookingLog } from "@/lib/ops-log";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseNotesSource(notes: unknown): string | null {
  if (typeof notes !== "string") return null;
  const raw = notes.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const s = (j as Record<string, unknown>).source;
      if (typeof s === "string" && s.trim()) return s.trim();
    }
  } catch {
    // ignore invalid JSON notes
  }
  return null;
}

function isTransferzHiddenFromGuides(job: { notes?: unknown } | null | undefined): boolean {
  return parseNotesSource(job?.notes) === "transferz";
}

/** Parse tour.image (array, JSON string, or single path) into storage object paths. */
function parseTourImageStoragePaths(raw: unknown): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    // Nested JSON string (e.g. array element that is still stringified JSON)
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          parsed.forEach(add);
          return;
        }
        if (typeof parsed === "string") {
          add(parsed);
          return;
        }
      } catch {
        // fall through
      }
    }
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/")
    ) {
      return;
    }
    const p = trimmed
      .replace(/^\/+/, "")
      .replace(/^tours\//, "")
      .replace(/^jobs\//, "");
    if (p) out.push(p);
  };
  if (!raw) return [];
  if (Array.isArray(raw)) {
    raw.forEach(add);
    return [...new Set(out)];
  }
  if (typeof raw === "string") {
    add(raw);
  }
  return [...new Set(out)];
}

// Helper: combine date ISO + time (HH:MM) into an ISO timestamp string
function toTimestamp(
  dateISO?: string | null,
  timeHHMM?: string | null
): string | null {
  // Validate time input
  if (!timeHHMM || typeof timeHHMM !== "string") return null;

  const trimmed = timeHHMM.trim();
  // Accept HH:MM or HH:MM:SS (browsers sometimes include seconds on <input type="time">)
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const now = new Date();

  // Always create base date in UTC
  let base: Date;
  if (dateISO && typeof dateISO === "string" && dateISO.trim()) {
    try {
      base = new Date(dateISO.trim() + "T00:00:00Z");
      if (isNaN(base.getTime())) {
        // Invalid date, use today
        base = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        );
      }
    } catch {
      base = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
    }
  } else {
    base = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  // Validate hours and minutes are valid
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  // Set time in UTC (NOT local)
  base.setUTCHours(hours, minutes, 0, 0);

  return base.toISOString();
}

export async function POST(req: Request) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const body = (await req.json().catch(() => ({}))) as {
      which?: string;
      itineraryId?: string;
      activityDateISO?: string | null;
      name?: string;
      activityType?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      description?: string | null;
      imagePaths?: string[];
      minPrice?: number | null;
      maxPrice?: number | null;
      supplierPrice?: number | null;
      clientPrice?: number | null;
      languages?: string | null;
      groupSize?: number | null;
      adults?: number | null;
      children?: number | null;
      infants?: number | null;
      notes?: string | null;
      advisorComments?: string | null;
      createJob?: boolean;
      tourId?: string | null;
      guideId?: string | null;
    };

    console.log("body", body);
    const itineraryId =
      typeof body.itineraryId === "string" ? body.itineraryId : "";
    if (!itineraryId)
      return NextResponse.json(
        { ok: false, error: "Missing itineraryId" },
        { status: 400 }
      );

    const supabase = getSupabaseServer();
    const activityPost = await denyActivityUnlessAdmin(session.actor, supabase);
    if (activityPost) return activityPost;

    const access = await assertItineraryAccess(
      supabase,
      session.actor,
      itineraryId,
      "write"
    );
    if (!access.ok) return access.response;

    const actingUserId = access.ownerUserId;

    if (body.createJob === false) {
      // Not creating a job; you might still want to persist the activity somewhere else later
      return NextResponse.json({ ok: true, skipped: true });
    }

    const name = (body.name || "").trim();
    const activityType = (body.activityType || "").trim();
    const location = (body.location || "").trim();
    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const images = Array.isArray(body.imagePaths)
      ? body.imagePaths.filter((p) => typeof p === "string")
      : [];

    if (!name || !activityType || !location) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const startTs = toTimestamp(
      body.activityDateISO || null,
      body.startTime || null
    );
    const endTs = toTimestamp(
      body.activityDateISO || null,
      body.endTime || null
    );
    if (!startTs || !endTs) {
      return NextResponse.json(
        { ok: false, error: "Invalid start or end time" },
        { status: 400 }
      );
    }

    // Convert tourId to string if provided (handles both number and string IDs)
    const tourId = body.tourId 
      ? (typeof body.tourId === 'number' ? String(body.tourId) : String(body.tourId).trim() || null)
      : null;
    
    console.log(`[Job Creation] tourId from body: ${body.tourId}, processed tourId: ${tourId}`);

    const insert: Record<string, unknown> = {
      itinerary_id: itineraryId,
      created_by: actingUserId,
      name,
      activity_type: canonicalizeActivityTypeLabel(activityType) || activityType,
      start_time: startTs,
      end_time: endTs,
      location,
      description,
      images,
      min_price: body.minPrice ?? null,
      max_price: body.maxPrice ?? null,
      supplier_price: parseMoney(body.supplierPrice),
      client_price: parseMoney(body.clientPrice),
      languages: body.languages ?? null,
      group_size:
        body.groupSize ??
        (typeof body.adults === "number" || typeof body.children === "number" || typeof body.infants === "number"
          ? (Number(body.adults) || 0) + (Number(body.children) || 0) + (Number(body.infants) || 0)
          : null),
      adults: body.adults ?? null,
      children: body.children ?? null,
      infants: body.infants ?? null,
      notes: body.notes ?? null,
      advisor_comments:
        typeof body.advisorComments === "string" ? body.advisorComments.trim() || null : null,
      // released_at will be set when itinerary is published, not at creation time
    };

    // Only include tour_id if provided (column may not exist in all database schemas)
    if (tourId) {
      insert.tour_id = tourId;
      // Record what we copied, so a later edit to this line can be told apart from the tour's
      // own wording and the untouched fields can keep following the catalogue.
      insert.tour_field_snapshot = buildTourFieldSnapshot({ name, description });
    }

    if (tourId) {
      const { data: tourForLimit } = await supabase
        .from("tour")
        .select("pricing_model, max_group_size")
        .eq("id", tourId)
        .maybeSingle();
      if (tourForLimit) {
        const participants = normalizeJobParticipants({
          adults: body.adults,
          children: body.children,
          infants: body.infants,
          group_size: body.groupSize ?? null,
        });
        if (
          isGroupSizeOverTourLimit(
            {
              pricing_model: (tourForLimit as { pricing_model?: string | null }).pricing_model,
              max_group_size: (tourForLimit as { max_group_size?: number | null }).max_group_size,
            },
            participants
          )
        ) {
          const max = (tourForLimit as { max_group_size?: number | null }).max_group_size;
          return NextResponse.json(
            {
              ok: false,
              error: `Participant count exceeds this tour's maximum (${max} people).`,
            },
            { status: 400 }
          );
        }
      }
    }

    let imagesFromBody = Array.isArray(body.imagePaths)
      ? body.imagePaths.filter((p) => typeof p === "string")
      : [];
    imagesFromBody = parseTourImageStoragePaths(imagesFromBody);

    // Tour library → itinerary: always prefer images from the tour row (source of truth)
    if (tourId) {
      const { data: tourImages } = await supabase
        .from("tour")
        .select("image")
        .eq("id", tourId)
        .maybeSingle();
      const fromTour = parseTourImageStoragePaths(
        (tourImages as { image?: unknown } | null)?.image
      );
      if (fromTour.length > 0) {
        imagesFromBody = fromTour;
      }
    }

    // Keep original tour storage paths. Copying each file into the jobs bucket
    // (download + re-upload) made “add from library” very slow. Itinerary/PDF
    // signing already falls back to the tours bucket.
    insert.images = imagesFromBody;
    
    // Try to insert with tour_id, but if column doesn't exist, retry without it
    let { data, error } = await supabase
      .from("jobs")
      .insert(insert)
      .select("id")
      .single();
    
    // If the error is about a tour column this database does not have, retry without it. Both
    // are optional: without tour_id the line is simply not linked, and without the snapshot it
    // keeps the copied text instead of following the tour — today's behaviour either way.
    if (
      error &&
      (isMissingColumnError(error, "tour_id") ||
        isMissingColumnError(error, "tour_field_snapshot"))
    ) {
      bookingLog.warn("job.create.tour_columns_missing", {
        itineraryId,
        detail: "Run 20260831_jobs_tour_field_snapshot.sql so tour edits reach itineraries.",
      });
      const insertWithoutTourCols = { ...insert };
      delete insertWithoutTourCols.tour_field_snapshot;
      if (isMissingColumnError(error, "tour_id")) delete insertWithoutTourCols.tour_id;

      const retryResult = await supabase
        .from("jobs")
        .insert(insertWithoutTourCols)
        .select("id")
        .single();

      data = retryResult.data;
      error = retryResult.error;
    }
    
    if (error) {
      console.error("Job insert error:", error);
      return NextResponse.json(
        { ok: false, error: error.message || "Insert failed" },
        { status: 500 }
      );
    }

    const jobId = data?.id;
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "Job created but ID not returned" },
        { status: 500 }
      );
    }

    try {
      await supabase
        .from("jobs")
        .update({ reference_code: jobReferenceFromId(jobId) })
        .eq("id", jobId);
    } catch {
      // reference_code column may not exist until migration is applied
    }

    // Tour Library job on an already-published itinerary: start 24h exclusive window immediately
    if (tourId) {
      try {
        const { data: itin } = await supabase
          .from("itineraries")
          .select("status")
          .eq("id", itineraryId)
          .maybeSingle();
        if (itin && (itin as { status?: string }).status === "published") {
          const nowIso = new Date().toISOString();
          await supabase.from("jobs").update({ released_at: nowIso }).eq("id", jobId);
        }
      } catch (e) {
        console.warn("[Job Creation] Could not set released_at for published itinerary:", e);
      }
    }

    // For tour library jobs: create candidate application for linked guide (or tour owner)
    if (tourId) {
      try {
        console.log(`[Tour Library Job] Creating job application for tour guide. tourId: ${tourId}, jobId: ${jobId}`);
        
        // Get tour owner and full pricing (per_person and group_rate)
        const { data: tour, error: tourError } = await supabase
          .from("tour")
          .select(
            "user_id, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate"
          )
          .eq("id", tourId)
          .single();

        if (tourError) {
          console.error("[Tour Library Job] Error fetching tour:", tourError);
        } else if (!tour || !tour.user_id) {
          console.error("[Tour Library Job] Tour not found or missing user_id. tour:", tour);
        } else {
          // Prefer first assigned guide with a published profile; fall back to tour owner
          let guideUserId = tour.user_id as string;
          try {
            const { data: assignments } = await supabase
              .from("guide_tour_assignments")
              .select("guide_id")
              .eq("tour_id", tourId)
              .order("created_at", { ascending: true })
              .limit(5);
            const assignedIds = (assignments || [])
              .map((a) => (a as { guide_id?: string }).guide_id)
              .filter((id): id is string => Boolean(id));
            if (assignedIds.length > 0) {
              guideUserId = assignedIds[0];
            }
          } catch (assignErr) {
            console.warn("[Tour Library Job] Could not load guide assignments:", assignErr);
          }

          console.log(`[Tour Library Job] Guide ID: ${guideUserId}, Agent ID: ${actingUserId}`);
          
          // Always create application for linked guide / tour owner
          const { data: tourOwner, error: tourOwnerError } = await supabase
            .from("users")
            .select("id, first_name, last_name, email")
            .eq("id", guideUserId)
            .single();

          if (tourOwnerError) {
            console.error("[Tour Library Job] Error fetching tour guide:", tourOwnerError);
          } else if (!tourOwner) {
            console.error("[Tour Library Job] Guide not found in users table. guideUserId:", guideUserId);
          } else {
            // Fetch guide profile for applicant_profile_id for proper profile join
            const { data: tourOwnerProfile, error: profileError } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", guideUserId)
              .maybeSingle();

            if (profileError) {
              console.error("[Tour Library Job] Error fetching guide profile:", profileError);
            }

            // Check if application already exists to avoid duplicates
            const { data: existingApp, error: checkError } = await supabase
              .from("job_applications")
              .select("id")
              .eq("job_id", jobId)
              .eq("applicant_id", guideUserId)
              .maybeSingle();

            if (checkError) {
              console.error("[Tour Library Job] Error checking existing application:", checkError);
            } else if (existingApp) {
              console.log(`[Tour Library Job] Application already exists for guide. applicationId: ${existingApp.id}`);
            } else {
              // Create candidate application for linked guide
              // Set as finalist by default so they show in PDF
              const languagesValue = body.languages 
                ? (typeof body.languages === 'string' ? JSON.parse(body.languages) : body.languages) 
                : null;
              
              // Get job details to populate application fields
              const { data: createdJob, error: jobFetchError } = await supabase
                .from("jobs")
                .select("location, start_time, end_time, group_size, name")
                .eq("id", jobId)
                .single();

              // Calculate duration from start_time and end_time
              let duration: string | null = null;
              if (createdJob?.start_time && createdJob?.end_time) {
                try {
                  const start = new Date(createdJob.start_time);
                  const end = new Date(createdJob.end_time);
                  const durMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
                  duration = durMin >= 60
                    ? `${(durMin / 60).toFixed(1)} Hours`
                    : `${durMin} Min`;
                } catch (e) {
                  console.error("[Tour Library Job] Error calculating duration:", e);
                }
              }

              // Format date from start_time
              let date: string | null = null;
              if (createdJob?.start_time) {
                try {
                  const startDate = new Date(createdJob.start_time);
                  date = new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(startDate);
                } catch (e) {
                  console.error("[Tour Library Job] Error formatting date:", e);
                }
              }

              // Guide total: same as hire / bids — per_person or group_rate from tour × job participants
              const participants = normalizeJobParticipants({
                adults: insert.adults as number | null | undefined,
                children: insert.children as number | null | undefined,
                infants: insert.infants as number | null | undefined,
                group_size: insert.group_size as number | null | undefined,
              });
              const pricingResult = computeGuideTotalFromTour(
                {
                  pricing_model: (tour as { pricing_model?: string | null }).pricing_model,
                  price_per_adult: (tour as { price_per_adult?: number | null }).price_per_adult,
                  price_per_child: (tour as { price_per_child?: number | null }).price_per_child,
                  price_per_infant: (tour as { price_per_infant?: number | null }).price_per_infant,
                  base_rate: (tour as { base_rate?: number | null }).base_rate,
                  base_group_size: (tour as { base_group_size?: number | null }).base_group_size,
                  max_group_size: (tour as { max_group_size?: number | null }).max_group_size,
                  additional_per_person_rate: (tour as { additional_per_person_rate?: number | null })
                    .additional_per_person_rate,
                },
                participants
              );
              const tourGuidePrice =
                pricingResult != null &&
                Number.isFinite(pricingResult.guideTotal) &&
                pricingResult.guideTotal > 0
                  ? Math.round(pricingResult.guideTotal)
                  : null;

              const isPerPersonModel =
                (tour as { pricing_model?: string | null }).pricing_model !== "group_rate";
              const pa = (tour as { price_per_adult?: number | null }).price_per_adult;
              const pc = (tour as { price_per_child?: number | null }).price_per_child;
              const pi = (tour as { price_per_infant?: number | null }).price_per_infant;

              const insertData: Record<string, unknown> = {
                job_id: jobId,
                applicant_id: guideUserId,
                applicant_profile_id: tourOwnerProfile?.id || null,
                job_title: name, // Required field - use the job name
                location: createdJob?.location || insert.location || null,
                duration: duration || null,
                group_size: createdJob?.group_size || insert.group_size || null,
                date: date || null,
                first_name: tourOwner.first_name || "",
                last_name: tourOwner.last_name || "",
                email: tourOwner.email || null,
                phone: null, // Not available from users table
                country: null, // Not available from users table
                city: null, // Not available from users table
                availability_confirmed: false,
                availability_notes: null,
                why: `Linked guide for tour "${name}"`,
                languages: languagesValue,
                certification: null,
                file_paths: null,
                offer_status: "pending", // Use valid status value
                is_candidate: true, // Flag to mark as candidate
                is_finalist: true, // Set as finalist by default so guide shows in PDF
                submitted_at: new Date().toISOString(),
                ...(tourGuidePrice != null && { guide_price: tourGuidePrice }),
                ...(isPerPersonModel &&
                  pa != null &&
                  pc != null &&
                  pi != null && {
                    price_per_adult: Number(pa),
                    price_per_child: Number(pc),
                    price_per_infant: Number(pi),
                  }),
              };

              const { data: newApp, error: appError } = await supabase
                .from("job_applications")
                .insert(insertData)
                .select("id")
                .single();

              if (appError) {
                console.error("[Tour Library Job] Error creating candidate application:", appError);
                console.error("[Tour Library Job] Application data attempted:", {
                  job_id: jobId,
                  applicant_id: guideUserId,
                  first_name: tourOwner.first_name || "",
                  last_name: tourOwner.last_name || "",
                  applicant_profile_id: tourOwnerProfile?.id || null,
                });
              } else {
                console.log(`[Tour Library Job] Successfully created application for guide. applicationId: ${newApp?.id}`);
              }
            }
          }
        }
      } catch (candidateError) {
        console.error("[Tour Library Job] Exception in candidate setup:", candidateError);
        // Don't fail the request if candidate setup fails
      }
    } else {
      console.log("[Tour Library Job] No tourId provided, skipping tour owner application creation");
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const jobId = searchParams.get("jobId") || "";
    const itineraryId = searchParams.get("itineraryId") || "";
    const createdBy = searchParams.get("createdBy") || "";
    const appliedBy = searchParams.get("appliedBy") || "";

    const supabase = getSupabaseServer();
    const jar = await cookies();
    const role = jar.get("role")?.value;
    const userIdForApproval = jar.get("userId")?.value;
    if (userIdForApproval && (role === "agent" || role === "guide")) {
      const activityGet = await denyIfActivityNotApproved(userIdForApproval, supabase);
      if (activityGet) return activityGet;
    }

    /* -----------------------------------------------------
       1️⃣ FETCH SINGLE JOB + APPLICATION STATUS
    ----------------------------------------------------- */
    if (jobId) {
      const userId = jar.get("userId")?.value || null;

      const { data: job, error } = await supabase
        .from("jobs")
        .select("*, released_at, tour_field_snapshot, tour:tour_id(id, user_id, name, description)")
        .eq("id", jobId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      if (!job) {
        return NextResponse.json(
          { ok: false, error: "Job not found" },
          { status: 404 }
        );
      }

      // Hide Transferz-booked itinerary items from guides entirely.
      if (role === "guide" && isTransferzHiddenFromGuides(job as { notes?: unknown })) {
        return NextResponse.json(
          { ok: false, error: "Job not found" },
          { status: 404 }
        );
      }

      // Check 24-hour window for Tour Library jobs if user is a guide
      if (role === 'guide' && job.tour_id) {
        const tourOwnerId = (job.tour as any)?.user_id
        
        // If job hasn't been released yet, only tour owner can view it
        if (!job.released_at) {
          if (userId !== tourOwnerId) {
            return NextResponse.json(
              { ok: false, error: "This job is not yet available for viewing. It will be open when the itinerary is published." },
              { status: 403 }
            );
          }
        } else {
          // If job has been released, check 24-hour window
          const releasedAt = new Date(job.released_at);
          const now = new Date();
          const hoursSinceRelease = (now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60);
          
          // If within 24 hours, only tour owner can view it
          if (hoursSinceRelease < 24) {
            if (userId !== tourOwnerId) {
              return NextResponse.json(
                { ok: false, error: "This job is exclusively available to the tour owner for the first 24 hours after publication." },
                { status: 403 }
              );
            }
          }
        }
      }

      let application_status: string | null = null;

      if (userId) {
        const { data: app } = await supabase
          .from("job_applications")
          .select("offer_status")
          .eq("job_id", jobId)
          .eq("applicant_id", userId)
          .maybeSingle();

        application_status = app?.offer_status ?? null;
      }

      return NextResponse.json({
        ok: true,
        job: withResolvedTourLinkedFields({
          ...job,
          application_status,
        }),
      });
    }

    /* -----------------------------------------------------
       2️⃣ JOBS CREATED BY CURRENT USER
    ----------------------------------------------------- */
    if (createdBy === "me") {
      const userId = jar.get("userId")?.value;

      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "Not authenticated" },
          { status: 401 }
        );
      }

      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("created_by", userId)
        .order("start_time", { ascending: true });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, jobs: jobs ?? [] });
    }

    /* -----------------------------------------------------
       3️⃣ JOBS APPLIED BY CURRENT USER (WITH STATUS + AGENT INFO)
    ----------------------------------------------------- */
    if (appliedBy === "me") {
      const userId = jar.get("userId")?.value;

      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "Not authenticated" },
          { status: 401 }
        );
      }

      const { data: applications, error: appsErr } = await supabase
        .from("job_applications")
        .select("job_id, offer_status")
        .eq("applicant_id", userId);

      if (appsErr) {
        return NextResponse.json(
          { ok: false, error: appsErr.message },
          { status: 500 }
        );
      }

      const jobIds = applications?.map((a) => a.job_id) ?? [];

      if (jobIds.length === 0) {
        return NextResponse.json({ ok: true, jobs: [] });
      }

      const statusMap: Record<string, string> = {};
      applications?.forEach((app) => {
        statusMap[app.job_id] = app.offer_status;
      });

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select("*, tour:tour_id(id, user_id)")
        .in("id", jobIds)
        .order("start_time", { ascending: true });

      if (jobsErr) {
        return NextResponse.json(
          { ok: false, error: jobsErr.message },
          { status: 500 }
        );
      }

      // Get creator (agent) details for all jobs
      const creatorIds = [...new Set((jobs || []).map((job) => job.created_by).filter((id): id is string => typeof id === 'string'))];

      let creators: Array<Record<string, unknown>> = [];
      let creatorProfiles: Array<Record<string, unknown>> = [];

      if (creatorIds.length > 0) {
        // Get user details
        const { data: uData, error: usersErr } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', creatorIds);

        if (usersErr) {
          return NextResponse.json(
            { ok: false, error: 'Database error', detail: usersErr.message },
            { status: 500 }
          );
        }
        creators = uData || [];

        // Get profile pictures
        const { data: pData, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, user_id, profile_picture_path')
          .in('user_id', creatorIds);

        if (profilesErr) {
          return NextResponse.json(
            { ok: false, error: 'Database error', detail: profilesErr.message },
            { status: 500 }
          );
        }
        creatorProfiles = pData || [];
      }

      // Create lookup maps
      const creatorsById: Record<string, Record<string, unknown>> = {};
      for (const u of creators) {
        const id = (u as Record<string, unknown>)?.id;
        if (typeof id === 'string') creatorsById[id] = u;
      }

      const profileByUserId: Record<string, Record<string, unknown>> = {};
      for (const p of creatorProfiles) {
        const uid = (p as Record<string, unknown>)?.user_id;
        if (typeof uid === 'string') profileByUserId[uid] = p;
      }

      // Collect all avatar paths and sign them in parallel
      const avatarPaths: string[] = [];
      const pathToCreatorId: Record<string, string> = {};
      
      for (const job of jobs || []) {
        const creatorId = job.created_by;
        if (!creatorId) continue;
        const profile = creatorId ? profileByUserId[creatorId] || null : null;
        const path = profile?.profile_picture_path;
        if (typeof path === 'string' && path && !path.startsWith('http')) {
          avatarPaths.push(path);
          pathToCreatorId[path] = creatorId;
        }
      }

      // Sign all avatar URLs in parallel
      const avatarUrlMap: Record<string, string | null> = {};
      if (avatarPaths.length > 0) {
        const uniquePaths = Array.from(new Set(avatarPaths));
        await Promise.all(
          uniquePaths.map(async (path) => {
            try {
              const { data: signedUrl } = await supabase.storage
                .from(BUCKETS.avatars)
                .createSignedUrl(path, 60 * 60 * 24 * 7);
              avatarUrlMap[path] = signedUrl?.signedUrl || null;
            } catch {
              avatarUrlMap[path] = null;
            }
          })
        );
      }

      // Enrich jobs with application status and agent details
      const enrichedJobs = (jobs || []).map((job) => {
        const creatorId = job.created_by;
        const user = creatorId ? creatorsById[creatorId] || null : null;
        const profile = creatorId ? profileByUserId[creatorId] || null : null;

        // Build agent name
        const agencyName = user
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Agency'
          : 'Agency';

        // Get avatar URL from map
        const path = profile?.profile_picture_path;
        const avatarUrl = (typeof path === 'string' && path) 
          ? (avatarUrlMap[path] || null)
          : null;

        return {
          ...job,
          application_status: statusMap[job.id] ?? null,
          agent: {
            id: creatorId,
            name: agencyName,
            user: user ? {
              id: user.id,
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
            } : null,
            profile: profile ? {
              id: profile.id,
              userId: profile.user_id,
              avatarPath: profile.profile_picture_path,
              avatarUrl: avatarUrl,
            } : null,
          },
        };
      });

      return NextResponse.json({ ok: true, jobs: enrichedJobs ?? [] });
    }

    /* -----------------------------------------------------
       4️⃣ JOBS BY ITINERARY (OPTIONAL STATUS)
    ----------------------------------------------------- */
    if (!itineraryId) {
      return NextResponse.json(
        { ok: false, error: "Missing itineraryId" },
        { status: 400 }
      );
    }

    const userId = jar.get("userId")?.value || null;

    // Try to fetch jobs with profile join + advisor price columns; fallback if columns/join missing
    let jobsPromise = supabase
      .from("jobs")
      .select(`id, name, activity_type, start_time, end_time, location, description, images, min_price, max_price, supplier_price, client_price, line_markup_pct, languages, group_size, notes, advisor_comments, is_active, job_available, created_at, updated_at, created_by, itinerary_id, tour_id, tour_field_snapshot, released_at, adults, children, infants, reference_code, job_applications(*, profiles(profile_picture_path, bio, intro_video_path, profile_slug)), tour:tour_id(id, user_id, name, description, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate)`)
      .eq("itinerary_id", itineraryId)
      .order("start_time", { ascending: true });

    const jobsResult = await jobsPromise;
    let { data: jobs, error } = jobsResult;

    // If the query with profile join fails, try without it
    if (error && error.message && (error.message.includes('profiles') || error.message.includes('relation') || error.message.includes('supplier_price') || error.message.includes('client_price') || error.message.includes('line_markup_pct') || error.message.includes('column'))) {
      // The retry also drops tour_field_snapshot, so a database that has not run
      // 20260831_jobs_tour_field_snapshot.sql still loads the itinerary — the lines just keep
      // their copied text instead of following the tour, exactly as before that migration.
      bookingLog.warn("jobs.select_degraded", {
        itineraryId,
        dbCode: error.code ?? null,
      });
      const fallbackPromise = supabase
        .from("jobs")
        .select(`id, name, activity_type, start_time, end_time, location, description, images, min_price, max_price, languages, group_size, notes, advisor_comments, is_active, job_available, created_at, updated_at, created_by, itinerary_id, tour_id, released_at, adults, children, infants, reference_code, job_applications(*), tour:tour_id(id, user_id, name, description, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate)`)
        .eq("itinerary_id", itineraryId)
        .order("start_time", { ascending: true });
      
      const fallbackResult = await fallbackPromise;
      if (!fallbackResult.error) {
        jobs = fallbackResult.data as typeof jobs;
        error = null;
      } else {
        error = fallbackResult.error;
      }
    }

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // For PDF generation, we want to show candidates, so we need to include them
    // The PDF will filter to show only candidates or hired guides

    // Filter out closed jobs
    let openJobs = jobs || [];

    // Hide Transferz-booked itinerary items from guides.
    if (role === "guide") {
      openJobs = openJobs.filter((job: any) => !isTransferzHiddenFromGuides(job));
    }

    // For guide: show all jobs (including 24h-window for non-owners). Add bid_available_at when non-owner and within 24h so UI can disable bid + show timer. Hide unreleased tour jobs from non-owners.
    const HOURS_EXCLUSIVE = 24
    if (role === 'guide' && userId) {
      const now = new Date()
      openJobs = openJobs
        .filter((job: any) => {
          if (!job.tour_id) return true
          const tourOwnerId = (job.tour as any)?.user_id
          if (userId === tourOwnerId) return true
          return !!job.released_at
        })
        .map((job: any) => {
          let bid_available_at: string | null = null
          if (job.tour_id) {
            const tourOwnerId = (job.tour as any)?.user_id
            const isTourOwner = userId === tourOwnerId
            if (!isTourOwner && job.released_at) {
              try {
                const releasedAt = new Date(job.released_at)
                if (!isNaN(releasedAt.getTime())) {
                  const hoursSinceRelease = (now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60)
                  if (hoursSinceRelease < HOURS_EXCLUSIVE) {
                    const availableAt = new Date(releasedAt.getTime() + HOURS_EXCLUSIVE * 60 * 60 * 1000)
                    bid_available_at = availableAt.toISOString()
                  }
                }
              } catch {
                // keep bid_available_at null
              }
            }
          }
          return { ...job, bid_available_at }
        })
    }

    if (!openJobs || openJobs.length === 0) {
      return NextResponse.json({ ok: true, jobs: [] });
    }

    // For agent/agency/admin: Pagoda price to advisor = guide/net + 20% (then advisor markup on top)
    const jobGuideNetMap: Record<string, number> = {};
    /** Costs the guide pays on the client's behalf — carried at face value, no commission. */
    const jobPassThroughMap: Record<string, number> = {};
    if (role === "agent" || role === "agency" || role === "admin") {
      const hiredByJob: Record<string, { guidePrice: number; applicantId: string }> = {};
      for (const job of openJobs) {
        const apps = Array.isArray((job as any).job_applications)
          ? (job as any).job_applications
          : [];
        const isHired = (app: any) =>
          app?.offer_status === "completed" || app?.offer_status === "hired" || app?.offer_status === "accepted";
        const isFinalist = (app: any) => app?.is_finalist === true;
        const isOffered = (app: any) => app?.offer_status === "offered";
        const isCandidate = (app: any) =>
          app?.offer_status === "candidate" || app?.is_candidate === true;
        const hasAnyFinalist = apps.some((a: any) => isFinalist(a));
        const chosen =
          apps.find((app: any) => app?.price_confirmation_status === "confirmed" && app?.guide_price != null) ??
          apps.find((app: any) => isHired(app) && app?.guide_price != null) ??
          apps.find((app: any) => isFinalist(app) && app?.guide_price != null) ??
          apps.find((app: any) => isOffered(app) && app?.guide_price != null) ??
          (!hasAnyFinalist ? apps.find((app: any) => isCandidate(app) && app?.guide_price != null) : undefined);
        if (chosen?.pass_through_cost != null) {
          const carried = Number(chosen.pass_through_cost);
          if (Number.isFinite(carried) && carried > 0) {
            jobPassThroughMap[job.id] = carried;
          }
        }
        if (chosen?.guide_price != null && chosen?.applicant_id) {
          const guidePrice =
            typeof chosen.guide_price === "number"
              ? chosen.guide_price
              : Number(chosen.guide_price);
          if (Number.isFinite(guidePrice)) {
            hiredByJob[job.id] = {
              guidePrice,
              applicantId: String(chosen.applicant_id),
            };
          }
        }
        if (hiredByJob[job.id]) continue;
        const tour = (job as any).tour;
        if (tour?.user_id) {
          const participants = normalizeJobParticipants({
            adults: (job as any).adults,
            children: (job as any).children,
            infants: (job as any).infants,
            group_size: (job as any).group_size,
          });
          const result = computeGuideTotalFromTour(
            {
              pricing_model: tour.pricing_model,
              price_per_adult: tour.price_per_adult,
              price_per_child: tour.price_per_child,
              price_per_infant: tour.price_per_infant,
              base_rate: tour.base_rate,
              base_group_size: tour.base_group_size,
              max_group_size: tour.max_group_size,
              additional_per_person_rate: tour.additional_per_person_rate,
            },
            participants
          );
          if (result != null && Number.isFinite(result.guideTotal) && result.guideTotal >= 0) {
            hiredByJob[job.id] = {
              guidePrice: result.guideTotal,
              applicantId: String(tour.user_id),
            };
          }
        }
      }
      for (const [jobId, { guidePrice }] of Object.entries(hiredByJob)) {
        jobGuideNetMap[jobId] = guidePrice;
      }
    }

    // Advisor markup: itinerary override → account default → 0
    let itineraryMarkupPct: number | null = null;
    let accountDefaultMarkupPct: number | null = null;
    {
      const { data: itinRow, error: itinErr } = await supabase
        .from("itineraries")
        .select("markup_pct, user_id")
        .eq("id", itineraryId)
        .maybeSingle();
      if (!itinErr && itinRow) {
        const m = (itinRow as { markup_pct?: number | null }).markup_pct;
        itineraryMarkupPct =
          m != null && Number.isFinite(Number(m)) ? Number(m) : null;
        const ownerId = (itinRow as { user_id?: string | null }).user_id;
        if (ownerId) {
          const { data: owner, error: ownerErr } = await supabase
            .from("users")
            .select("default_markup_pct")
            .eq("id", ownerId)
            .maybeSingle();
          if (!ownerErr && owner) {
            const d = (owner as { default_markup_pct?: number | null })
              .default_markup_pct;
            accountDefaultMarkupPct =
              d != null && Number.isFinite(Number(d)) ? Number(d) : null;
          }
        }
      }
    }

    // Commission percentages are per guide and admin-editable, so prices must be derived from
    // them on every read — a hardcoded markup here is what let a commission change move the
    // Tour Library price and leave the itinerary line (and the invoice) behind.
    // Two queries for the whole set, resolved before the synchronous price loop below, and
    // skipped for guides — they never see advisor-facing prices.
    const viewerSeesPrices = role === "agent" || role === "agency" || role === "admin";
    type JobRowForPricing = {
      id: string;
      tour_id?: string | null;
      tour?: { user_id?: string | null } | null;
      job_applications?: unknown;
    };
    const commissionLookup = viewerSeesPrices
      ? await loadJobCommissionLookup(
          supabase,
          ((openJobs || []) as JobRowForPricing[]).map((job) => ({
            id: String(job.id),
            tour_id: job.tour_id ?? null,
            guide_id: bookedGuideIdFromApplications(job.job_applications),
            tour: job.tour ?? null,
          }))
        )
      : null;

    const statusMap: Record<string, string> = {};

    if (userId) {
      const { data: apps } = await supabase
        .from("job_applications")
        .select("job_id, offer_status")
        .eq("applicant_id", userId);

      apps?.forEach((app) => {
        statusMap[app.job_id] = app.offer_status;
      });
    }

    // Note: We no longer fetch tour owner profiles for synthetic applications
    // Tour owners are only shown if they have actual applications in the database

    // Fetch profiles for applications that don't have profile data joined
    const applicantIds = new Set<string>();
    const nameLookupIds = new Set<string>();
    try {
      openJobs.forEach((job: any) => {
        const tourOwnerId = job?.tour?.user_id;
        if (typeof tourOwnerId === "string" && tourOwnerId) {
          nameLookupIds.add(tourOwnerId);
        }
        if (job && job.job_applications) {
          const apps = Array.isArray(job.job_applications)
            ? job.job_applications
            : job.job_applications && typeof job.job_applications === "object"
              ? [job.job_applications]
              : [];
          apps.forEach((app: any) => {
            if (app && typeof app === "object") {
              const hasProfile =
                app.profiles &&
                typeof app.profiles === "object" &&
                (app.profiles.profile_picture_path ||
                  app.profiles.bio ||
                  app.profiles.intro_video_path);
              if (!hasProfile && app.applicant_id && typeof app.applicant_id === "string") {
                applicantIds.add(app.applicant_id);
              }
              const hasName =
                String(app.guide_display_name || "").trim() ||
                String(app.first_name || "").trim() ||
                String(app.last_name || "").trim();
              if (!hasName && app.applicant_id && typeof app.applicant_id === "string") {
                nameLookupIds.add(app.applicant_id);
              }
            }
          });
        }
      });
    } catch (collectError) {
      console.error("[Jobs API] Error collecting applicant IDs:", collectError);
      // Continue even if collection fails
    }

    // Fetch missing profiles
    const profileMap: Record<string, any> = {};
    if (applicantIds.size > 0) {
      try {
        const applicantIdsArray = Array.from(applicantIds);
        if (applicantIdsArray.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, user_id, profile_picture_path, bio, intro_video_path")
            .in("user_id", applicantIdsArray);
          
          if (profileError) {
            console.error("[Jobs API] Error fetching profiles:", profileError);
          } else if (profiles) {
            profiles.forEach((profile: any) => {
              if (profile.user_id) {
                profileMap[profile.user_id] = profile;
              }
            });
          }
        }
      } catch (profileFetchError) {
        console.error("[Jobs API] Exception fetching profiles:", profileFetchError);
        // Don't fail the request if profile fetch fails
      }
    }

    // Fill blank application names from users (tour owner / hired guide)
    const userNameMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
    if (nameLookupIds.size > 0) {
      try {
        const { data: nameUsers } = await supabase
          .from("users")
          .select("id, first_name, last_name")
          .in("id", Array.from(nameLookupIds));
        for (const u of nameUsers ?? []) {
          userNameMap[String(u.id)] = {
            first_name: (u.first_name as string | null) ?? null,
            last_name: (u.last_name as string | null) ?? null,
          };
        }
      } catch (nameErr) {
        console.error("[Jobs API] Error fetching guide names:", nameErr);
      }
    }

    const jobsWithStatus = openJobs.map((job: any) => {
      // Extract guide_id from tour if it exists
      const guideId = job.tour?.user_id || null;
      
      const rawApps = Array.isArray(job.job_applications)
        ? job.job_applications
        : job.job_applications && typeof job.job_applications === "object"
          ? [job.job_applications]
          : [];

      // Supabase returns profiles as object (one-to-one relation), keep it as object
      // Frontend expects object and will convert to array for PDF when needed
      let applications = rawApps.map((app: any) => {
        let next = app;
        // Check if profile data exists
        const hasProfile = app.profiles && 
          typeof app.profiles === 'object' && 
          (app.profiles.profile_picture_path || app.profiles.bio || app.profiles.intro_video_path);
        
        // If profiles is missing or empty, try to get it from the profileMap
        if (!hasProfile && app.applicant_id && profileMap[app.applicant_id]) {
          next = { ...next, profiles: profileMap[app.applicant_id] };
        }
        
        // If profiles is an array (shouldn't happen from Supabase, but handle it), convert to object
        if (Array.isArray(next.profiles) && next.profiles.length > 0) {
          next = { ...next, profiles: next.profiles[0] };
        }

        const hasName =
          String(next.guide_display_name || "").trim() ||
          String(next.first_name || "").trim() ||
          String(next.last_name || "").trim();
        if (!hasName && next.applicant_id && userNameMap[next.applicant_id]) {
          const u = userNameMap[next.applicant_id];
          next = {
            ...next,
            first_name: next.first_name || u.first_name || "",
            last_name: next.last_name || u.last_name || "",
          };
        }

        return next;
      });
      
      // Note: Tour owners are only included if they have an actual application in the database
      // We no longer create synthetic applications for tour owners who haven't applied

      // Prefer application name; else tour owner's name from users
      let guide_name: string | null = null;
      {
        const fromApps = (() => {
          const hired =
            applications.find(
              (a: any) =>
                a?.offer_status === "completed" ||
                a?.offer_status === "hired" ||
                a?.offer_status === "accepted" ||
                (typeof a?.hire_id === "string" && a.hire_id.length > 0)
            ) ??
            applications.find((a: any) => a?.is_finalist === true) ??
            applications.find(
              (a: any) => a?.offer_status === "candidate" || a?.is_candidate === true
            ) ??
            applications[0];
          if (!hired) return null;
          const display = String(hired.guide_display_name || "").trim();
          if (display) return display;
          const n = `${hired.first_name || ""} ${hired.last_name || ""}`.trim();
          return n || null;
        })();
        if (fromApps) {
          guide_name = fromApps;
        } else if (guideId && userNameMap[guideId]) {
          const u = userNameMap[guideId];
          guide_name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || null;
        }
      }
      
      // A tour-linked line shows the tour's current wording unless the advisor edited this
      // line's own copy. Without this, correcting a tour left every itinerary already using it
      // showing the old text, and the only fix was to delete the line and add it back.
      const jobData: any = withResolvedTourLinkedFields({
        ...job,
        activity_type: canonicalizeActivityTypeLabel(
          (job as { activity_type?: string | null }).activity_type
        ),
        application_status: statusMap[job.id] ?? null,
        booking_status: deriveBookingProgress({
          applications,
          jobAvailable: job.job_available,
          isActive: job.is_active,
        }),
        guide_id: guideId, // Add guide_id for tour-based messaging
        guide_name,
        job_applications: applications, // Include tour owner profile even without application
        price_confirmation_status: (() => {
          if (applications.some((a: any) => a?.price_confirmation_status === "confirmed")) {
            return "confirmed";
          }
          if (applications.some((a: any) => a?.price_confirmation_status === "requested")) {
            return "requested";
          }
          return null;
        })(),
      });
      jobData.booking_status_label =
        BOOKING_PROGRESS_LABEL[jobData.booking_status as keyof typeof BOOKING_PROGRESS_LABEL];

      if (viewerSeesPrices && commissionLookup) {
        const guideNet = jobGuideNetMap[job.id];
        const supplierPrice = parseMoney((job as { supplier_price?: number | null }).supplier_price);
        const clientPrice = parseMoney((job as { client_price?: number | null }).client_price);
        // Advisor-entered supplier/partner quote overrides tour/guide net so a save
        // is not discarded when the itinerary reloads.
        const net = resolveLineNetPrice({ supplierPrice, guideNet });
        const commission = commissionLookup.forJob({
          id: String(job.id),
          tour_id: job.tour_id ?? null,
          guide_id: bookedGuideIdFromApplications(job.job_applications),
          tour: job.tour ?? null,
        } satisfies JobForCommission);
        const jobMarkupPct = advisorMarkupPctForLine({
          lineMarkupPct: (job as { line_markup_pct?: number | null }).line_markup_pct,
          itineraryMarkupPct,
          accountDefaultMarkupPct,
          commission,
        });
        const resolved = priceLineForCommission({
          net,
          commission,
          markupPct: jobMarkupPct,
          passThroughCost: jobPassThroughMap[job.id] ?? null,
        });
        jobData.guideNetPrice = net != null ? Math.round(net) : null;
        jobData.baseDisplayPrice = resolved.baseDisplayPrice;
        jobData.displayPrice = resolved.displayPrice;
        jobData.advisorProfit = resolved.advisorProfit;
        jobData.priceSource = resolved.priceSource;
        jobData.markupPct = jobMarkupPct;
        jobData.line_markup_pct = parseMarkupPct(
          (job as { line_markup_pct?: number | null }).line_markup_pct
        );
        // Named for the UI, which explains this as Pagoda's cut on the guide's net.
        jobData.pagodaMarkupPct = resolved.marketplacePct;
        jobData.commissionMarketplacePct = commission.commissionMarketplacePct;
        jobData.commissionAgentPct = commission.commissionAgentPct;
        jobData.passThroughCost = resolved.passThroughCost || null;
        jobData.supplier_price = supplierPrice;
        jobData.client_price = clientPrice;
      }

      // Filter guide_price and per-person prices from job_applications for agents (they only see display total)
      if ((role === "agent" || role === "agency") && jobData.job_applications) {
        jobData.job_applications = jobData.job_applications.map((app: any) => {
          const {
            guide_price,
            price_per_adult,
            price_per_child,
            price_per_infant,
            quoted_guide_price_at_request,
            ...rest
          } = app;
          return rest;
        });
      } else if (role === "guide" && jobData.job_applications) {
        // Guide can only see their own price
        jobData.job_applications = jobData.job_applications.map((app: any) => {
          if (app.applicant_id !== userId) {
            const { guide_price, ...appWithoutPrice } = app;
            return appWithoutPrice;
          }
          return app;
        });
      }
      // Admin can see all prices (no filtering)

      return jobData;
    });

    return NextResponse.json({ ok: true, jobs: jobsWithStatus });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      activityDateISO?: string | null;
      /** Move job to this calendar day; preserves clock times / duration span. */
      moveToDate?: string | null;
      name?: string;
      activityType?: string;
      startTime?: string | null;
      endTime?: string | null;
      location?: string;
      description?: string | null;
      minPrice?: number | null;
      maxPrice?: number | null;
      supplierPrice?: number | null;
      clientPrice?: number | null;
      lineMarkupPct?: number | null;
      languages?: string | null;
      groupSize?: number | null;
      adults?: number | null;
      children?: number | null;
      infants?: number | null;
      notes?: string | null;
      advisorComments?: string | null;
      imagePaths?: string[] | null;
    };

    const id = typeof body.id === "string" ? body.id : "";
    if (!id)
      return NextResponse.json(
        { ok: false, error: "Missing id" },
        { status: 400 }
      );

    type JobUpdates = {
      updated_at: string;
      name?: string;
      activity_type?: string;
      location?: string;
      description?: string | null;
      min_price?: number | null;
      max_price?: number | null;
      supplier_price?: number | null;
      client_price?: number | null;
      line_markup_pct?: number | null;
      languages?: string | null;
      group_size?: number | null;
      adults?: number | null;
      children?: number | null;
      infants?: number | null;
      notes?: string | null;
      advisor_comments?: string | null;
      images?: string[];
      start_time?: string;
      end_time?: string;
      tour_field_snapshot?: Record<string, unknown> | null;
    };

    const updates: JobUpdates = { updated_at: new Date().toISOString() };

    const moveToDate =
      typeof body.moveToDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.moveToDate.trim())
        ? body.moveToDate.trim()
        : null;

    if (moveToDate) {
      const supabaseMove = getSupabaseServer();
      logItineraryDrag("job.move.start", {
        jobId: id,
        moveToDate,
        actorId: session.actor.userId,
        actorRole: session.actor.role,
        isAdmin: session.actor.isAdmin,
      });

      const activityMove = await denyActivityUnlessAdmin(session.actor, supabaseMove);
      if (activityMove) {
        warnItineraryDrag("job.move.not_approved", { jobId: id, moveToDate });
        return activityMove;
      }
      const jobAccessMove = await assertJobItineraryAccess(
        supabaseMove,
        session.actor,
        id,
        "write"
      );
      if (!jobAccessMove.ok) {
        warnItineraryDrag("job.move.access_denied", { jobId: id, moveToDate });
        return jobAccessMove.response;
      }

      const { data: existingJob, error: fetchErr } = await supabaseMove
        .from("jobs")
        .select("id, start_time, end_time, itinerary_id")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr || !existingJob) {
        warnItineraryDrag("job.move.job_not_found", {
          jobId: id,
          moveToDate,
          dbError: fetchErr?.message,
        });
        return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
      }

      const fromDate =
        typeof existingJob.start_time === "string"
          ? existingJob.start_time.slice(0, 10)
          : null;

      const shifted = shiftJobTimestampsToDate(
        existingJob.start_time as string | null,
        existingJob.end_time as string | null,
        moveToDate
      );
      if (!shifted) {
        warnItineraryDrag("job.move.shift_failed", {
          jobId: id,
          moveToDate,
          fromDate,
          startTime: existingJob.start_time,
          endTime: existingJob.end_time,
        });
        return NextResponse.json(
          { ok: false, error: "Could not move job to that day" },
          { status: 400 }
        );
      }

      const { error: moveErr } = await supabaseMove
        .from("jobs")
        .update({
          start_time: shifted.start_time,
          end_time: shifted.end_time,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (moveErr) {
        errorItineraryDrag("job.move.db_update_failed", moveErr, {
          jobId: id,
          moveToDate,
          fromDate,
        });
        return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
      }

      logItineraryDrag("job.move.success", {
        jobId: id,
        itineraryId: (existingJob as { itinerary_id?: string | null }).itinerary_id ?? null,
        fromDate,
        toDate: moveToDate,
        startTime: shifted.start_time,
        endTime: shifted.end_time,
      });

      return NextResponse.json({
        ok: true,
        job: { id, start_time: shifted.start_time, end_time: shifted.end_time },
      });
    }

    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.activityType === "string")
      updates.activity_type =
        canonicalizeActivityTypeLabel(body.activityType.trim()) || body.activityType.trim();
    if (typeof body.location === "string")
      updates.location = body.location.trim();
    if (typeof body.description === "string" || body.description === null)
      updates.description = body.description;
    if (typeof body.minPrice === "number" || body.minPrice === null)
      updates.min_price = body.minPrice;
    if (typeof body.maxPrice === "number" || body.maxPrice === null)
      updates.max_price = body.maxPrice;
    if (body.supplierPrice !== undefined) {
      updates.supplier_price = parseMoney(body.supplierPrice);
    }
    if (body.clientPrice !== undefined) {
      updates.client_price = parseMoney(body.clientPrice);
    }
    if (body.lineMarkupPct !== undefined) {
      updates.line_markup_pct = parseMarkupPct(body.lineMarkupPct);
    }
    if (typeof body.languages === "string" || body.languages === null)
      updates.languages = body.languages;
    if (typeof body.groupSize === "number" || body.groupSize === null)
      updates.group_size = body.groupSize;
    if (typeof body.adults === "number" || body.adults === null)
      updates.adults = body.adults;
    if (typeof body.children === "number" || body.children === null)
      updates.children = body.children;
    if (typeof body.infants === "number" || body.infants === null)
      updates.infants = body.infants;
    if (typeof body.notes === "string" || body.notes === null) {
      updates.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
    }
    if (typeof body.advisorComments === "string" || body.advisorComments === null) {
      updates.advisor_comments =
        typeof body.advisorComments === "string"
          ? body.advisorComments.trim() || null
          : null;
    }
    if (Array.isArray(body.imagePaths))
      updates.images = body.imagePaths.filter((p) => typeof p === "string");

    const supabase = getSupabaseServer();
    const activityPatch = await denyActivityUnlessAdmin(session.actor, supabase);
    if (activityPatch) return activityPatch;

    const jobAccess = await assertJobItineraryAccess(supabase, session.actor, id, "write");
    if (!jobAccess.ok) return jobAccess.response;

    const touchesTourText =
      typeof body.name === "string" ||
      typeof body.description === "string" ||
      body.description === null;

    if (touchesTourText) {
      const { data: existingRow } = await supabase
        .from("jobs")
        .select("tour_id, name, description, tour_field_snapshot, tour:tour_id(name, description)")
        .eq("id", id)
        .maybeSingle();

      if (existingRow?.tour_id) {
        const tourRow = (
          existingRow as { tour?: { name?: string | null; description?: string | null } }
        ).tour;
        const merged = tourLinkedFieldUpdatesForSave({
          tourId: existingRow.tour_id,
          existingSnapshot: existingRow.tour_field_snapshot,
          existingName: existingRow.name,
          existingDescription: existingRow.description,
          submittedName: typeof body.name === "string" ? body.name.trim() : undefined,
          submittedDescription:
            typeof body.description === "string" || body.description === null
              ? body.description
              : undefined,
          tour: tourRow,
        });
        if (merged.name !== undefined) {
          updates.name = merged.name ?? undefined;
        }
        if (merged.description !== undefined) updates.description = merged.description;
        if (merged.tour_field_snapshot !== undefined) {
          updates.tour_field_snapshot = merged.tour_field_snapshot;
        }
      }
    }

    const wantsStart = typeof body.startTime === "string";
    const wantsEnd = typeof body.endTime === "string";
    if (wantsStart || wantsEnd) {
      const { data: existingTimes } = await supabase
        .from("jobs")
        .select("start_time, end_time")
        .eq("id", id)
        .maybeSingle();

      const dateFromBody =
        typeof body.activityDateISO === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.activityDateISO.trim())
          ? body.activityDateISO.trim()
          : null;
      const dateFromJob = jobCalendarDateFromTimestamp(
        (existingTimes as { start_time?: string | null } | null)?.start_time
      );
      const dateISO = dateFromBody || dateFromJob;

      if (wantsStart) {
        const ts = toTimestamp(dateISO, body.startTime);
        if (!ts)
          return NextResponse.json(
            { ok: false, error: "Invalid arrival time" },
            { status: 400 }
          );
        updates.start_time = ts;
      }
      if (wantsEnd) {
        const ts = toTimestamp(dateISO, body.endTime);
        if (!ts)
          return NextResponse.json(
            { ok: false, error: "Invalid end time" },
            { status: 400 }
          );
        updates.end_time = ts;
      }
    }

    const { error } = await supabase.from("jobs").update(updates).eq("id", id);
    if (error)
      return NextResponse.json(
        { ok: false, error: "Update failed" },
        { status: 500 }
      );

    // Return persisted note fields so the edit UI can rehydrate without a racey refetch wipe
    const { data: savedJob } = await supabase
      .from("jobs")
      .select("id, notes, advisor_comments, supplier_price, start_time, end_time, name, activity_type, location, description")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      job: savedJob
        ? {
            id: savedJob.id,
            notes: savedJob.notes ?? null,
            advisorComments: savedJob.advisor_comments ?? null,
            advisor_comments: savedJob.advisor_comments ?? null,
            supplier_price: (savedJob as { supplier_price?: number | null }).supplier_price ?? null,
            start_time: savedJob.start_time ?? null,
            end_time: savedJob.end_time ?? null,
            name: savedJob.name ?? null,
            activity_type: savedJob.activity_type ?? null,
            location: savedJob.location ?? null,
            description: savedJob.description ?? null,
          }
        : { id },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
