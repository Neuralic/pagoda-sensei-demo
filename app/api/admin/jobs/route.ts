import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/admin-auth";
import {
  BOOKING_PROGRESS_LABEL,
  deriveBookingProgress,
  pickLeadingBookingApplication,
} from "@/lib/booking-status";
import {
  DEFAULT_COMMISSION_SETTINGS,
  getAgentDisplayTotalRounded,
} from "@/lib/tour-price";

export const runtime = "nodejs";




type User = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function displayAgentName(u: Pick<User, "first_name" | "last_name" | "email">): string {
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  if (name) return name;
  if (u.email && String(u.email).trim()) return String(u.email).trim();
  return "";
}

type Job = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  [key: string]: unknown;
};

type JobApplication = {
  job_id: string;
  offer_status: string;
  applicant_id?: string | null;
  guide_price?: number | null;
  hire_id?: string | null;
  is_candidate?: boolean | null;
  is_finalist?: boolean | null;
  created_at?: string;
  submitted_at: string;
};

type Panic = {
  ticket_id: string;
  sender_id: string;
};

export async function GET(req: Request) {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);

    /* =======================
       Pagination
    ======================= */
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("perPage") || "10");
    const offset = (page - 1) * perPage;

    /* =======================
       Search
    ======================= */
    const searchQuery = (searchParams.get("search") || "").toLowerCase();
    const userIdFilter = (searchParams.get("userId") || "").trim();
    const guideIdFilter = (searchParams.get("guideId") || "").trim();

    /* =======================
       Filter: weekly / monthly / yearly
    ======================= */
    const filter = searchParams.get("filter") || "all";
    const now = new Date();
    let startDate: string | null = null;

    if (filter === "weekly") {
      const d = new Date(now);
      d.setDate(now.getDate() - 7);
      startDate = d.toISOString();
    } else if (filter === "monthly") {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 1);
      startDate = d.toISOString();
    } else if (filter === "yearly") {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 1);
      startDate = d.toISOString();
    }

    /* =======================
       Step 1: Total count
    ======================= */
    let countQuery = supabase
      .from("jobs")
      .select("*", { count: "exact" });

    if (startDate) {
      countQuery = countQuery.gte("created_at", startDate);
    }
    if (userIdFilter) {
      countQuery = countQuery.eq("created_by", userIdFilter);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    /* =======================
       Step 2: Fetch paginated jobs
    ======================= */
    let jobsQuery = supabase
      .from("jobs")
      .select("*")
      .range(offset, offset + perPage - 1)
      .order("created_at", { ascending: false });

    if (startDate) {
      jobsQuery = jobsQuery.gte("created_at", startDate);
    }
    if (userIdFilter) {
      jobsQuery = jobsQuery.eq("created_by", userIdFilter);
    }

    let { data: jobs, error: jobsError } = await jobsQuery;
    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    // Guide filter: jobs where this guide has applied
    if (guideIdFilter) {
      const { data: guideApps, error: guideAppsErr } = await supabase
        .from("job_applications")
        .select("job_id")
        .eq("applicant_id", guideIdFilter);

      if (guideAppsErr) {
        return NextResponse.json({ error: guideAppsErr.message }, { status: 500 });
      }

      const allowedJobIds = new Set((guideApps ?? []).map((a) => String(a.job_id)));
      jobs = (jobs ?? []).filter((j) => allowedJobIds.has(String(j.id)));
    }

    /* =======================
       Step 3: Fetch users
    ======================= */
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, first_name, last_name, email");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    /* =======================
       Step 4: Fetch panic table
    ======================= */
    const { data: panicList, error: panicError } = await supabase
      .from("panic")
      .select("ticket_id, sender_id");

    if (panicError) {
      return NextResponse.json({ error: panicError.message }, { status: 500 });
    }

    /* =======================
       Step 5: Fetch job applications
    ======================= */
    const { data: jobApplications, error: jobAppError } = await supabase
      .from("job_applications")
      .select(
        "job_id, applicant_id, offer_status, guide_price, hire_id, is_candidate, is_finalist, submitted_at, price_confirmation_status"
      )
      .order("submitted_at", { ascending: false });

    if (jobAppError) {
      return NextResponse.json({ error: jobAppError.message }, { status: 500 });
    }

    /* =======================
       Step 6: Group applications by job_id
    ======================= */
    const jobAppMap: Record<string, JobApplication[]> = {};
    jobApplications.forEach(app => {
      const key = String(app.job_id);
      if (!jobAppMap[key]) {
        jobAppMap[key] = [];
      }
      jobAppMap[key].push(app);
    });

    const guideIds = [
      ...new Set(
        jobApplications
          .map((app) => app.applicant_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];
    const commissionByGuide = new Map<
      string,
      { marketplace: number; agent: number; vat: number }
    >();
    if (guideIds.length > 0) {
      const { data: commissionRows } = await supabase
        .from("guide_commission_settings")
        .select("user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
        .in("user_id", guideIds);
      for (const row of commissionRows ?? []) {
        commissionByGuide.set(String(row.user_id), {
          marketplace:
            Number(row.commission_marketplace_pct) ||
            DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
          agent:
            Number(row.commission_agent_pct) ||
            DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
          vat: Number(row.vat_rate_pct) || DEFAULT_COMMISSION_SETTINGS.vatRatePct,
        });
      }
    }

    /* =======================
       Step 7: Map jobs with statuses
    ======================= */
    let result = (jobs ?? []).map(job => {
      const creatorId = job.created_by != null ? String(job.created_by) : "";
      const user =
        users.find((u) => String(u.id) === creatorId) || null;

      const issueExists = panicList.some(
        p => p.ticket_id === job.id && p.sender_id === job.created_by
      );

      const applications = jobAppMap[String(job.id)] || [];
      const booking_status = deriveBookingProgress({
        applications,
        jobAvailable: job.job_available as boolean | null | undefined,
        isActive: job.is_active as boolean | null | undefined,
      });
      const listing_status =
        job.is_active === false
          ? "inactive"
          : job.job_available === false
            ? "closed"
            : "open";
      const leadApplication = pickLeadingBookingApplication(applications);
      const guidePrice =
        leadApplication?.guide_price != null &&
        Number.isFinite(Number(leadApplication.guide_price))
          ? Number(leadApplication.guide_price)
          : null;
      const guideId = leadApplication?.applicant_id
        ? String(leadApplication.applicant_id)
        : null;
      const commission = guideId ? commissionByGuide.get(guideId) : null;
      const customerPrice =
        guidePrice != null
          ? getAgentDisplayTotalRounded(
              guidePrice,
              commission?.marketplace ??
                DEFAULT_COMMISSION_SETTINGS.commissionMarketplacePct,
              commission?.agent ?? DEFAULT_COMMISSION_SETTINGS.commissionAgentPct,
              commission?.vat ?? DEFAULT_COMMISSION_SETTINGS.vatRatePct
            )
          : null;

      return {
        ...job,
        job_name: job.name || "",
        created_by_name: user ? displayAgentName(user) : "",
        created_by_email: user?.email ? String(user.email) : null,
        issueExists,
        // Compatibility alias for older admin consumers.
        job_status: listing_status,
        listing_status,
        booking_status,
        booking_status_label: BOOKING_PROGRESS_LABEL[booking_status],
        bids_count: applications.length,
        guide_price: guidePrice,
        customer_price: customerPrice,
      };
    });

    /* =======================
       Step 8: Search by job name
    ======================= */
    if (searchQuery) {
      result = result.filter((item) => {
        const name = String((item as { created_by_name?: string }).created_by_name || "").toLowerCase();
        const email = String((item as { created_by_email?: string | null }).created_by_email || "").toLowerCase();
        return (
          item.job_name.toLowerCase().includes(searchQuery) ||
          name.includes(searchQuery) ||
          email.includes(searchQuery)
        );
      });
    }

    /* =======================
       Step 9: Response
    ======================= */
    return NextResponse.json({
      success: true,
      page,
      perPage,
      total: count || 0,
      booking: result,
    });

  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}