import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { sendAgentRequestPriceUpdateEmail } from "@/lib/mailer";

/**
 * POST /api/bids/request-price-update
 * Agent sends an email to a guide asking them to update their price.
 * Body: { job_id: string, applicant_id: string, message?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    if (!userId)
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    if (role !== "agent")
      return NextResponse.json(
        { ok: false, error: "Only agents can request a price update" },
        { status: 403 }
      );

    const body = await req.json().catch(() => ({}));
    const job_id = body.job_id ?? body.jobId;
    const applicant_id = body.applicant_id ?? body.applicantId;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!job_id || !applicant_id)
      return NextResponse.json(
        { ok: false, error: "job_id and applicant_id are required" },
        { status: 400 }
      );

    const supabase = getSupabaseServer();

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, name, created_by, itinerary_id")
      .eq("id", job_id)
      .eq("created_by", userId)
      .single();

    if (jobError || !job)
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

    const { data: app, error: appError } = await supabase
      .from("job_applications")
      .select("id, applicant_id")
      .eq("job_id", job_id)
      .eq("applicant_id", applicant_id)
      .single();

    if (appError || !app)
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 }
      );

    const { data: guideUser, error: guideError } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", applicant_id)
      .single();

    if (guideError || !guideUser)
      return NextResponse.json(
        { ok: false, error: "Guide not found" },
        { status: 404 }
      );

    const guideEmail = (guideUser as { email?: string }).email;
    if (!guideEmail)
      return NextResponse.json(
        { ok: false, error: "Guide has no email address" },
        { status: 400 }
      );

    const guideName =
      [(guideUser as { first_name?: string }).first_name, (guideUser as { last_name?: string }).last_name]
        .filter(Boolean)
        .join(" ") || "Guide";

    const { data: agentUser } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();

    const agentName =
      agentUser && [(agentUser as { first_name?: string }).first_name, (agentUser as { last_name?: string }).last_name]
        .filter(Boolean)
        .join(" ")
        ? [(agentUser as { first_name?: string }).first_name, (agentUser as { last_name?: string }).last_name].filter(Boolean).join(" ")
        : "The agent";

    const jobName = (job as { name?: string }).name || "Job";
    const itineraryId = (job as { itinerary_id?: string | null }).itinerary_id ?? null;

    const result = await sendAgentRequestPriceUpdateEmail(
      guideEmail,
      guideName,
      agentName,
      jobName,
      message,
      job_id,
      itineraryId
    );

    if (result.ok === false)
      return NextResponse.json(
        { ok: false, error: "Failed to send email" },
        { status: 500 }
      );

    return NextResponse.json({
      ok: true,
      message: "Request sent successfully",
    });
  } catch (err) {
    console.error("Error sending request price update:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
