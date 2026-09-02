import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { assertCronRequest } from "@/lib/cron-auth";
import { getActiveAdminEmails } from "@/lib/admin-emails";
import { sendAdminNoJobApplicantsNotification } from "@/lib/mailer";

export const runtime = "nodejs";

/**
 * POST /api/jobs/no-applicant-alerts
 * Cron: email admins when a job has zero guide applications 24+ hours after release.
 * Skips jobs already notified (admin_no_applicant_notified_at).
 */
export async function POST(req: NextRequest) {
  try {
    const cronBlock = assertCronRequest(req);
    if (cronBlock) return cronBlock;

    const supabase = getSupabaseServer();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twentyFourHoursFiveMinAgo = new Date(twentyFourHoursAgo.getTime() - 5 * 60 * 1000);

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(
        "id, name, created_by, released_at, itinerary_id, tour_id, admin_no_applicant_notified_at, tour:tour_id(user_id)"
      )
      .eq("is_active", true)
      .eq("job_available", true)
      .not("released_at", "is", null)
      .is("admin_no_applicant_notified_at", null)
      .lte("released_at", twentyFourHoursAgo.toISOString())
      .gte("released_at", twentyFourHoursFiveMinAgo.toISOString());

    if (jobsError) {
      return NextResponse.json({ ok: false, error: jobsError.message }, { status: 500 });
    }

    if (!jobs?.length) {
      return NextResponse.json({ ok: true, message: "No jobs need admin no-applicant alerts", count: 0 });
    }

    const adminEmails = await getActiveAdminEmails();
    const results: { jobId: string; notified: boolean }[] = [];

    for (const job of jobs) {
      const tourOwnerId = (job.tour as { user_id?: string } | null)?.user_id ?? null;

      const { data: applications } = await supabase
        .from("job_applications")
        .select("applicant_id")
        .eq("job_id", job.id);

      const externalApps = (applications || []).filter(
        (a: { applicant_id?: string }) => a.applicant_id && a.applicant_id !== tourOwnerId
      );

      if (externalApps.length > 0) {
        continue;
      }

      const [{ data: agent }, { data: itinerary }] = await Promise.all([
        supabase
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", job.created_by)
          .maybeSingle(),
        job.itinerary_id
          ? supabase.from("itineraries").select("name").eq("id", job.itinerary_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const agentName =
        [agent?.first_name, agent?.last_name].filter(Boolean).join(" ").trim() ||
        agent?.email ||
        "Travel advisor";

      if (adminEmails.length > 0) {
        await sendAdminNoJobApplicantsNotification(adminEmails, {
          jobName: job.name ?? "Job",
          jobId: job.id,
          agentName,
          itineraryName: (itinerary as { name?: string } | null)?.name ?? null,
          hoursSinceRelease: 24,
        });
      }

      await supabase
        .from("jobs")
        .update({ admin_no_applicant_notified_at: now.toISOString() })
        .eq("id", job.id);

      results.push({ jobId: job.id, notified: adminEmails.length > 0 });
    }

    return NextResponse.json({
      ok: true,
      message: "No-applicant admin alerts processed",
      jobsChecked: jobs.length,
      alertsSent: results.filter((r) => r.notified).length,
      results,
    });
  } catch (err) {
    console.error("[jobs/no-applicant-alerts]", err);
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
