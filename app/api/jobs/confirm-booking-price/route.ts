import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { finalizeOfficialBooking } from "@/lib/finalize-official-booking";
import { sendBookingConfirmedNotifications } from "@/lib/booking-confirmed-notifications";
import { requireSessionActor } from "@/lib/itinerary-access";
import { errorBooking, logBooking, warnBooking } from "@/lib/booking-flow-log";
import { isMissingColumnError, migrationRequired, serverError } from "@/lib/api-response";

export const runtime = "nodejs";

/**
 * POST /api/jobs/confirm-booking-price
 * Guide confirms (or amends) the live price for this tour. That completes the booking
 * and instructs them to send Pagoda an invoice.
 * Body: { job_id: string, guide_price: number }
 */
export async function POST(req: NextRequest) {
  let jobId = "";
  try {
    const session = await requireSessionActor();
    if (!session.ok) {
      warnBooking("guide.confirm.unauthenticated", {});
      return session.response;
    }
    const { userId, role } = session.actor;

    const body = (await req.json().catch(() => ({}))) as {
      job_id?: string;
      guide_price?: unknown;
      /** Tickets or fees the guide pays for the client — carried at cost, no commission. */
      pass_through_cost?: unknown;
      pass_through_note?: unknown;
    };
    jobId = body.job_id?.trim() ?? "";
    const priceNum = body.guide_price != null ? Number(body.guide_price) : NaN;

    logBooking("guide.confirm.start", {
      jobId: jobId || null,
      guideId: userId,
      role,
      guidePrice: Number.isFinite(priceNum) ? priceNum : null,
    });

    if (role !== "guide") {
      warnBooking("guide.confirm.wrong_role", { jobId, role, userId });
      return NextResponse.json(
        { ok: false, error: "Only the assigned guide can confirm this tour’s price." },
        { status: 403 }
      );
    }

    if (!jobId) {
      warnBooking("guide.confirm.missing_job_id", { guideId: userId });
      return NextResponse.json({ ok: false, error: "job_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      warnBooking("guide.confirm.invalid_price", {
        jobId,
        guideId: userId,
        guidePrice: body.guide_price,
      });
      return NextResponse.json(
        { ok: false, error: "Enter a valid price of 0 or more." },
        { status: 400 }
      );
    }
    const confirmedPrice = Math.round(priceNum);

    // Costs the guide lays out for the client (train tickets above all). Charged on at face
    // value: no marketplace or agent commission, because Pagoda did not earn any on a ticket
    // it merely resold.
    const carriedRaw =
      body.pass_through_cost == null || body.pass_through_cost === ""
        ? null
        : Number(body.pass_through_cost);
    if (carriedRaw != null && (!Number.isFinite(carriedRaw) || carriedRaw < 0)) {
      warnBooking("guide.confirm.invalid_pass_through", {
        jobId,
        guideId: userId,
        passThroughCost: body.pass_through_cost,
      });
      return NextResponse.json(
        { ok: false, error: "Enter a valid ticket or fee amount of 0 or more." },
        { status: 400 }
      );
    }
    const passThroughCost = carriedRaw != null ? Math.round(carriedRaw) : null;
    const passThroughNote =
      typeof body.pass_through_note === "string" && body.pass_through_note.trim()
        ? body.pass_through_note.trim().slice(0, 300)
        : null;

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) {
      warnBooking("guide.confirm.not_approved", { jobId, guideId: userId });
      return activityBlock;
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, created_by, itinerary_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      warnBooking("guide.confirm.job_not_found", { jobId, guideId: userId, dbError: jobErr?.message });
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
      warnBooking("guide.confirm.no_application", {
        jobId,
        guideId: userId,
        dbError: appErr?.message,
      });
      return NextResponse.json(
        { ok: false, error: "No application found for you on this tour." },
        { status: 404 }
      );
    }

    if (application.price_confirmation_status === "confirmed") {
      logBooking("guide.confirm.already_confirmed", { jobId, guideId: userId });
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
        message: "This tour is already officially booked.",
      });
    }

    if (application.price_confirmation_status !== "requested") {
      warnBooking("guide.confirm.not_requested", {
        jobId,
        guideId: userId,
        priceConfirmationStatus: application.price_confirmation_status,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "The advisor has not requested booking confirmation for this tour yet.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const quotedRaw = application.quoted_guide_price_at_request;
    const quotedAtRequest =
      quotedRaw != null && Number.isFinite(Number(quotedRaw)) ? Math.round(Number(quotedRaw)) : null;
    const priceChanged = quotedAtRequest != null && quotedAtRequest !== confirmedPrice;

    const finalized = await finalizeOfficialBooking(supabase, {
      jobId,
      applicationId: application.id,
      guideId: userId,
      agentId: job.created_by as string,
      confirmedGuidePrice: confirmedPrice,
      offerAcceptedAt: now,
      extraApplicationUpdates: {
        guide_price: confirmedPrice,
        ...(passThroughCost != null
          ? { pass_through_cost: passThroughCost, pass_through_note: passThroughNote }
          : {}),
        price_per_adult: null,
        price_per_child: null,
        price_per_infant: null,
        price_confirmation_status: "confirmed",
        price_confirmed_at: now,
        invoice_requested_at: now,
      },
    });

    if (finalized.error) {
      errorBooking("guide.confirm.finalize_failed", new Error(finalized.error), {
        jobId,
        guideId: userId,
        confirmedPrice,
        passThroughCost,
      });
      // The update is a single statement, so a failure here wrote nothing: the booking is not
      // half-confirmed and it is safe to tell the guide to try again.
      if (
        passThroughCost != null &&
        isMissingColumnError({ message: finalized.error }, "pass_through")
      ) {
        // Confirming without the ticket amount would book the tour and quietly drop the
        // ¥ she laid out, so refuse the whole thing rather than under-pay her.
        return migrationRequired(
          "20260831_job_application_pass_through_cost.sql",
          "This tour was not booked: the database cannot yet record tickets or fees you paid for the client."
        );
      }
      return serverError(
        "Could not complete the booking. Nothing was changed — please try again, and contact Pagoda if it keeps failing."
      );
    }

    const { clientPrice } = await sendBookingConfirmedNotifications(supabase, {
      jobId,
      jobName: job.name ?? "Tour",
      itineraryId: job.itinerary_id ?? null,
      agentId: job.created_by as string,
      guideId: userId,
      confirmedPrice,
      quotedAtRequest,
      confirmedByRole: "guide",
      passThroughCost,
      passThroughNote,
    });

    logBooking("guide.confirm.success", {
      jobId,
      guideId: userId,
      itineraryId: job.itinerary_id ?? null,
      confirmedPrice,
      quotedAtRequest,
      priceChanged,
      clientPrice,
      historyError: finalized.historyError,
    });

    return NextResponse.json({
      ok: true,
      message: "Price confirmed. This tour is officially booked — please send Pagoda an invoice for this amount.",
      guide_price: confirmedPrice,
      client_price: clientPrice,
      price_changed: priceChanged,
    });
  } catch (err) {
    errorBooking("guide.confirm.unexpected_error", err, { jobId });
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
