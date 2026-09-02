import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { sendJobReleasedNotificationEmail } from "@/lib/mailer";
import { isDeliverableUserEmail } from "@/lib/admin-account-type";
import { assertCronRequest } from "@/lib/cron-auth";
import { bookingLog } from "@/lib/ops-log";
import { isMissingColumnError, migrationRequired } from "@/lib/api-response";

/**
 * POST /api/jobs/release-notifications
 * Check for jobs that have passed the 24-hour window and send notifications
 * This should be called by a scheduled job/cron
 */
export async function POST(req: NextRequest) {
  try {
    // This sends email to guides; it ran unauthenticated.
    const cronBlock = assertCronRequest(req);
    if (cronBlock) return cronBlock;

    const supabase = getSupabaseServer();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Tours whose 24-hour exclusive window has closed and that have not been broadcast yet.
    // This used to bound the upper edge at `now - 5 minutes` instead of `now - 24 hours`, which
    // matched everything released in the past day — a tour released ten minutes ago would have
    // been opened to every guide immediately, skipping the owner's exclusive day entirely.
    //
    // guides_notified_at is what stops a repeat; the seven-day floor just keeps the scan small
    // and stops a forgotten row waking up months later.
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all tour library jobs that were released 24 hours ago
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, name, tour_id, released_at, created_by, guides_notified_at, tour:tour_id(user_id)")
      .not("tour_id", "is", null)
      .not("released_at", "is", null)
      .is("guides_notified_at", null)
      .gte("released_at", sevenDaysAgo.toISOString())
      .lte("released_at", twentyFourHoursAgo.toISOString());

    if (jobsError) {
      bookingLog.error("release.fetch_failed", jobsError, {});
      if (isMissingColumnError(jobsError, "guides_notified_at")) {
        // Without the dedup column every run would re-broadcast the same tours to every guide.
        return migrationRequired(
          "20260831_job_release_notification_tracking.sql",
          "Guide broadcast is not configured: the database cannot record which tours have already been sent."
        );
      }
      return NextResponse.json(
        { ok: false, error: "Could not load tours to broadcast." },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No jobs to notify about",
        count: 0,
      });
    }

    // Check which jobs already have notifications sent (to avoid duplicates)
    // We'll use a simple approach: check if any guide (other than tour owner) has applied
    // If yes, notification was likely already sent or job is open
    const notificationResults = [];

    for (const job of jobs) {
      try {
        const tourOwnerId = (job.tour as any)?.user_id;
        if (!tourOwnerId) continue;

        // Check if any guide other than tour owner has applied
        const { data: otherApplications } = await supabase
          .from("job_applications")
          .select("id")
          .eq("job_id", job.id)
          .neq("applicant_id", tourOwnerId)
          .limit(1);

        // If others have already applied, skip notification (job is already open)
        if (otherApplications && otherApplications.length > 0) {
          continue;
        }

        // Get all guides (excluding tour owner) to notify
        // For now, we'll notify all guides with role 'guide'
        // In production, you might want to filter by location or other criteria
        const { data: guides } = await supabase
          .from("users")
          .select("id, email, first_name, last_name")
          .eq("role", "guide")
          .neq("id", tourOwnerId);

        // Skip managed-guide placeholders (@managed.pagoda.local) — they bounce as spam
        const deliverableGuides = (guides ?? []).filter((g) =>
          isDeliverableUserEmail(g.email)
        );

        if (deliverableGuides.length === 0) continue;

        // Get agent name
        const { data: agent } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", job.created_by)
          .single();

        const agentName = agent
          ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "Agent"
          : "Agent";

        // Send notifications to guides with real emails only.
        const sends = await Promise.all(
          deliverableGuides.map(async (guide) => {
            const guideName =
              `${guide.first_name || ""} ${guide.last_name || ""}`.trim() || "Guide";
            try {
              const res = await sendJobReleasedNotificationEmail(
                guide.email,
                guideName,
                job.name,
                agentName
              );
              return res?.ok !== false;
            } catch (err) {
              // Guide id, never the address — these lines are grepped during incidents.
              bookingLog.error("release.guide_email_failed", err, {
                jobId: job.id,
                guideId: guide.id,
              });
              return false;
            }
          })
        );

        const sent = sends.filter(Boolean).length;

        if (sent === 0) {
          // Leave it unstamped so the next run retries rather than silently dropping the tour.
          bookingLog.error(
            "release.broadcast_failed",
            new Error("no guide could be emailed"),
            { jobId: job.id, guideCount: deliverableGuides.length }
          );
          continue;
        }

        // Stamp only once at least one guide has actually been told, and only after the send —
        // this column is the sole thing standing between one broadcast and one per cron tick.
        const { error: stampErr } = await supabase
          .from("jobs")
          .update({ guides_notified_at: new Date().toISOString() })
          .eq("id", job.id);

        if (stampErr) {
          // Worth shouting about: unstamped means these guides get emailed again next run.
          bookingLog.error("release.stamp_failed", stampErr, {
            jobId: job.id,
            notificationsSent: sent,
          });
        }

        bookingLog.info("release.broadcast_sent", {
          jobId: job.id,
          notificationsSent: sent,
          guideCount: deliverableGuides.length,
        });

        notificationResults.push({
          jobId: job.id,
          jobName: job.name,
          notificationsSent: sent,
        });
      } catch (error) {
        bookingLog.error("release.job_failed", error, { jobId: job.id });
      }
    }

    
    return NextResponse.json({
      ok: true,
      message: "Release notifications processed",
      jobsProcessed: notificationResults.length,
      results: notificationResults,
    });
  } catch (err) {
    bookingLog.error("release.unhandled", err, {});
    return NextResponse.json(
      { ok: false, error: "Server error while processing notifications" },
      { status: 500 }
    );
  }
}


/**
 * Vercel Cron invokes scheduled paths with GET, so the schedule cannot reach a POST-only
 * handler. Same work, same CRON_SECRET check — the method is the scheduler's choice, not ours.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
