import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * POST /api/jobs/candidate
 * Agent selects a candidate for a direct agent job
 * Body: { job_id: string, applicant_id: string }
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

    // Only agents can select candidates
    if (role !== "agent") {
      return NextResponse.json(
        { ok: false, error: "Only agents can select candidates" },
        { status: 403 }
      );
    }

    const { job_id, applicant_id } = await req.json();

    if (!job_id || !applicant_id) {
      return NextResponse.json(
        { ok: false, error: "job_id and applicant_id are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Verify the job exists and belongs to the agent
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, created_by, tour_id")
      .eq("id", job_id)
      .eq("created_by", userId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "Job not found or you don't have permission" },
        { status: 404 }
      );
    }

    // For tour library jobs, candidates are automatically set - don't allow manual selection
    if (job.tour_id) {
      return NextResponse.json(
        { ok: false, error: "Tour library jobs have automatic candidate assignment" },
        { status: 400 }
      );
    }

    // Verify the application exists
    const { data: application, error: findError } = await supabase
      .from("job_applications")
      .select("*")
      .eq("job_id", job_id)
      .eq("applicant_id", applicant_id)
      .single();

    if (findError || !application) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 }
      );
    }

    // Remove candidate status from all other applications for this job
    await supabase
      .from("job_applications")
      .update({ is_candidate: false, offer_status: "pending" })
      .eq("job_id", job_id)
      .neq("applicant_id", applicant_id);

    // Set this application as candidate
    const { data: updatedApplication, error: updateError } = await supabase
      .from("job_applications")
      .update({
        is_candidate: true,
        offer_status: "candidate",
      })
      .eq("id", application.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Candidate selected successfully",
      data: updatedApplication,
    });
  } catch (err) {
    console.error("Error selecting candidate:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while selecting candidate" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/candidate?jobId=xxx&applicantId=xxx
 * Agent removes candidate status from a guide
 */
export async function DELETE(req: NextRequest) {
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

    // Only agents can remove candidates
    if (role !== "agent") {
      return NextResponse.json(
        { ok: false, error: "Only agents can remove candidates" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const applicantId = searchParams.get("applicantId");

    if (!jobId || !applicantId) {
      return NextResponse.json(
        { ok: false, error: "jobId and applicantId are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Verify the job exists and belongs to the agent
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, created_by")
      .eq("id", jobId)
      .eq("created_by", userId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "Job not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Remove candidate status
    const { error: updateError } = await supabase
      .from("job_applications")
      .update({
        is_candidate: false,
        offer_status: "pending",
      })
      .eq("job_id", jobId)
      .eq("applicant_id", applicantId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Candidate removed successfully",
    });
  } catch (err) {
    console.error("Error removing candidate:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while removing candidate" },
      { status: 500 }
    );
  }
}

