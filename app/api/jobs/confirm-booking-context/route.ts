import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { formatYen } from "@/lib/booking-price-confirmation";
import { requireSessionActor } from "@/lib/itinerary-access";
import { errorBooking, logBooking, warnBooking } from "@/lib/booking-flow-log";

export const runtime = "nodejs";

/**
 * GET /api/jobs/confirm-booking-context?jobId=
 * Guide-only: load job + application for the confirm-price email deep link.
 * Works even when the itinerary is still a draft (unlike the job board list).
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId")?.trim() ?? "";

  try {
    logBooking("guide.context.start", { jobId: jobId || null });

    const session = await requireSessionActor();
    if (!session.ok) {
      warnBooking("guide.context.unauthenticated", { jobId });
      return session.response;
    }
    const { userId, role } = session.actor;

    if (role !== "guide") {
      warnBooking("guide.context.wrong_role", { jobId, role, userId });
      return NextResponse.json(
        {
          ok: false,
          error: "Only the assigned guide can confirm this tour’s price.",
          needsGuideLogin: true,
        },
        { status: 403 }
      );
    }

    if (!jobId) {
      warnBooking("guide.context.missing_job_id", { guideId: userId });
      return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) {
      warnBooking("guide.context.not_approved", { jobId, guideId: userId });
      return activityBlock;
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, created_by, itinerary_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      warnBooking("guide.context.job_not_found", {
        jobId,
        guideId: userId,
        dbError: jobErr?.message,
      });
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const { data: application, error: appErr } = await supabase
      .from("job_applications")
      .select(
        "id, applicant_id, offer_status, guide_price, price_confirmation_status, quoted_guide_price_at_request"
      )
      .eq("job_id", jobId)
      .eq("applicant_id", userId)
      .maybeSingle();

    if (appErr || !application) {
      warnBooking("guide.context.no_application", {
        jobId,
        guideId: userId,
        itineraryId: job.itinerary_id ?? null,
        dbError: appErr?.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "You are not linked to this tour. Open the email link with the guide account that owns this tour.",
        },
        { status: 404 }
      );
    }

    let itineraryName: string | null = null;
    let itineraryStatus: string | null = null;
    if (job.itinerary_id) {
      const { data: itin } = await supabase
        .from("itineraries")
        .select("name, status")
        .eq("id", job.itinerary_id)
        .maybeSingle();
      itineraryName = (itin as { name?: string } | null)?.name ?? null;
      itineraryStatus = (itin as { status?: string } | null)?.status ?? null;
    }

    const quotedRaw = application.quoted_guide_price_at_request;
    const quotedPrice =
      quotedRaw != null && Number.isFinite(Number(quotedRaw))
        ? Math.round(Number(quotedRaw))
        : null;
    const guidePrice =
      application.guide_price != null && Number.isFinite(Number(application.guide_price))
        ? Math.round(Number(application.guide_price))
        : null;

    const status = application.price_confirmation_status ?? null;
    const canConfirm = status === "requested";
    const alreadyConfirmed = status === "confirmed";

    logBooking("guide.context.success", {
      jobId,
      guideId: userId,
      itineraryId: job.itinerary_id ?? null,
      itineraryStatus,
      priceConfirmationStatus: status,
      offerStatus: application.offer_status,
      quotedPrice,
      currentGuidePrice: guidePrice,
      canConfirm,
      alreadyConfirmed,
    });

    if (!canConfirm && !alreadyConfirmed) {
      warnBooking("guide.context.not_ready_to_confirm", {
        jobId,
        guideId: userId,
        priceConfirmationStatus: status,
        hint: "Advisor must click Confirm booking first",
      });
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      jobName: job.name ?? "Tour",
      itineraryId: job.itinerary_id ?? null,
      itineraryName,
      itineraryStatus,
      priceConfirmationStatus: status,
      quotedPrice,
      quotedPriceLabel: formatYen(quotedPrice),
      currentGuidePrice: guidePrice,
      canConfirm,
      alreadyConfirmed,
    });
  } catch (err) {
    errorBooking("guide.context.unexpected_error", err, { jobId });
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
