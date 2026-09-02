import type { SupabaseClient } from "@supabase/supabase-js";
import { hideJobFromBoard } from "@/lib/job-board-db";
import { errorBooking } from "@/lib/booking-flow-log";

/**
 * Mark the application as officially booked and hide the job from the board.
 *
 * `historyError` is non-fatal for the booking itself, but it means dashboards,
 * guide stats, sold counts and pending reviews will not see this hire.
 */
export async function finalizeOfficialBooking(
  supabase: SupabaseClient,
  opts: {
    jobId: string;
    applicationId: string;
    guideId: string;
    agentId: string;
    /** Guide net price at booking — required for `job_hiring_history.final_price` (NOT NULL). */
    confirmedGuidePrice: number;
    offerAcceptedAt?: string;
    extraApplicationUpdates?: Record<string, unknown>;
  }
): Promise<{ error: string | null; historyError: string | null }> {
  const { error: updateAppErr } = await supabase
    .from("job_applications")
    .update({
      offer_status: "completed",
      hire_id: opts.guideId,
      is_candidate: true,
      ...(opts.extraApplicationUpdates || {}),
    })
    .eq("id", opts.applicationId);

  if (updateAppErr) {
    return { error: updateAppErr.message, historyError: null };
  }

  await hideJobFromBoard(supabase, opts.jobId, "hired");

  const { data: existingHistory } = await supabase
    .from("job_hiring_history")
    .select("id")
    .eq("job_id", opts.jobId)
    .eq("is_closed", false)
    .maybeSingle();

  if (existingHistory) {
    return { error: null, historyError: null };
  }

  const finalPrice = Math.round(Number(opts.confirmedGuidePrice));
  if (!Number.isFinite(finalPrice) || finalPrice < 0) {
    const message = "confirmedGuidePrice is required to record hiring history";
    errorBooking("finalize.hiring_history_missing_price", new Error(message), {
      jobId: opts.jobId,
      applicationId: opts.applicationId,
    });
    return { error: null, historyError: message };
  }

  const offerAcceptedAt =
    typeof opts.offerAcceptedAt === "string" && opts.offerAcceptedAt.trim()
      ? opts.offerAcceptedAt
      : new Date().toISOString();

  const { error: histErr } = await supabase.from("job_hiring_history").insert({
    job_id: opts.jobId,
    application_id: opts.applicationId,
    agent_id: opts.agentId,
    guide_id: opts.guideId,
    final_price: finalPrice,
    offer_accepted_at: offerAcceptedAt,
    is_closed: false,
  });

  if (histErr) {
    errorBooking("finalize.hiring_history_insert_failed", histErr, {
      jobId: opts.jobId,
      applicationId: opts.applicationId,
      guideId: opts.guideId,
      agentId: opts.agentId,
    });
    return { error: null, historyError: histErr.message };
  }

  return { error: null, historyError: null };
}
