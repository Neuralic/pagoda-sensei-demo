import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { assertCronRequest } from "@/lib/cron-auth";
import { isJobPastByStartTime } from "@/lib/job-board-visibility";
import { hideJobFromBoard } from "@/lib/job-board-db";

export const runtime = "nodejs";

/**
 * POST /api/jobs/sync-board-visibility
 * Cron: hide past-date jobs from the guide job board (job_available=false, not deleted).
 */
export async function POST(req: NextRequest) {
  try {
    const cronBlock = assertCronRequest(req);
    if (cronBlock) return cronBlock;

    const supabase = getSupabaseServer();
    const nowIso = new Date().toISOString();

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, start_time, job_available, board_hidden_reason")
      .eq("is_active", true)
      .eq("job_available", true)
      .lt("start_time", nowIso)
      .limit(500);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let updated = 0;
    for (const job of jobs || []) {
      if (!isJobPastByStartTime((job as { start_time?: string }).start_time)) continue;
      const { error: updErr } = await hideJobFromBoard(supabase, job.id as string, "past_date");
      if (!updErr) updated++;
    }

    return NextResponse.json({
      ok: true,
      message: `Marked ${updated} past job(s) as hidden from the job board.`,
      count: updated,
    });
  } catch (err) {
    console.error("[jobs/sync-board-visibility]", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * Vercel Cron invokes scheduled paths with GET, so the schedule cannot reach a POST-only
 * handler. Same work, same CRON_SECRET check — the method is the scheduler's choice, not ours.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
