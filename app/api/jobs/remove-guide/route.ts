import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { isJobPastByStartTime } from "@/lib/job-board-visibility";
import { reopenJobOnBoard } from "@/lib/job-board-db";
import { requireSessionActor } from "@/lib/itinerary-access";

export const runtime = "nodejs";

const RESETTABLE_STATUSES = new Set(["accepted", "completed", "hired", "candidate", "offered"]);

/**
 * POST /api/jobs/remove-guide
 * Agent removes the hired/accepted guide so the job can be bid on again.
 * Body: { job_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;
    const { userId, role } = session.actor;
    if (role !== "agent" && role !== "agency") {
      return NextResponse.json({ ok: false, error: "Only agents can remove a guide" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { job_id?: string };
    const jobId = body.job_id?.trim();
    if (!jobId) {
      return NextResponse.json({ ok: false, error: "job_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) return activityBlock;

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, name, created_by, start_time")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    if (job.created_by !== userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (isJobPastByStartTime((job as { start_time?: string }).start_time)) {
      return NextResponse.json(
        { ok: false, error: "This tour date has passed; the job cannot be reopened for bidding." },
        { status: 400 }
      );
    }

    const { data: applications, error: appsErr } = await supabase
      .from("job_applications")
      .select("id, applicant_id, offer_status, hire_id")
      .eq("job_id", jobId);

    if (appsErr) {
      return NextResponse.json({ ok: false, error: appsErr.message }, { status: 500 });
    }

    const committed = (applications || []).filter((a) => {
      const status = String(a.offer_status ?? "");
      return (
        status === "accepted" ||
        status === "completed" ||
        status === "hired" ||
        (typeof a.hire_id === "string" && a.hire_id.length > 0)
      );
    });

    if (committed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hired or accepted guide found for this job" },
        { status: 400 }
      );
    }

    const committedIds = committed.map((a) => a.id as string);

    const { error: resetErr } = await supabase
      .from("job_applications")
      .update({
        offer_status: "pending",
        hire_id: null,
        is_candidate: false,
        pickup_date: null,
        pickup_time: null,
        pickup_location: null,
        guide_display_name: null,
        guide_whatsapp: null,
        fulfillment_submitted_at: null,
        price_confirmation_status: null,
        price_confirmation_requested_at: null,
        price_confirmed_at: null,
        invoice_requested_at: null,
        quoted_guide_price_at_request: null,
      })
      .in("id", committedIds);

    if (resetErr) {
      return NextResponse.json({ ok: false, error: resetErr.message }, { status: 500 });
    }

    // Reset other applications that were blocked by offer flow back to pending if needed
    const otherOffered = (applications || []).filter(
      (a) => !committedIds.includes(a.id as string) && RESETTABLE_STATUSES.has(String(a.offer_status ?? ""))
    );
    if (otherOffered.length > 0) {
      await supabase
        .from("job_applications")
        .update({ offer_status: "pending", is_candidate: false })
        .in(
          "id",
          otherOffered.map((a) => a.id as string)
        );
    }

    await supabase
      .from("job_hiring_history")
      .update({ is_closed: true })
      .eq("job_id", jobId)
      .eq("is_closed", false);

    const { error: reopenErr } = await reopenJobOnBoard(supabase, jobId);
    if (reopenErr) {
      return NextResponse.json({ ok: false, error: reopenErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Guide removed. This job is open for bidding again.",
    });
  } catch (err) {
    console.error("[jobs/remove-guide]", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
