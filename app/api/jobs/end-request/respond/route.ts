import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * POST /api/jobs/end-request/respond
 * Guide accepts or rejects a job end request
 * Body: { request_id: string, action: 'accept' | 'reject' }
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

    if (role !== "guide") {
      return NextResponse.json(
        { ok: false, error: "Only guides can respond to job end requests" },
        { status: 403 }
      );
    }

    const { request_id, action } = await req.json();

    if (!request_id || !action) {
      return NextResponse.json(
        { ok: false, error: "request_id and action are required" },
        { status: 400 }
      );
    }

    if (action !== "accept" && action !== "reject") {
      return NextResponse.json(
        { ok: false, error: "action must be 'accept' or 'reject'" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Get the request
    const { data: endRequest, error: requestError } = await supabase
      .from("job_end_requests")
      .select("*")
      .eq("id", request_id)
      .eq("guide_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (requestError || !endRequest) {
      return NextResponse.json(
        { ok: false, error: "Request not found or already responded to" },
        { status: 404 }
      );
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";

    // Update the request
    const { data: updatedRequest, error: updateError } = await supabase
      .from("job_end_requests")
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
      })
      .eq("id", request_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    // If accepted, close the job
    if (action === "accept") {
      const { data: hiringHistory, error: historyError } = await supabase
        .from("job_hiring_history")
        .select("*")
        .eq("id", endRequest.hiring_history_id)
        .maybeSingle();

      if (!historyError && hiringHistory && !hiringHistory.is_closed) {
        // Close the job
        await supabase
          .from("job_hiring_history")
          .update({
            is_closed: true,
            closed_at: new Date().toISOString(),
          })
          .eq("id", endRequest.hiring_history_id);

        // Check and update review visibility
        try {
          await supabase.rpc("check_review_visibility_for_closed_jobs");
        } catch (error) {
          console.log("Visibility check function not available yet");
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: action === "accept" 
        ? "Job end request accepted. Job is now closed." 
        : "Job end request rejected.",
      end_request: updatedRequest,
      job_closed: action === "accept",
    });
  } catch (err) {
    console.error("Error responding to job end request:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while responding to job end request" },
      { status: 500 }
    );
  }
}

