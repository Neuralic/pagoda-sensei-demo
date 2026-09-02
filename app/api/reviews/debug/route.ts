import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * GET /api/reviews/debug
 * Debug endpoint to view all reviews with profile information
 * Shows reviews including those with NULL profile_id
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

    // Only allow admins or the user themselves
    if (role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();

    // Get all reviews with reviewer and reviewee info, including profile info
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select(`
        id,
        job_id,
        hiring_history_id,
        reviewer_id,
        reviewee_id,
        profile_id,
        rating,
        comment,
        is_visible,
        created_at,
        reviewer:users!reviews_reviewer_id_fkey(id, email, role, first_name, last_name),
        reviewee:users!reviews_reviewee_id_fkey(id, email, role, first_name, last_name),
        reviewer_profile:profiles!reviews_profile_id_fkey(id, user_id),
        job:jobs(id, name)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Enrich with profile existence info
    const enrichedReviews = reviews?.map((review: any) => {
      const reviewerHasProfile = review.reviewer_profile !== null;
      const revieweeProfileId = review.reviewee_id;
      
      return {
        ...review,
        reviewer_has_profile: reviewerHasProfile,
        profile_id_status: review.profile_id 
          ? `Set (${review.profile_id})` 
          : "NULL (no profile)",
      };
    });

    return NextResponse.json({
      ok: true,
      total_reviews: reviews?.length || 0,
      reviews_with_null_profile_id: reviews?.filter((r: any) => !r.profile_id).length || 0,
      reviews: enrichedReviews || [],
    });
  } catch (err) {
    console.error("Error fetching debug reviews:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching reviews" },
      { status: 500 }
    );
  }
}

