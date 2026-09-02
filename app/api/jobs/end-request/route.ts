import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * POST /api/jobs/end-request
 * Agent sends a job end request to the guide
 * Body: { job_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (role !== "agent") {
      return NextResponse.json(
        { ok: false, error: "Only agents can send job end requests" },
        { status: 403 }
      );
    }

    const { job_id } = await req.json();

    if (!job_id) {
      return NextResponse.json(
        { ok: false, error: "job_id is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Get the hiring history for this job
    const { data: hiringHistory, error: historyError } = await supabase
      .from("job_hiring_history")
      .select("*")
      .eq("job_id", job_id)
      .eq("agent_id", userId)
      .eq("is_closed", false)
      .maybeSingle();

    if (historyError || !hiringHistory) {
      return NextResponse.json(
        { ok: false, error: "Job not found, not hired, or already closed" },
        { status: 404 }
      );
    }

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from("job_end_requests")
      .select("id, status")
      .eq("job_id", job_id)
      .eq("hiring_history_id", hiringHistory.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequest) {
      return NextResponse.json(
        { ok: false, error: "A job end request is already pending for this job" },
        { status: 400 }
      );
    }

    // Create the job end request
    const { data: endRequest, error: requestError } = await supabase
      .from("job_end_requests")
      .insert({
        job_id,
        hiring_history_id: hiringHistory.id,
        agent_id: userId,
        guide_id: hiringHistory.guide_id,
        status: "pending",
      })
      .select()
      .single();

    if (requestError) {
      return NextResponse.json(
        { ok: false, error: requestError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Job end request sent to guide",
      end_request: endRequest,
    });
  } catch (err) {
    console.error("Error sending job end request:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while sending job end request" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/end-request
 * Get job end requests for the current user
 * Query params: ?job_id=xxx (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");

    const supabase = getSupabaseServer();

    let query = supabase
      .from("job_end_requests")
      .select(`
        *,
        job:jobs(id, name, location, start_time)
      `);

    if (role === "agent") {
      query = query.eq("agent_id", userId);
    } else if (role === "guide") {
      query = query.eq("guide_id", userId);
    } else {
      return NextResponse.json(
        { ok: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data: requests, error } = await query.order("requested_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      requests: requests || [],
    });
  } catch (err) {
    console.error("Error fetching job end requests:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching job end requests" },
      { status: 500 }
    );
  }
}

