import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * GET /api/jobs/hiring-status
 * Get hiring status and end request status for a job
 * Query params: ?job_id=xxx
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

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "job_id is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Get hiring history for this job (not closed)
    let hiringQuery = supabase
      .from("job_hiring_history")
      .select("*")
      .eq("job_id", jobId)
      .eq("is_closed", false);

    if (role === "agent") {
      hiringQuery = hiringQuery.eq("agent_id", userId);
    } else if (role === "guide") {
      hiringQuery = hiringQuery.eq("guide_id", userId);
    }

    const { data: hiringHistory, error: historyError } = await hiringQuery.maybeSingle();

    if (historyError) {
      return NextResponse.json(
        { ok: false, error: historyError.message },
        { status: 500 }
      );
    }

    const hasHiringHistory = !!hiringHistory;

    // If there's hiring history, check for pending end requests
    let hasPendingEndRequest = false;
    if (hasHiringHistory && hiringHistory) {
      const { data: endRequest } = await supabase
        .from("job_end_requests")
        .select("id, status")
        .eq("job_id", jobId)
        .eq("hiring_history_id", hiringHistory.id)
        .eq("status", "pending")
        .maybeSingle();

      hasPendingEndRequest = !!endRequest;
    }

    return NextResponse.json({
      ok: true,
      has_hiring_history: hasHiringHistory,
      has_pending_end_request: hasPendingEndRequest,
      hiring_history: hiringHistory || null,
    });
  } catch (err) {
    console.error("Error fetching hiring status:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching hiring status" },
      { status: 500 }
    );
  }
}

