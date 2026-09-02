import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { BUCKETS } from "@/lib/buckets";
import {
  computeGuideTotalFromTour,
  getAgentDisplayTotalRounded,
  normalizeJobParticipants,
  DEFAULT_COMMISSION_SETTINGS,
} from "@/lib/tour-price";
import { requireGuideAvailabilityForFirstBooking } from "@/lib/guide-availability";
import { hideJobFromBoard } from "@/lib/job-board-db";
import {
  normalizeGuideFulfillment,
  validateGuideFulfillment,
} from "@/lib/guide-fulfillment";
import { canActAsAgent, bypassesResourceOwnership } from "@/lib/platform-access";
import { requireSessionActor } from "@/lib/itinerary-access";
import { errorBooking } from "@/lib/booking-flow-log";

/**
 * GET /api/hire?jobId=xxx
 * Agent (or job creator) fetches a job and its applications for the bids page.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId") || "";

    if (!jobId)
      return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });

    const session = await requireSessionActor();
    if (!session.ok) return session.response;
    const { userId, role } = session.actor;
    if (!canActAsAgent(role))
      return NextResponse.json({ ok: false, error: "Only agents and agencies can view bids" }, { status: 403 });

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) return activityBlock;

    let jobQuery = supabase
      .from("jobs")
      .select("id, name, description, location, start_time, end_time, images, group_size, languages, min_price, max_price, created_at, created_by, tour_id, itinerary_id, adults, children, infants")
      .eq("id", jobId);

    if (!bypassesResourceOwnership(role)) {
      jobQuery = jobQuery.eq("created_by", userId);
    }

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job)
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

    // For tour library jobs: compute tour owner's guide total from tour pricing (per_person or group_rate) × job participants
    let tourOwnerGuidePrice: number | null = null;
    let tourOwnerId: string | null = null;
    const jobTourId = (job as { tour_id?: string | null }).tour_id;
    if (jobTourId) {
      const { data: tour } = await supabase
        .from("tour")
        .select("user_id, pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate")
        .eq("id", jobTourId)
        .maybeSingle();
      if (tour && (tour as { user_id?: string }).user_id) {
        tourOwnerId = (tour as { user_id: string }).user_id;
        const participants = normalizeJobParticipants({
          adults: (job as { adults?: number | null }).adults,
          children: (job as { children?: number | null }).children,
          infants: (job as { infants?: number | null }).infants,
          group_size: (job as { group_size?: number | null }).group_size,
        });
        const result = computeGuideTotalFromTour(
          {
            pricing_model: (tour as { pricing_model?: string | null }).pricing_model,
            price_per_adult: (tour as { price_per_adult?: number | null }).price_per_adult,
            price_per_child: (tour as { price_per_child?: number | null }).price_per_child,
            price_per_infant: (tour as { price_per_infant?: number | null }).price_per_infant,
            base_rate: (tour as { base_rate?: number | null }).base_rate,
            base_group_size: (tour as { base_group_size?: number | null }).base_group_size,
            max_group_size: (tour as { max_group_size?: number | null }).max_group_size,
            additional_per_person_rate: (tour as { additional_per_person_rate?: number | null }).additional_per_person_rate,
          },
          participants
        );
        if (result != null) tourOwnerGuidePrice = result.guideTotal;
      }
    }

    const { data: appRows, error: appError } = await supabase
      .from("job_applications")
      .select("id, applicant_id, first_name, last_name, why, languages, submitted_at, guide_price, price_per_adult, price_per_child, price_per_infant, hire_id, offer_status, is_candidate, is_finalist")
      .eq("job_id", jobId)
      .order("submitted_at", { ascending: false });

    if (appError)
      return NextResponse.json({ ok: false, error: appError.message }, { status: 500 });

    const applicantIds = [...new Set((appRows || []).map((a: { applicant_id: string }) => a.applicant_id).filter(Boolean))];
    const profileByUserId: Record<string, { profile_picture_path?: string | null; profile_slug?: string | null }> = {};
    if (applicantIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, profile_picture_path, profile_slug")
        .in("user_id", applicantIds);
      for (const p of profiles || []) {
        const row = p as { user_id: string; profile_picture_path?: string | null; profile_slug?: string | null };
        if (row.user_id) {
          profileByUserId[row.user_id] = {
            profile_picture_path: row.profile_picture_path,
            profile_slug: row.profile_slug,
          };
        }
      }
    }

    const avatarPaths = Object.values(profileByUserId)
      .map((p) => p?.profile_picture_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
    const avatarUrlMap: Record<string, string | null> = {};
    for (const path of avatarPaths) {
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKETS.avatars)
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        avatarUrlMap[path] = signed?.signedUrl ?? null;
      } catch {
        avatarUrlMap[path] = null;
      }
    }

    let settingsRows: unknown[] | null = null;
    if (applicantIds.length > 0) {
      const { data } = await supabase
        .from("guide_commission_settings")
        .select("user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
        .in("user_id", applicantIds);
      settingsRows = data;
    }
    const settingsByGuide: Record<string, { m: number; a: number; v: number }> = {};
    for (const row of settingsRows || []) {
      const uid = (row as { user_id?: string }).user_id;
      if (uid) {
        settingsByGuide[uid] = {
          m:
            Number((row as { commission_marketplace_pct?: number }).commission_marketplace_pct) ||
            DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
          a:
            Number((row as { commission_agent_pct?: number }).commission_agent_pct) ||
            DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
          v: DEFAULT_COMMISSION_SETTINGS.vatRatePct,
        };
      }
    }

    const applications = (appRows || []).map((app: Record<string, unknown>) => {
      const applicantId = app.applicant_id as string;
      const profile = profileByUserId[applicantId];
      const path = profile?.profile_picture_path;
      const signedAvatarUrl = (typeof path === "string" && path ? avatarUrlMap[path] : null) || undefined;
      let guidePrice: number | null = app.guide_price != null ? Number(app.guide_price) : null;
      // Tour owner: always use calculated (price per person × number of persons) when tour has per-person pricing
      if (tourOwnerId && applicantId === tourOwnerId && tourOwnerGuidePrice != null) {
        guidePrice = tourOwnerGuidePrice;
      }
      let total_price: number | null = null;
      if (guidePrice != null && Number.isFinite(guidePrice) && guidePrice > 0) {
        const s = settingsByGuide[applicantId] ?? {
          m: DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
          a: DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
          v: DEFAULT_COMMISSION_SETTINGS.vatRatePct,
        };
        total_price = getAgentDisplayTotalRounded(guidePrice, s.m, s.a, s.v);
      }
      const profileSlug = (profile?.profile_slug as string | null | undefined)?.trim() || undefined;
      return {
        id: app.id,
        applicant_id: app.applicant_id,
        first_name: app.first_name,
        last_name: app.last_name,
        applicant_name: [app.first_name, app.last_name].filter(Boolean).join(" ") || undefined,
        why: app.why,
        profile_slug: profileSlug,
        signedAvatarUrl: signedAvatarUrl ?? undefined,
        languages: Array.isArray(app.languages) ? app.languages : (typeof app.languages === "string" ? (app.languages ? [app.languages] : []) : []),
        status: app.offer_status,
        submitted_at: app.submitted_at,
        guide_price: guidePrice ?? app.guide_price,
        price_per_adult: app.price_per_adult != null ? Number(app.price_per_adult) : undefined,
        price_per_child: app.price_per_child != null ? Number(app.price_per_child) : undefined,
        price_per_infant: app.price_per_infant != null ? Number(app.price_per_infant) : undefined,
        hire_id: app.hire_id,
        offer_status: app.offer_status,
        is_candidate: app.is_candidate,
        is_finalist: app.is_finalist === true,
        total_price,
      };
    });

    const jobPayload = { ...job, signedImageUrls: null as string[] | null };
    if (Array.isArray(job.images) && job.images.length > 0) {
      const signedJobUrls: string[] = [];
      for (const path of job.images) {
        if (typeof path !== "string") continue;
        try {
          const { data: signed } = await supabase.storage
            .from(BUCKETS.jobs)
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) signedJobUrls.push(signed.signedUrl);
        } catch {
          // skip
        }
      }
      jobPayload.signedImageUrls = signedJobUrls.length > 0 ? signedJobUrls : null;
    }

    return NextResponse.json({
      ok: true,
      job: jobPayload,
      applications: applications,
    });
  } catch (err) {
    console.error("Error fetching job bids:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/hire
 * Agent hires an accepted candidate for a job.
 * Body: { job_id: string, applicant_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;
    const { userId, role } = session.actor;
    if (!canActAsAgent(role)) {
      return NextResponse.json(
        { ok: false, error: "Only agents can hire guides" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const job_id = body.job_id as string | undefined;
    const applicant_id = body.applicant_id as string | undefined;

    if (!job_id || !applicant_id) {
      return NextResponse.json(
        { ok: false, error: "job_id and applicant_id are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const activityPost = await denyIfActivityNotApproved(userId, supabase);
    if (activityPost) return activityPost;

    let hireJobQuery = supabase
      .from("jobs")
      .select("id, created_by, itinerary_id, name")
      .eq("id", job_id);

    if (!bypassesResourceOwnership(role)) {
      hireJobQuery = hireJobQuery.eq("created_by", userId);
    }

    const { data: job, error: jobError } = await hireJobQuery.maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const { data: application, error: findError } = await supabase
      .from("job_applications")
      .select("id, offer_status, is_candidate, fulfillment_submitted_at, guide_price")
      .eq("job_id", job_id)
      .eq("applicant_id", applicant_id)
      .maybeSingle();

    if (findError || !application) {
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    if (application.offer_status === "completed" || application.offer_status === "hired") {
      return NextResponse.json({
        ok: true,
        alreadyHired: true,
        message: "This guide is already hired for this job.",
      });
    }

    if (application.offer_status !== "accepted" || !application.is_candidate) {
      return NextResponse.json(
        { ok: false, error: "Guide must accept the offer before you can hire them" },
        { status: 400 }
      );
    }

    if (!application.fulfillment_submitted_at) {
      return NextResponse.json(
        {
          ok: false,
          error: "Guide must submit pickup details when accepting before you can hire them",
        },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("job_applications")
      .update({
        offer_status: "completed",
        hire_id: applicant_id,
        is_candidate: true,
      })
      .eq("id", application.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    await hideJobFromBoard(supabase, job_id, "hired");

    const { data: existingHistory } = await supabase
      .from("job_hiring_history")
      .select("id")
      .eq("job_id", job_id)
      .eq("is_closed", false)
      .maybeSingle();

    if (!existingHistory) {
      const guidePrice =
        application.guide_price != null && Number.isFinite(Number(application.guide_price))
          ? Math.round(Number(application.guide_price))
          : null;
      if (guidePrice == null) {
        errorBooking("hire.hiring_history_missing_price", new Error("guide_price missing"), {
          jobId: job_id,
          applicationId: application.id,
          guideId: applicant_id,
        });
        return NextResponse.json(
          {
            ok: false,
            error:
              "This guide has no price on file. Set the guide price before hiring, then try again.",
          },
          { status: 400 }
        );
      }

      const { error: histErr } = await supabase.from("job_hiring_history").insert({
        job_id,
        application_id: application.id,
        agent_id: userId,
        guide_id: applicant_id,
        final_price: guidePrice,
        offer_accepted_at: new Date().toISOString(),
        is_closed: false,
      });
      if (histErr) {
        errorBooking("hire.hiring_history_insert_failed", histErr, {
          jobId: job_id,
          applicationId: application.id,
          guideId: applicant_id,
          agentId: userId,
        });
      }
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("Error hiring guide:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/hire
 * Guide accepts an offer for a job.
 * Body: {
 *   job_id, user_id, guide_price?,
 *   pickup_date, pickup_time, pickup_location, guide_display_name, guide_whatsapp
 * }
 * If guide_price is omitted, the application's existing guide_price (from bid or tour) is used.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;
    const { userId, role } = session.actor;
    if (role !== "guide")
      return NextResponse.json({ ok: false, error: "Only guides can accept offers" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const job_id = body.job_id;
    const user_id = body.user_id;
    const rawPrice = body.guide_price;

    if (!job_id || !user_id)
      return NextResponse.json({ ok: false, error: "job_id and user_id are required" }, { status: 400 });
    if (user_id !== userId)
      return NextResponse.json({ ok: false, error: "You can only accept your own offer" }, { status: 403 });

    const supabase = getSupabaseServer();
    const activityPut = await denyIfActivityNotApproved(userId, supabase);
    if (activityPut) return activityPut;
    const { data: application, error: findError } = await supabase
      .from("job_applications")
      .select("id, offer_status, guide_price")
      .eq("job_id", job_id)
      .eq("applicant_id", user_id)
      .single();

    if (findError || !application)
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    if (application.offer_status !== "offered")
      return NextResponse.json(
        { ok: false, error: "No pending offer to accept" },
        { status: 400 }
      );

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("start_time")
      .eq("id", job_id)
      .maybeSingle();

    const availGate = await requireGuideAvailabilityForFirstBooking(supabase, user_id, {
      jobStartIso: (jobRow as { start_time?: string } | null)?.start_time ?? null,
    });
    if (!availGate.ok) {
      return NextResponse.json({ ok: false, error: availGate.error }, { status: availGate.status });
    }

    const fulfillmentError = validateGuideFulfillment(body);
    if (fulfillmentError) {
      return NextResponse.json({ ok: false, error: fulfillmentError }, { status: 400 });
    }
    const fulfillment = normalizeGuideFulfillment(body);

    const updates: Record<string, unknown> = {
      offer_status: "accepted",
      is_candidate: true,
      pickup_date: fulfillment.pickup_date,
      pickup_time: fulfillment.pickup_time,
      pickup_location: fulfillment.pickup_location,
      guide_display_name: fulfillment.guide_display_name,
      guide_whatsapp: fulfillment.guide_whatsapp,
      fulfillment_submitted_at: new Date().toISOString(),
    };
    if (rawPrice != null && rawPrice !== "") {
      const priceNum = parseFloat(String(rawPrice));
      if (Number.isFinite(priceNum) && priceNum >= 0) updates.guide_price = priceNum;
    }

    const { data: updated, error: updateError } = await supabase
      .from("job_applications")
      .update(updates)
      .eq("id", application.id)
      .select()
      .single();

    if (updateError)
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

    await hideJobFromBoard(supabase, job_id, "accepted");

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("Error accepting offer:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
