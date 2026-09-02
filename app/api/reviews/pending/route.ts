import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * GET /api/reviews/pending
 * Get jobs that need reviews from the current user
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

    const supabase = getSupabaseServer();

    // Get hiring history where user is involved (can be closed or not)
    // Show jobs that need reviews OR can be closed
    const hiringQuery = supabase
      .from("job_hiring_history")
      .select(`
        *,
        job:jobs(id, name, location, start_time, end_time, images)
      `);

    // Only agents can leave reviews - guides cannot review
    if (role !== "agent") {
      return NextResponse.json({
        ok: true,
        pending_reviews: [],
        message: "Only travel agents can leave reviews",
      });
    }

      hiringQuery.eq("agent_id", userId);

    const { data: hiringHistory, error: historyError } = await hiringQuery;

    if (historyError) {
      return NextResponse.json(
        { ok: false, error: historyError.message },
        { status: 500 }
      );
    }

    if (!hiringHistory || hiringHistory.length === 0) {
      return NextResponse.json({
        ok: true,
        pending_reviews: [],
      });
    }

    // Check which jobs the user has already reviewed
    const jobIds = hiringHistory.map((h: any) => h.job_id);
    const { data: existingReviews } = await supabase
      .from("reviews")
      .select("job_id")
      .eq("reviewer_id", userId)
      .in("job_id", jobIds);

    const reviewedJobIds = new Set(existingReviews?.map((r) => r.job_id) || []);

    // Filter to jobs that need reviews (can review anytime, even if closed)
    const pendingReviews = hiringHistory
      .filter((h: any) => {
        // Skip if already reviewed
        if (reviewedJobIds.has(h.job_id)) {
          return false;
        }

        // Can review anytime, even after deadline or if closed
        return true;
      })
      .map((h: any) => ({
        hiring_history_id: h.id,
        job_id: h.job_id,
        job_name: h.job?.name,
        job_location: h.job?.location,
        job_start_time: h.job?.start_time,
        job_images: h.job?.images,
        review_deadline: h.review_deadline,
        is_closed: h.is_closed,
        closed_at: h.closed_at,
        other_party_id: h.guide_id, // Always the guide since only agents review
        final_price: h.final_price,
        offer_accepted_at: h.offer_accepted_at,
      }));

    return NextResponse.json({
      ok: true,
      pending_reviews: pendingReviews,
    });
  } catch (err) {
    console.error("Error fetching pending reviews:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching pending reviews" },
      { status: 500 }
    );
  }
}

