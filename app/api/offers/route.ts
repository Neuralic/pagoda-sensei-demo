import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { cookies } from "next/headers";
import { sendAgentOfferToGuideNotificationEmail } from "@/lib/mailer";
import { requireGuideAvailabilityForFirstBooking } from "@/lib/guide-availability";
import { canActAsAgent } from "@/lib/platform-access";

/**
 * POST /api/offers
 * Agent sends an offer to a guide for a job
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

    // Only agents (and admins acting on their behalf) can send offers
    if (!canActAsAgent(role)) {
      return NextResponse.json(
        { ok: false, error: "Only agents can send offers" },
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
    const activityPost = await denyIfActivityNotApproved(userId, supabase);
    if (activityPost) return activityPost;

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

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("start_time")
      .eq("id", job_id)
      .maybeSingle();

    const availGate = await requireGuideAvailabilityForFirstBooking(supabase, applicant_id, {
      jobStartIso: (jobRow as { start_time?: string } | null)?.start_time ?? null,
    });
    if (!availGate.ok) {
      return NextResponse.json({ ok: false, error: availGate.error }, { status: availGate.status });
    }

    // Check if already offered or accepted
    if (application.offer_status === "offered" || application.offer_status === "accepted" || application.offer_status === "completed") {
      return NextResponse.json(
        { ok: false, error: "Offer already sent or accepted" },
        { status: 400 }
      );
    }

    // Update application with offer status
    const { data, error: updateError } = await supabase
      .from("job_applications")
      .update({
        offer_status: "offered",
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

    // Send email notification to guide (non-blocking)
    try {
      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("id, name, created_by, itinerary_id")
        .eq("id", job_id)
        .single();

      if (!jobError && jobData) {
        const [{ data: guideData }, { data: agentData }] = await Promise.all([
          supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", applicant_id)
            .single(),
          supabase
            .from("users")
            .select("first_name, last_name")
            .eq("id", userId)
            .single(),
        ]);

        let itineraryName: string | null = null;
        if (jobData.itinerary_id) {
          const { data: itineraryData } = await supabase
            .from("itineraries")
            .select("name")
            .eq("id", jobData.itinerary_id)
            .single();
          itineraryName = itineraryData?.name ?? null;
        }

        const guideName =
          guideData?.first_name || guideData?.last_name
            ? `${guideData.first_name || ""} ${guideData.last_name || ""}`.trim()
            : "Guide";
        const agentName =
          agentData?.first_name || agentData?.last_name
            ? `${agentData.first_name || ""} ${agentData.last_name || ""}`.trim()
            : "Agent";

        if (guideData?.email) {
          sendAgentOfferToGuideNotificationEmail(
            guideData.email,
            guideName,
            agentName,
            jobData.name || "Your job",
            jobData.id,
            itineraryName
          ).catch((emailErr) => {
            console.error("Failed to send offer notification email:", emailErr);
          });
        }
      }
    } catch (notificationError) {
      console.error("Error sending offer notification email:", notificationError);
    }

    return NextResponse.json({
      ok: true,
      message: "Offer sent successfully",
      data,
    });
  } catch (err) {
    console.error("Error sending offer:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while sending offer" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/offers?jobId=xxx
 * Get offers for a job (for guides to see their offers)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "jobId is required" },
        { status: 400 }
      );
    }

    const jar = await cookies();
    const userId = jar.get("userId")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServer();
    const activityOffersGet = await denyIfActivityNotApproved(userId, supabase);
    if (activityOffersGet) return activityOffersGet;

    // Get offers for this user on this job
    const { data: offers, error } = await supabase
      .from("job_applications")
      .select("*, jobs(name, location, start_time)")
      .eq("job_id", jobId)
      .eq("applicant_id", userId)
      .in("offer_status", ["offered", "accepted", "completed"]);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      offers: offers || [],
    });
  } catch (err) {
    console.error("Error fetching offers:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching offers" },
      { status: 500 }
    );
  }
}

