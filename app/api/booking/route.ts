import { NextResponse } from "next/server";
import { requireSessionActor } from "@/lib/itinerary-access";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";


export async function GET(req: Request) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("perPage") || "10");
    const offset = (page - 1) * perPage;

    // Search
    const searchQuery = (searchParams.get("search") || "").toLowerCase();

    // Filter: weekly / monthly / yearly
    const filter = searchParams.get("filter") || "all";

    // Determine start date for filter
    const now = new Date();
    let startDate: string | null = null;

    if (filter === "weekly") {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      startDate = weekAgo.toISOString();
    } else if (filter === "monthly") {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      startDate = monthAgo.toISOString();
    } else if (filter === "yearly") {
      const yearAgo = new Date(now);
      yearAgo.setFullYear(now.getFullYear() - 1);
      startDate = yearAgo.toISOString();
    }

    // Step 1: Get total count (for pagination)
    let countQuery = supabase.from("job_applications").select("*", { count: "exact" });

    if (startDate) {
      countQuery = countQuery.gte("submitted_at", startDate);
    }

    const { count, error: countError } = await countQuery;
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

    // Step 2: Fetch paginated applications
    let query = supabase.from("job_applications").select("*").range(offset, offset + perPage - 1);

    if (startDate) {
      query = query.gte("submitted_at", startDate);
    }

    const { data: applications, error: appError } = await query;
    if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });

    // Step 3: Fetch all jobs and users
    const { data: jobs, error: jobsError } = await supabase.from("jobs").select("id,name");
    const { data: users, error: usersError } = await supabase.from("users").select("id,first_name");

    if (jobsError || usersError)
      return NextResponse.json({ error: jobsError?.message || usersError?.message }, { status: 500 });

    // Step 4: Fetch panic table
    const { data: panicList, error: panicError } = await supabase.from("panic").select("ticket_id, sender_id");
    if (panicError) return NextResponse.json({ error: panicError.message }, { status: 500 });

    // Step 5: Map applications with job, user, and issueExists
    let result = applications.map((app) => {
      const job = jobs.find((j) => j.id === app.job_id) || null;
      const user = users.find((u) => u.id === app.applicant_id) || null;

      const issueExists = panicList.some(
        (p) => p.ticket_id === app.job_id && p.sender_id === app.applicant_id
      );

      return {
        ...app,
        job_name: job?.name || "",
        applicant_name: user?.first_name || "",
        issueExists,
      };
    });

    // Step 6: Apply search by job title in code
    if (searchQuery) {
      result = result.filter((item) => item.job_name.toLowerCase().includes(searchQuery));
    }

    // Step 7: Return response
    return NextResponse.json({
      success: true,
      page,
      perPage,
      total: count || 0,
      booking: result,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}