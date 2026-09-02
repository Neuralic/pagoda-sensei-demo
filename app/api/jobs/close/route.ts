import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * POST /api/jobs/close
 * Close a completed job (optional - can be done without reviews)
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
      .maybeSingle();

    if (historyError || !hiringHistory) {
      return NextResponse.json(
        { ok: false, error: "Job not found or not completed" },
        { status: 404 }
      );
    }

    // Check if already closed
    if (hiringHistory.is_closed) {
      return NextResponse.json(
        { ok: false, error: "This job is already closed" },
        { status: 400 }
      );
    }

    // Verify the user is part of this job (either agent or guide)
    if (role === "agent" && hiringHistory.agent_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "You are not authorized to close this job" },
        { status: 403 }
      );
    }

    if (role === "guide" && hiringHistory.guide_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "You are not authorized to close this job" },
        { status: 403 }
      );
    }

    // Close the job
    const { data: updatedHistory, error: updateError } = await supabase
      .from("job_hiring_history")
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
      })
      .eq("id", hiringHistory.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    // Check and update review visibility (reviews will become visible in 1 week)
    // This is handled by the database trigger, but we can also call it explicitly
    try {
      await supabase.rpc("check_review_visibility_for_closed_jobs");
    } catch (error) {
      // Ignore if function doesn't exist yet (will be created by migration)
      console.log("Visibility check function not available yet"); 
    }

    return NextResponse.json({
      ok: true,
      message: "Job closed successfully. Reviews will become visible 1 week from now.",
      hiring_history: updatedHistory,
    });
  } catch (err) {
    console.error("Error closing job:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while closing job" },
      { status: 500 }
    );
  }
}

