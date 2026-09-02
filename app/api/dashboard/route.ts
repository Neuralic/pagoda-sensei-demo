import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = 'nodejs';

/**
 * GET /api/dashboard
 * Get dashboard statistics for admin panel
 * Returns: user counts, job counts, application counts
 */
export async function GET() {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServer();

  try {
    /* =======================
       1️⃣ Fetch users
    ======================= */
    const { data: users, error: userError } = await supabase
      .from("users")
      .select(
        "id, email, first_name, last_name, is_verified, role, is_active, created_at, is_operator, managed_by_operator_id, guide_approved"
      );

    if (userError) throw userError;

    /* =======================
       2️⃣ Fetch profiles
    ======================= */
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, profile_picture_path");

    if (profileError) throw profileError;

    /* =======================
       3️⃣ Merge users + profile image
    ======================= */
    const userList = users.map(user => {
      const profile = profiles.find(p => p.user_id === user.id);
      return {
        ...user,
        profile_image: profile?.profile_picture_path || null,
      };
    });

    /* =======================
       4️⃣ Separate roles / account types
    ======================= */
    const guides = userList.filter(u => u.role === "guide");
    const agencies = userList.filter(u => u.role === "agent");
    const operators = guides.filter(
      (u) => (u as { is_operator?: boolean }).is_operator === true
    );
    const managedGuides = guides.filter(
      (u) => Boolean((u as { managed_by_operator_id?: string | null }).managed_by_operator_id)
    );
    const independentGuides = guides.filter(
      (u) =>
        !(u as { is_operator?: boolean }).is_operator &&
        !(u as { managed_by_operator_id?: string | null }).managed_by_operator_id
    );

    /* =======================
       5️⃣ Fetch all jobs
    ======================= */
    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("id, created_at, is_active");

    if (jobError) throw jobError;

    // Filter to only active jobs
    const activeJobs = jobs?.filter(job => job.is_active !== false) || [];

    /* =======================
       6️⃣ Fetch job hiring history
       (to determine booked vs open jobs)
    ======================= */
    const { data: hiringHistory, error: historyError } = await supabase
      .from("job_hiring_history")
      .select("job_id, is_closed");

    if (historyError) throw historyError;

    // Get job IDs with hiring history (booked jobs)
    const bookedJobIds = new Set(
      (hiringHistory || [])
        .filter(h => !h.is_closed) // Only count non-closed hiring history
        .map(h => h.job_id)
        .filter((id): id is string => Boolean(id))
    );

    // Get job IDs that are closed
    const closedJobIds = new Set(
      (hiringHistory || [])
        .filter(h => h.is_closed === true)
        .map(h => h.job_id)
        .filter((id): id is string => Boolean(id))
    );

    /* =======================
       7️⃣ Calculate booked vs open jobs
       - Booked: Jobs with hiring history that is NOT closed
       - Open: Jobs without hiring history OR with closed hiring history
    ======================= */
    const bookedJobs = bookedJobIds.size;
    const openJobs = activeJobs.filter(
      job => !bookedJobIds.has(job.id)
    ).length;

    /* =======================
       8️⃣ Fetch job applications
       (using offer_status instead of status)
    ======================= */
    const { data: applications, error: appError } = await supabase
      .from("job_applications")
      .select("id, job_id, offer_status");

    if (appError) throw appError;

    /* =======================
       9️⃣ Count applications per job
    ======================= */
    const applicationCountByJob: Record<string, number> = {};

    (applications || []).forEach(app => {
      applicationCountByJob[app.job_id] =
        (applicationCountByJob[app.job_id] || 0) + 1;
    });

    /* =======================
       🔟 Application status count
       (using offer_status)
    ======================= */
    const statusCount = {
      pending: 0,
      offered: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
    };

    (applications || []).forEach(app => {
      const status = app.offer_status;
      if (status === "pending") statusCount.pending++;
      else if (status === "offered") statusCount.offered++;
      else if (status === "accepted") statusCount.accepted++;
      else if (status === "rejected") statusCount.rejected++;
      else if (status === "completed") statusCount.completed++;
    });

    /* =======================
       1️⃣1️⃣ Totals
    ======================= */
    const totalJobs = activeJobs.length;
    const totalApplications = applications?.length || 0;

    const pendingApprovalUsers = userList.filter(
      (u) =>
        (u.role === "agent" || u.role === "guide") &&
        (u as { guide_approved?: boolean | null }).guide_approved !== true
    );
    const pendingApprovalAgents = pendingApprovalUsers.filter((u) => u.role === "agent").length;
    const pendingApprovalGuides = pendingApprovalUsers.filter((u) => u.role === "guide").length;

    const twentyFourHoursAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleOpenJobs } = await supabase
      .from("jobs")
      .select("id, tour_id, released_at, tour:tour_id(user_id)")
      .eq("is_active", true)
      .eq("job_available", true)
      .not("released_at", "is", null)
      .lte("released_at", twentyFourHoursAgoIso);

    let jobsNoApplicants24h = 0;
    if (staleOpenJobs?.length) {
      const staleIds = staleOpenJobs.map((j) => j.id);
      const { data: staleApps } = await supabase
        .from("job_applications")
        .select("job_id, applicant_id")
        .in("job_id", staleIds);

      const appsByJob: Record<string, string[]> = {};
      for (const a of staleApps || []) {
        const jid = (a as { job_id?: string }).job_id;
        const aid = (a as { applicant_id?: string }).applicant_id;
        if (!jid || !aid) continue;
        if (!appsByJob[jid]) appsByJob[jid] = [];
        appsByJob[jid].push(aid);
      }

      for (const j of staleOpenJobs) {
        const tourOwnerId = (j.tour as { user_id?: string } | null)?.user_id ?? null;
        const apps = appsByJob[j.id] || [];
        const external = apps.filter((aid) => aid !== tourOwnerId);
        if (external.length === 0) jobsNoApplicants24h++;
      }
    }

    /* =======================
       1️⃣2️⃣ Attach apply count to jobs
    ======================= */
    const jobsWithApplyCount = activeJobs.map(job => ({
      ...job,
      apply_count: applicationCountByJob[job.id] || 0,
    }));

    /* =======================
       1️⃣3️⃣ Final response
    ======================= */
    return NextResponse.json({
      ok: true,
      counts: {
        totalGuides: guides.length,
        totalAgencies: agencies.length,
        totalOperators: operators.length,
        totalManagedGuides: managedGuides.length,
        totalIndependentGuides: independentGuides.length,
        totalJobs,
        totalApplications,
        bookedJobs,
        openJobs,
        applicationStatus: statusCount,
        pendingApprovalTotal: pendingApprovalUsers.length,
        pendingApprovalAgents,
        pendingApprovalGuides,
        jobsNoApplicants24h,
      },
      guides,
      agencies,
      jobs: jobsWithApplyCount,
    });

  } catch (error) {
    console.error("Admin dashboard API error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
