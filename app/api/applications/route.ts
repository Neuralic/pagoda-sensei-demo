import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { uploadManyToStorage } from "@/lib/storage";
import { sendGuideApplicationNotificationEmail } from "@/lib/mailer";
import {
  computeGuideTotalGroupRate,
  isGroupSizeOverTourLimit,
} from "@/lib/tour-price";
import { requireGuideAvailabilityForFirstBooking } from "@/lib/guide-availability";
import { getJobClosedToApplicationsMessage } from "@/lib/job-board-db";

export const runtime = "nodejs";

/**
 * Require guide_price when:
 * - Job is custom (no tour_id), OR
 * - Job is from tour library but applicant is NOT the tour owner.
 * Tour owner's price is set when the job is created; other guides must enter price at bid.
 *
 * Frontend (apply modal): When price is required, send either per_person
 * (price_per_adult/child/infant) or group_rate (base_rate, base_group_size,
 * additional_per_person_rate, optional max_group_size), or a single guide_price
 * when the job has no participant breakdown.
 * Tour owner on library jobs skips price (set at job creation).
 */
function shouldRequireGuidePriceAtBid(
  jobRecord: { tour_id?: string | null; tour?: { user_id?: string } } | null,
  applicantId: string
): boolean {
  if (!jobRecord) return false;
  if (!jobRecord.tour_id) return true; // custom job
  const tourOwnerId = (jobRecord.tour as { user_id?: string } | null)?.user_id;
  return applicantId !== tourOwnerId; // tour library + not tour owner
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    if (!userId)
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );

    const form = await req.formData();
    const payloadRaw = form.get("payload") as string | null;
    if (!payloadRaw)
      return NextResponse.json(
        { ok: false, error: "Missing payload" },
        { status: 400 }
      );

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid payload JSON" },
        { status: 400 }
      );
    }

    const fileItems: File[] = [];
    for (const entry of form.getAll("files")) {
      if (entry instanceof File) fileItems.push(entry);
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) return activityBlock;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError)
      return NextResponse.json(
        { ok: false, error: "Database error finding profile" },
        { status: 500 }
      );
    if (!profile?.id)
      return NextResponse.json(
        {
          ok: false,
          error:
            "Profile not found. Please complete your profile before applying.",
        },
        { status: 400 }
      );

    const applicant_profile_id = profile.id;
    let jobRecord: {
      tour_id?: string | null;
      tour?: { user_id?: string };
    } | null = null;

    let jobParticipants: { adults: number; children: number; infants: number } | null = null;
    if (payload.job_id) {
      const { data: job, error: jobCheckError } = await supabase
        .from("jobs")
        .select("id, created_by, itinerary_id, tour_id, released_at, start_time, adults, children, infants, job_available, tour:tour_id(user_id), itinerary:itinerary_id(status)")
        .eq("id", payload.job_id)
        .single();

      if (jobCheckError || !job)
        return NextResponse.json(
          { ok: false, error: "Job not found" },
          { status: 404 }
        );
      jobRecord = job as unknown as typeof jobRecord;
      const j = job as { adults?: number | null; children?: number | null; infants?: number | null };
      jobParticipants = {
        adults: Number(j.adults) || 0,
        children: Number(j.children) || 0,
        infants: Number(j.infants) || 0,
      };
      if (jobParticipants.adults + jobParticipants.children + jobParticipants.infants === 0)
        jobParticipants.adults = 1;

      const availGate = await requireGuideAvailabilityForFirstBooking(supabase, userId, {
        jobStartIso: (job as { start_time?: string | null }).start_time ?? null,
      });
      if (!availGate.ok) {
        return NextResponse.json({ ok: false, error: availGate.error }, { status: availGate.status });
      }

      // Reject if job creator (agent) is suspended — job is no longer available for bidding
      const creatorId = (job as { created_by?: string }).created_by;
      if (creatorId) {
        const { data: creatorUser } = await supabase
          .from("users")
          .select("is_active")
          .eq("id", creatorId)
          .maybeSingle();
        if (creatorUser && (creatorUser as { is_active?: boolean }).is_active === false) {
          return NextResponse.json(
            { ok: false, error: "This job is no longer available for bidding." },
            { status: 403 }
          );
        }
      }

      // Guides can only bid after the itinerary is published (applies to BOTH custom jobs and tour-library jobs).
      const itineraryStatus = (job as { itinerary?: { status?: string | null } | null }).itinerary?.status;
      if (itineraryStatus !== "published") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This job is not yet available for bidding. It will be open when the itinerary is published.",
          },
          { status: 403 }
        );
      }

      const closedMsg = await getJobClosedToApplicationsMessage(supabase, String(payload.job_id), {
        job_available: (job as { job_available?: boolean | null }).job_available,
      });
      if (closedMsg) {
        return NextResponse.json({ ok: false, error: closedMsg }, { status: 403 });
      }

      if (job.tour_id) {
        const tourOwnerId = (job.tour as { user_id?: string } | null)?.user_id;
        if (job.released_at) {
          const releasedAt = new Date(job.released_at);
          const now = new Date();
          const hoursSinceRelease =
            (now.getTime() - releasedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceRelease < 24 && userId !== tourOwnerId)
            return NextResponse.json(
              {
                ok: false,
                error:
                  "This job is exclusively available to the tour owner for the first 24 hours after publication",
              },
              { status: 403 }
            );
        }
      }

      const { data: existing, error: checkError } = await supabase
        .from("job_applications")
        .select("id")
        .eq("job_id", payload.job_id)
        .eq("applicant_id", userId)
        .limit(1);

      if (checkError)
        return NextResponse.json(
          { ok: false, error: "Database error checking existing application" },
          { status: 500 }
        );
      if (Array.isArray(existing) && existing.length > 0)
        return NextResponse.json(
          { ok: false, error: "You have already applied to this job" },
          { status: 409 }
        );
    }

    const jobSummary = payload["job_summary"] as Record<string, unknown> | undefined;
    const { data: userProfile, error: userError } = await supabase
      .from("users")
      .select("first_name, last_name, email, phone, country, city")
      .eq("id", payload.user_id)
      .single();

    if (userError || !userProfile)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );

    const availability = payload["availability"] as Record<string, unknown> | undefined;
    const rawLanguages = payload["languages"];
    const languages = Array.isArray(rawLanguages)
      ? (rawLanguages as unknown[])
      : null;

    const uploadedPaths: string[] = [];
    if (fileItems.length > 0) {
      const folder = payload.job_id
        ? `applications/${payload.job_id}`
        : "applications";
      const uploaded = await uploadManyToStorage(fileItems, {
        bucket: "documents",
        folder,
      });
      for (const u of uploaded) uploadedPaths.push(u.path);
    }

    const insert: Record<string, unknown> = {
      job_id: payload["job_id"] ?? null,
      applicant_id: userId,
      applicant_profile_id,
      job_title: payload["job_title"] ?? jobSummary?.["title"] ?? null,
      location: jobSummary?.["location"] ?? null,
      duration: jobSummary?.["duration"] ?? null,
      group_size: jobSummary?.["groupSize"] ?? null,
      date:
        jobSummary?.["date"] != null
          ? new Date(String(jobSummary["date"])).toISOString()
          : null,
      first_name:
        userProfile?.first_name != null
          ? String(userProfile.first_name)
          : null,
      last_name:
        userProfile?.last_name != null ? String(userProfile.last_name) : null,
      email: userProfile?.email != null ? String(userProfile.email) : null,
      phone: userProfile?.phone != null ? String(userProfile.phone) : null,
      country:
        userProfile?.country != null ? String(userProfile.country) : null,
      city: userProfile?.city != null ? String(userProfile.city) : null,
      availability_confirmed:
        typeof availability?.["confirmed"] === "boolean"
          ? Boolean(availability?.confirmed)
          : false,
      availability_notes:
        availability?.notes != null ? String(availability.notes) : null,
      languages,
      why: payload["why"] != null ? String(payload["why"]) : null,
      certification: Array.isArray(payload["certification"])
        ? payload["certification"]
        : payload["certification"]
          ? [String(payload["certification"])]
          : null,
      file_paths: uploadedPaths,
    };

    const requirePrice = shouldRequireGuidePriceAtBid(jobRecord, userId);
    if (requirePrice) {
      const pricingModel = payload["pricing_model"];
      if (jobParticipants && pricingModel === "group_rate") {
        const baseRate = Number(payload["base_rate"]);
        const baseGroupSize = Number(payload["base_group_size"]);
        const rawAdd = payload["additional_per_person_rate"];
        const additional =
          rawAdd != null && rawAdd !== "" ? Number(rawAdd) : 0;
        /** Custom jobs: agent already set headcount; guides do not set a max cap on apply */
        const isTourJob = Boolean(
          jobRecord &&
            (jobRecord as { tour_id?: string | null }).tour_id != null &&
            String((jobRecord as { tour_id?: string | null }).tour_id).trim() !== ""
        );
        const rawMax = isTourJob ? payload["max_group_size"] : null;
        const maxGroupSize =
          rawMax != null && rawMax !== "" ? Number(rawMax) : null;

        if (!Number.isFinite(baseRate) || baseRate <= 0)
          return NextResponse.json(
            {
              ok: false,
              error: "Enter a valid base rate (¥) greater than 0.",
            },
            { status: 400 }
          );
        if (!Number.isFinite(baseGroupSize) || baseGroupSize < 1)
          return NextResponse.json(
            {
              ok: false,
              error: "Base group size must be at least 1.",
            },
            { status: 400 }
          );
        if (!Number.isFinite(additional) || additional < 0)
          return NextResponse.json(
            {
              ok: false,
              error: "Additional per person must be zero or greater.",
            },
            { status: 400 }
          );
        if (
          maxGroupSize != null &&
          (!Number.isFinite(maxGroupSize) || maxGroupSize < 1)
        )
          return NextResponse.json(
            {
              ok: false,
              error: "Maximum group size must be at least 1 when set.",
            },
            { status: 400 }
          );
        if (
          isGroupSizeOverTourLimit(
            {
              pricing_model: "group_rate",
              max_group_size: maxGroupSize,
            },
            jobParticipants
          )
        ) {
          return NextResponse.json(
            {
              ok: false,
              error: `This job's group size exceeds your maximum (${maxGroupSize} people). Increase the limit or adjust the job.`,
            },
            { status: 400 }
          );
        }
        const { adults, children, infants } = jobParticipants;
        const result = computeGuideTotalGroupRate(
          baseRate,
          baseGroupSize,
          adults,
          children,
          infants,
          additional
        );
        if (result.guideTotal < 0)
          return NextResponse.json(
            {
              ok: false,
              error: "Computed guide total must be 0 or more.",
            },
            { status: 400 }
          );
        insert.guide_price = Math.round(result.guideTotal);
        insert.price_per_adult = null;
        insert.price_per_child = null;
        insert.price_per_infant = null;
      } else if (jobParticipants) {
        const rawPa = payload["price_per_adult"];
        const rawPc = payload["price_per_child"];
        const rawPi = payload["price_per_infant"];
        const pa = rawPa != null ? Number(rawPa) : NaN;
        const pc = rawPc != null ? Number(rawPc) : NaN;
        const pi = rawPi != null ? Number(rawPi) : NaN;
        const hasPerPerson =
          Number.isFinite(pa) &&
          pa >= 0 &&
          Number.isFinite(pc) &&
          pc >= 0 &&
          Number.isFinite(pi) &&
          pi >= 0;
        if (hasPerPerson) {
          const { adults, children, infants } = jobParticipants;
          const guideTotal = adults * pa + children * pc + infants * pi;
          if (guideTotal < 0)
            return NextResponse.json(
              {
                ok: false,
                error:
                  "Total price must be 0 or more. Check participants and per-person prices.",
              },
              { status: 400 }
            );
          insert.guide_price = Math.round(guideTotal);
          insert.price_per_adult = pa;
          insert.price_per_child = pc;
          insert.price_per_infant = pi;
        } else {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Enter per-person prices (adults, children, infants) or choose group rate with base price and group size.",
            },
            { status: 400 }
          );
        }
      } else {
        const rawGp = payload["guide_price"];
        const gp = rawGp != null ? Number(rawGp) : NaN;
        if (!Number.isFinite(gp) || gp < 0)
          return NextResponse.json(
            {
              ok: false,
              error:
                "Your price (¥) is required for this job. Please enter 0 or more (0 = free).",
            },
            { status: 400 }
          );
        insert.guide_price = gp;
      }
    }

    const { data, error } = await supabase
      .from("job_applications")
      .insert(insert)
      .select("id")
      .single();

    if (error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );

    if (payload.job_id && data?.id) {
      try {
        const { data: jobData, error: jobError } = await supabase
          .from("jobs")
          .select("id, name, created_by, itinerary_id")
          .eq("id", payload.job_id)
          .single();

        if (!jobError && jobData) {
          const { data: agentData } = await supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", jobData.created_by)
            .single();

          let itineraryName: string | null = null;
          if (jobData.itinerary_id) {
            const { data: itineraryData } = await supabase
              .from("itineraries")
              .select("name")
              .eq("id", jobData.itinerary_id)
              .single();
            itineraryName = itineraryData?.name ?? null;
          }

          const guideName =
            userProfile?.first_name || userProfile?.last_name
              ? `${userProfile.first_name ?? ""} ${userProfile.last_name ?? ""}`.trim()
              : "A guide";

          if (agentData?.email) {
            const agentName =
              agentData.first_name || agentData.last_name
                ? `${agentData.first_name ?? ""} ${agentData.last_name ?? ""}`.trim()
                : "Agent";
            sendGuideApplicationNotificationEmail(
              agentData.email,
              agentName,
              guideName,
              jobData.name ?? "Your job",
              jobData.id,
              itineraryName
            ).catch((err) =>
              console.error("Failed to send application notification email", err)
            );
          }
        }
      } catch (emailError) {
        console.error("Error sending application notification email", emailError);
      }
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

    if (!jobId)
      return NextResponse.json(
        { ok: false, error: "Missing jobId" },
        { status: 400 }
      );

    const jar = await cookies();
    const userId = jar.get("userId")?.value;

    if (!userId)
      return NextResponse.json({
        ok: true,
        applied: false,
        hire_me: false,
      });

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) return activityBlock;

    const { data: appRow, error: appError } = await supabase
      .from("job_applications")
      .select("id, hire_id, guide_price, offer_status, is_candidate, price_per_adult, price_per_child, price_per_infant, price_confirmation_status, quoted_guide_price_at_request")
      .eq("job_id", jobId)
      .eq("applicant_id", userId)
      .limit(1);

    if (appError)
      return NextResponse.json(
        { ok: false, error: "Database error" },
        { status: 500 }
      );

    const applied = Array.isArray(appRow) && appRow.length > 0;
    const row = applied ? appRow[0] : null;

    const hire_me = applied && row?.hire_id === userId;
    const guide_hire =
      hire_me && row ? (row.guide_price ?? null) : null;
    const offer_status = row?.offer_status ?? null;
    const is_candidate = applied && row ? Boolean(row.is_candidate) : false;
    const guide_price =
      applied && row && row.guide_price != null
        ? Number(row.guide_price)
        : null;
    const price_per_adult = applied && row && (row as { price_per_adult?: number | null }).price_per_adult != null ? Number((row as { price_per_adult?: number }).price_per_adult) : null;
    const price_per_child = applied && row && (row as { price_per_child?: number | null }).price_per_child != null ? Number((row as { price_per_child?: number }).price_per_child) : null;
    const price_per_infant = applied && row && (row as { price_per_infant?: number | null }).price_per_infant != null ? Number((row as { price_per_infant?: number }).price_per_infant) : null;
    const has_offer = applied && row?.offer_status === "offered";
    const price_confirmation_status =
      applied && row && typeof (row as { price_confirmation_status?: string | null }).price_confirmation_status === "string"
        ? (row as { price_confirmation_status: string }).price_confirmation_status
        : null;
    const quoted_guide_price_at_request =
      applied &&
      row &&
      (row as { quoted_guide_price_at_request?: number | null }).quoted_guide_price_at_request != null
        ? Number((row as { quoted_guide_price_at_request: number }).quoted_guide_price_at_request)
        : null;

    let job_adults: number | null = null;
    let job_children: number | null = null;
    let job_infants: number | null = null;
    let job_tour_id: string | null = null;
    if (jobId) {
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("adults, children, infants, tour_id")
        .eq("id", jobId)
        .single();
      if (jobRow) {
        job_adults = jobRow.adults != null ? Number(jobRow.adults) : null;
        job_children = jobRow.children != null ? Number(jobRow.children) : null;
        job_infants = jobRow.infants != null ? Number(jobRow.infants) : null;
        job_tour_id =
          jobRow.tour_id != null && String(jobRow.tour_id).trim() !== ""
            ? String(jobRow.tour_id)
            : null;
      }
    }

    return NextResponse.json({
      ok: true,
      applied,
      hire_me,
      guide_hire,
      offer_status,
      has_offer,
      is_candidate,
      guide_price,
      price_per_adult,
      price_per_child,
      price_per_infant,
      job_adults,
      job_children,
      job_infants,
      job_tour_id,
      price_confirmation_status,
      quoted_guide_price_at_request,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
