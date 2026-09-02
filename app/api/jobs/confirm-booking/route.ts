import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getGuideConfirmBookingLoginDeepLinkUrl } from "@/lib/booking-deep-link";
import { sendGuideConfirmBookingPriceEmail } from "@/lib/mailer";
import {
  snapshotLibraryGuidePrice,
  formatYen,
} from "@/lib/booking-price-confirmation";
import { finalizeOfficialBooking } from "@/lib/finalize-official-booking";
import { sendBookingConfirmedNotifications } from "@/lib/booking-confirmed-notifications";
import {
  assertJobItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from "@/lib/itinerary-access";
import { errorBooking, logBooking, warnBooking } from "@/lib/booking-flow-log";
import { badRequest, ok, serverError } from "@/lib/api-response";
import {
  optionalString,
  parseEnum,
  parseJsonObject,
  requireString,
} from "@/lib/validate";

export const runtime = "nodejs";

/**
 * Guard against an advisor spamming the guide while they are still reading the first email.
 * Measured from the last *successful* notification, never from the request — a request whose
 * email failed must stay retryable immediately.
 */
export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/** Stored in `price_confirmation_notify_error`; distinguishes "unreachable" from "send failed". */
const GUIDE_HAS_NO_EMAIL = "guide_no_email";

/**
 * `request`  — first ask (default)
 * `resend`   — nudge a guide who has not answered yet
 * `cancel`   — drop the pending ask so the advisor gets the Confirm button back
 * `mark_booked` — Pagoda admin books it on the guide's behalf when they never respond
 */
type ConfirmBookingAction = "request" | "resend" | "cancel" | "mark_booked";

const CONFIRM_BOOKING_ACTIONS = [
  "request",
  "resend",
  "cancel",
  "mark_booked",
] as const satisfies readonly ConfirmBookingAction[];

/** Offer statuses eligible for booking confirmation (incl. tour-library `pending`). */
const BOOKABLE_OFFER_STATUSES = [
  "accepted",
  "offered",
  "candidate",
  "hired",
  "completed",
  "pending",
] as const;

const BOOKABLE_STATUSES = new Set<string>(BOOKABLE_OFFER_STATUSES);

type ApplicationRow = {
  id: string;
  applicant_id: string;
  offer_status: string | null;
  hire_id: string | null;
  guide_price: number | null;
  price_confirmation_status: string | null;
  price_confirmation_requested_at?: string | null;
  price_confirmation_last_notified_at?: string | null;
  price_confirmation_notify_error?: string | null;
  quoted_guide_price_at_request?: number | null;
  is_candidate?: boolean | null;
  is_finalist?: boolean | null;
  submitted_at?: string | null;
};

function pickBookableApplication(apps: ApplicationRow[]): ApplicationRow | null {
  if (!apps.length) return null;
  const statusRank = (s: string) => {
    const k = s.toLowerCase();
    if (k === "completed" || k === "hired") return 0;
    if (k === "accepted") return 1;
    if (k === "offered") return 2;
    if (k === "candidate") return 3;
    if (k === "pending") return 4;
    return 5;
  };
  const sorted = [...apps].sort((a, b) => {
    const ra = statusRank(String(a.offer_status || ""));
    const rb = statusRank(String(b.offer_status || ""));
    if (ra !== rb) return ra - rb;
    if (Boolean(a.is_finalist) !== Boolean(b.is_finalist)) {
      return a.is_finalist ? -1 : 1;
    }
    if (Boolean(a.is_candidate) !== Boolean(b.is_candidate)) {
      return a.is_candidate ? -1 : 1;
    }
    const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return tb - ta;
  });
  const chosen = sorted[0];
  const status = String(chosen.offer_status || "").toLowerCase();
  if (BOOKABLE_STATUSES.has(status) || chosen.is_candidate === true) {
    return chosen;
  }
  return null;
}

/** Columns added by 20260828_booking_price_confirmation_notify_tracking.sql. */
const NOTIFY_TRACKING_COLUMNS =
  "price_confirmation_last_notified_at, price_confirmation_notify_error";

const APPLICATION_COLUMNS_BASE =
  "id, applicant_id, offer_status, hire_id, guide_price, price_confirmation_status, " +
  "price_confirmation_requested_at, quoted_guide_price_at_request, is_candidate, " +
  "is_finalist, submitted_at";

const APPLICATION_COLUMNS = `${APPLICATION_COLUMNS_BASE}, ${NOTIFY_TRACKING_COLUMNS}`;

/** PostgREST reports an unknown column this way, including while its schema cache is stale. */
function isMissingNotifyTrackingColumn(error: { message?: string } | null): boolean {
  const message = error?.message || "";
  return (
    /price_confirmation_last_notified_at|price_confirmation_notify_error/.test(message) ||
    /schema cache/i.test(message)
  );
}

/**
 * Load this job's applications, degrading if the notify-tracking columns are not visible yet.
 *
 * Adding them to the select with no fallback took the whole route down with a 500 the moment
 * the schema was behind the deploy — including when the columns exist but PostgREST has not
 * reloaded its cache. Seven of those in production on 28 Aug, every one an advisor pressing
 * the green button and getting nothing back. Without the columns the cooldown simply reads as
 * "never notified", which errs towards letting the advisor send.
 */
async function fetchJobApplications(
  supabase: SupabaseClient,
  jobId: string
): Promise<{ data: ApplicationRow[] | null; error: { message?: string } | null }> {
  const full = await supabase
    .from("job_applications")
    .select(APPLICATION_COLUMNS)
    .eq("job_id", jobId);

  if (!full.error) {
    return { data: (full.data || []) as unknown as ApplicationRow[], error: null };
  }
  if (!isMissingNotifyTrackingColumn(full.error)) {
    return { data: null, error: full.error };
  }

  warnBooking("advisor.request.notify_columns_unavailable", {
    jobId,
    dbError: full.error.message,
    hint: "Run 20260828_booking_price_confirmation_notify_tracking.sql, then reload the PostgREST schema cache (NOTIFY pgrst, 'reload schema').",
  });

  const fallback = await supabase
    .from("job_applications")
    .select(APPLICATION_COLUMNS_BASE)
    .eq("job_id", jobId);

  return {
    data: fallback.error ? null : ((fallback.data || []) as unknown as ApplicationRow[]),
    error: fallback.error,
  };
}


/**
 * Email the guide the "confirm this tour's price" link. Shared by request and resend.
 *
 * Awaited, not fire-and-forget: the advisor is shown the outcome, so we may not report a
 * send we have not seen succeed. `fallback` (SMTP not configured) is NOT a delivery — it
 * must not start the resend cooldown or the advisor gets locked out of a working retry.
 */
async function emailGuidePriceConfirmationRequest(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    jobName: string;
    itineraryId: string | null;
    agentId: string;
    guideId: string;
    quoted: number | null;
    resend: boolean;
  }
): Promise<{ emailSent: boolean; confirmUrl: string; notifyError: string | null }> {
  const { jobId, jobName, itineraryId, agentId, guideId, quoted, resend } = args;
  const step = resend ? "advisor.resend" : "advisor.request";
  const confirmUrl = getGuideConfirmBookingLoginDeepLinkUrl(jobId);

  const [{ data: agentUser }, { data: guideUser }, { data: itinerary }] = await Promise.all([
    supabase.from("users").select("first_name, last_name").eq("id", agentId).maybeSingle(),
    supabase.from("users").select("first_name, last_name, email").eq("id", guideId).maybeSingle(),
    itineraryId
      ? supabase.from("itineraries").select("name").eq("id", itineraryId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const agentName =
    [agentUser?.first_name, agentUser?.last_name].filter(Boolean).join(" ").trim() ||
    "Travel advisor";
  const guideName =
    [guideUser?.first_name, guideUser?.last_name].filter(Boolean).join(" ").trim() || "Guide";
  const guideEmail = (guideUser as { email?: string } | null)?.email;

  if (!guideEmail) {
    warnBooking(`${step}.guide_no_email`, { jobId, guideId });
    return {
      emailSent: false,
      confirmUrl,
      notifyError: GUIDE_HAS_NO_EMAIL,
    };
  }

  try {
    const result = await sendGuideConfirmBookingPriceEmail({
      toEmail: guideEmail,
      guideName,
      agentName,
      jobName,
      jobId,
      itineraryId,
      itineraryName: (itinerary as { name?: string } | null)?.name ?? null,
      quotedPriceLabel: formatYen(quoted),
    });

    if (result.ok && !("fallback" in result && result.fallback)) {
      logBooking(`${step}.email_sent`, {
        jobId,
        guideId,
        guideEmail,
        confirmUrl,
        messageId: (result as { messageId?: string }).messageId ?? null,
      });
      return { emailSent: true, confirmUrl, notifyError: null };
    }

    const reason = "fallback" in result && result.fallback ? "smtp_not_configured" : "send_failed";
    warnBooking(`${step}.email_skipped`, { jobId, guideId, guideEmail, reason });
    return { emailSent: false, confirmUrl, notifyError: reason };
  } catch (e) {
    errorBooking(`${step}.email_failed`, e, { jobId, guideId, guideEmail });
    return {
      emailSent: false,
      confirmUrl,
      notifyError: e instanceof Error ? e.message : "send_failed",
    };
  }
}

/** Persist what actually happened, so the next resend's cooldown is based on delivery. */
async function recordNotifyOutcome(
  supabase: SupabaseClient,
  applicationId: string,
  outcome: { emailSent: boolean; notifyError: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("job_applications")
    .update(
      outcome.emailSent
        ? {
            price_confirmation_last_notified_at: new Date().toISOString(),
            price_confirmation_notify_error: null,
          }
        : { price_confirmation_notify_error: outcome.notifyError }
    )
    .eq("id", applicationId);

  // Column missing until 20260828_… runs. The email still went out, so this must not fail
  // the request — but it does mean the cooldown falls back to "never notified".
  if (error) {
    warnBooking("advisor.notify_tracking_update_failed", {
      applicationId,
      dbError: error.message,
    });
  }
}

/** Advisor-facing copy for a request the guide can never receive. */
function notifyFailureMessage(notifyError: string | null): string {
  if (notifyError === GUIDE_HAS_NO_EMAIL) {
    return "Request saved, but this guide has no email address on file — message them in chat instead.";
  }
  if (notifyError === "smtp_not_configured") {
    return "Request saved, but email is not configured on this environment — the guide was not notified.";
  }
  return "Request saved, but the email to the guide could not be sent. Try again, or message them in chat.";
}

/** The `jobs` columns this route selects; participant fields feed the library price snapshot. */
type JobRowForBooking = {
  id: string;
  name?: string | null;
  created_by?: string | null;
  itinerary_id?: string | null;
  tour_id?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  group_size?: number | null;
};

/**
 * Re-notify the guide about a request that is already pending.
 *
 * Reached two ways: the explicit "Resend request" menu item, and the advisor pressing
 * Confirm booking again on a row still showing "Awaiting guide". The second used to be a
 * silent no-op that reported success and sent nothing, which is why advisors concluded the
 * only way to reach a guide was to delete the tour and re-add it from the library.
 */
async function resendPriceConfirmation(
  supabase: SupabaseClient,
  args: {
    job: JobRowForBooking;
    application: ApplicationRow;
    guideId: string;
    actorId: string;
    /** false when the advisor pressed Confirm booking again rather than the menu item */
    explicit: boolean;
  }
): Promise<NextResponse> {
  const { job, application, guideId, actorId, explicit } = args;
  const jobId = job.id;

  // Cooldown runs from the last *delivered* email. A request whose email never landed has no
  // last_notified_at, so the advisor can retry immediately instead of waiting out a timer for
  // a message that was never sent.
  const lastNotifiedMs = application.price_confirmation_last_notified_at
    ? new Date(application.price_confirmation_last_notified_at).getTime()
    : 0;
  const elapsed = Date.now() - lastNotifiedMs;
  if (Number.isFinite(lastNotifiedMs) && lastNotifiedMs > 0 && elapsed < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    logBooking("advisor.resend.cooldown", {
      jobId,
      applicationId: application.id,
      guideId,
      retryAfterSeconds,
      explicit,
    });
    return ok({
      pendingPriceConfirmation: true,
      cooldown: true,
      retryAfterSeconds,
      lastNotifiedAt: application.price_confirmation_last_notified_at ?? null,
      message: `The guide was already emailed a moment ago. You can nudge them again in ${Math.ceil(
        retryAfterSeconds / 60
      )} min.`,
    });
  }

  const quoted =
    (await snapshotLibraryGuidePrice(supabase, job)) ??
    (application.guide_price != null && Number.isFinite(Number(application.guide_price))
      ? Math.round(Number(application.guide_price))
      : null);

  const { error: resendErr } = await supabase
    .from("job_applications")
    .update({
      price_confirmation_requested_at: new Date().toISOString(),
      quoted_guide_price_at_request: quoted,
    })
    .eq("id", application.id);

  if (resendErr) {
    errorBooking("advisor.resend.db_update_failed", resendErr, {
      jobId,
      applicationId: application.id,
    });
    return serverError("Could not update this booking request.");
  }

  const { emailSent, notifyError } = await emailGuidePriceConfirmationRequest(supabase, {
    jobId,
    jobName: job.name ?? "Tour",
    itineraryId: job.itinerary_id ?? null,
    agentId: job.created_by as string,
    guideId,
    quoted,
    resend: true,
  });
  await recordNotifyOutcome(supabase, application.id, { emailSent, notifyError });

  logBooking("advisor.resend.success", {
    jobId,
    itineraryId: job.itinerary_id ?? null,
    applicationId: application.id,
    guideId,
    actorId,
    quotedPrice: quoted,
    emailSent,
    notifyError,
    explicit,
  });

  return ok({
    pendingPriceConfirmation: true,
    resent: true,
    emailSent,
    notifyError,
    message: emailSent
      ? "Reminder sent to the guide."
      : notifyFailureMessage(notifyError),
  });
}

/**
 * POST /api/jobs/confirm-booking
 * Advisor (or admin on their behalf): request the assigned guide to confirm this tour's live price.
 * Booking is not official until the guide confirms (see confirm-booking-price).
 * Body: { job_id: string, application_id?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) {
      warnBooking("advisor.request.unauthenticated", {});
      return session.response;
    }
    const { role, isAdmin, userId } = session.actor;

    logBooking("advisor.request.start", {
      actorId: userId,
      actorRole: role,
      isAdmin,
    });

    if (role !== "agent" && role !== "agency" && !isAdmin) {
      warnBooking("advisor.request.forbidden_role", { actorRole: role, actorId: userId });
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only the travel advisor (or Pagoda admin on their behalf) can request booking confirmation.",
        },
        { status: 403 }
      );
    }

    const parsedBody = await parseJsonObject(req);
    if (!parsedBody.ok) {
      warnBooking("advisor.request.invalid_body", { actorId: userId });
      return badRequest(parsedBody.error);
    }
    const body = parsedBody.value;

    const parsedJobId = requireString(body.job_id, "job_id");
    if (!parsedJobId.ok) {
      warnBooking("advisor.request.missing_job_id", { actorId: userId });
      return badRequest(parsedJobId.error);
    }
    const jobId = parsedJobId.value;

    const parsedAction = parseEnum(
      body.action,
      CONFIRM_BOOKING_ACTIONS,
      "action",
      "request"
    );
    if (!parsedAction.ok) {
      warnBooking("advisor.request.invalid_action", {
        jobId,
        action: String(body.action ?? ""),
        actorId: userId,
      });
      return badRequest(parsedAction.error);
    }
    const action = parsedAction.value;
    const applicationId = optionalString(body.application_id);

    if (action === "mark_booked" && !isAdmin) {
      warnBooking("admin.mark_booked.forbidden", { jobId, actorId: userId, actorRole: role });
      return NextResponse.json(
        { ok: false, error: "Only a Pagoda admin can mark a tour as booked on the guide’s behalf." },
        { status: 403 }
      );
    }

    logBooking("advisor.request.job", {
      jobId,
      action,
      applicationId: applicationId ?? null,
      actorId: userId,
    });

    const supabase = getSupabaseServer();
    const activityBlock = await denyActivityUnlessAdmin(session.actor, supabase);
    if (activityBlock) return activityBlock;

    const jobAccess = await assertJobItineraryAccess(
      supabase,
      session.actor,
      jobId,
      "write"
    );
    if (!jobAccess.ok) {
      warnBooking("advisor.request.access_denied", { jobId, actorId: userId });
      return jobAccess.response;
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        "id, name, created_by, itinerary_id, job_available, tour_id, adults, children, infants, group_size"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      warnBooking("advisor.request.job_not_found", { jobId, dbError: jobErr?.message });
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    let application: ApplicationRow | null = null;

    if (applicationId) {
      const all = await fetchJobApplications(supabase, jobId);
      const data = all.error
        ? null
        : (all.data || []).find((row) => row.id === applicationId) ?? null;
      const appErr = all.error;
      if (appErr || !data) {
        return NextResponse.json(
          { ok: false, error: "Guide application not found for this tour." },
          { status: 404 }
        );
      }
      application = data as ApplicationRow;
    } else {
      const { data: apps, error: appsErr } = await fetchJobApplications(supabase, jobId);

      if (appsErr) {
        // The raw Postgres message used to be returned to the browser — which is how an
        // advisor came to see "column job_applications.price_confirmation_last_notified_at
        // does not exist" in the UI. Log the detail, show something actionable.
        errorBooking("advisor.request.applications_query_failed", appsErr, { jobId });
        return serverError("Could not load the guides on this tour. Please try again.");
      }

      const bookable = (apps || []).filter((a) => {
        const row = a as ApplicationRow;
        const status = String(row.offer_status || "").toLowerCase();
        return BOOKABLE_STATUSES.has(status) || row.is_candidate === true;
      }) as ApplicationRow[];

      application = pickBookableApplication(bookable);

      if (!application) {
        warnBooking("advisor.request.no_guide_application", {
          jobId,
          itineraryId: job.itinerary_id ?? null,
          tourId: job.tour_id ?? null,
          bookableCount: bookable.length,
        });
        return NextResponse.json(
          {
            ok: false,
            error:
              "No guide is linked to this tour yet. Remove this line and add it from Agent → Tour Library → Add to itinerary so the guide is linked automatically.",
          },
          { status: 404 }
        );
      }
    }

    const currentStatus = String(application.price_confirmation_status || "").toLowerCase();
    const guideIdOnApp = application.applicant_id as string;

    if (currentStatus === "confirmed" && action !== "cancel") {
      logBooking("advisor.request.already_confirmed", {
        jobId,
        action,
        applicationId: application.id,
        guideId: guideIdOnApp,
      });
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
        message: "This tour is already officially booked.",
      });
    }

    if (action === "cancel") {
      if (currentStatus === "confirmed") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This tour is already officially booked. Use “Remove guide & reopen” if you need to undo it.",
          },
          { status: 400 }
        );
      }
      if (currentStatus !== "requested") {
        return NextResponse.json({
          ok: true,
          canceled: true,
          message: "There is no pending confirmation request for this tour.",
        });
      }

      const { error: cancelErr } = await supabase
        .from("job_applications")
        .update({
          price_confirmation_status: null,
          price_confirmation_requested_at: null,
          quoted_guide_price_at_request: null,
        })
        .eq("id", application.id);

      if (cancelErr) {
        errorBooking("advisor.cancel.db_update_failed", cancelErr, {
          jobId,
          applicationId: application.id,
        });
        return serverError("Could not cancel this booking request. Please try again.");
      }

      logBooking("advisor.cancel.success", {
        jobId,
        itineraryId: job.itinerary_id ?? null,
        applicationId: application.id,
        guideId: guideIdOnApp,
        actorId: userId,
      });

      return NextResponse.json({
        ok: true,
        canceled: true,
        message: "Request canceled. You can send it again whenever you’re ready.",
      });
    }

    if (action === "mark_booked") {
      const libraryPrice = await snapshotLibraryGuidePrice(supabase, job);
      const quotedRaw = application.quoted_guide_price_at_request;
      const quotedAtRequest =
        quotedRaw != null && Number.isFinite(Number(quotedRaw)) ? Math.round(Number(quotedRaw)) : null;
      const bidPrice =
        application.guide_price != null && Number.isFinite(Number(application.guide_price))
          ? Math.round(Number(application.guide_price))
          : null;
      const confirmedPrice = bidPrice ?? quotedAtRequest ?? libraryPrice;

      if (confirmedPrice == null) {
        warnBooking("admin.mark_booked.no_price", {
          jobId,
          applicationId: application.id,
          guideId: guideIdOnApp,
        });
        return NextResponse.json(
          {
            ok: false,
            error:
              "No guide price on file for this tour. Set the guide price first, then mark it booked.",
          },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const finalized = await finalizeOfficialBooking(supabase, {
        jobId,
        applicationId: application.id,
        guideId: guideIdOnApp,
        agentId: job.created_by as string,
        confirmedGuidePrice: confirmedPrice,
        offerAcceptedAt: now,
        extraApplicationUpdates: {
          guide_price: confirmedPrice,
          price_confirmation_status: "confirmed",
          price_confirmed_at: now,
          invoice_requested_at: now,
        },
      });

      if (finalized.error) {
        errorBooking("admin.mark_booked.finalize_failed", new Error(finalized.error), {
          jobId,
          applicationId: application.id,
          guideId: guideIdOnApp,
          confirmedPrice,
        });
        return NextResponse.json({ ok: false, error: finalized.error }, { status: 500 });
      }

      const { clientPrice } = await sendBookingConfirmedNotifications(supabase, {
        jobId,
        jobName: job.name ?? "Tour",
        itineraryId: job.itinerary_id ?? null,
        agentId: job.created_by as string,
        guideId: guideIdOnApp,
        confirmedPrice,
        quotedAtRequest,
        confirmedByRole: "admin",
      });

      logBooking("admin.mark_booked.success", {
        jobId,
        itineraryId: job.itinerary_id ?? null,
        applicationId: application.id,
        guideId: guideIdOnApp,
        actorId: userId,
        confirmedPrice,
        clientPrice,
        historyError: finalized.historyError,
      });

      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
        markedBooked: true,
        message: "Marked as officially booked. The guide has been asked to send Pagoda an invoice.",
      });
    }

    // A pending request is re-notified whether the advisor used "Resend request" or pressed
    // Confirm booking again — both mean "the guide has not answered me".
    if (action === "resend" || currentStatus === "requested") {
      if (action === "resend" && currentStatus !== "requested") {
        return badRequest("There is no pending request to resend for this tour.");
      }
      return resendPriceConfirmation(supabase, {
        job: job as JobRowForBooking,
        application,
        guideId: guideIdOnApp,
        actorId: userId,
        explicit: action === "resend",
      });
    }


    const offerStatus = String(application.offer_status || "").toLowerCase();
    if (
      !BOOKABLE_STATUSES.has(offerStatus) &&
      application.is_candidate !== true
    ) {
      warnBooking("advisor.request.application_not_ready", {
        jobId,
        applicationId: application.id,
        offerStatus,
        isCandidate: Boolean(application.is_candidate),
      });
      return NextResponse.json(
        { ok: false, error: "This application is not ready to book yet." },
        { status: 400 }
      );
    }

    const libraryPrice = await snapshotLibraryGuidePrice(supabase, job);
    const bidPrice =
      application.guide_price != null && Number.isFinite(Number(application.guide_price))
        ? Math.round(Number(application.guide_price))
        : null;
    const quoted = libraryPrice ?? bidPrice;

    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("job_applications")
      .update({
        price_confirmation_status: "requested",
        price_confirmation_requested_at: now,
        quoted_guide_price_at_request: quoted,
      })
      .eq("id", application.id);

    if (updateErr) {
      errorBooking("advisor.request.db_update_failed", updateErr, {
        jobId,
        applicationId: application.id,
      });
      return serverError("Could not save this booking request. Please try again.");
    }

    const guideId = guideIdOnApp;
    const { emailSent, notifyError, confirmUrl } = await emailGuidePriceConfirmationRequest(
      supabase,
      {
        jobId,
        jobName: job.name ?? "Tour",
        itineraryId: job.itinerary_id ?? null,
        agentId: job.created_by as string,
        guideId,
        quoted,
        resend: false,
      }
    );
    await recordNotifyOutcome(supabase, application.id, { emailSent, notifyError });

    logBooking("advisor.request.success", {
      jobId,
      itineraryId: job.itinerary_id ?? null,
      applicationId: application.id,
      guideId,
      quotedPrice: quoted,
      offerStatus: application.offer_status,
      confirmUrl,
      emailSent,
      notifyError,
    });

    return ok({
      pendingPriceConfirmation: true,
      emailSent,
      notifyError,
      message: emailSent
        ? "The guide has been asked to confirm this tour’s current price. The booking is not official until they do."
        : notifyFailureMessage(notifyError),
      application_id: application.id,
      guide_id: guideId,
    });
  } catch (err) {
    errorBooking("advisor.request.unexpected_error", err, {});
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
