import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

/**
 * Resolve a guide user id from a free-text name (best-effort).
 */
async function findGuideIdByName(
  supabase: ReturnType<typeof getSupabaseServer>,
  guideName: string
): Promise<string | null> {
  const q = guideName.trim();
  if (!q) return null;

  const esc = q.replace(/%/g, "").replace(/,/g, "").slice(0, 120);
  const p = `%${esc}%`;

  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, role")
    .eq("role", "guide")
    .or(`first_name.ilike.${p},last_name.ilike.${p}`)
    .limit(40);

  if (!users?.length) return null;

  const qLower = q.toLowerCase();
  const scored = users
    .map((u) => {
      const first = String(u.first_name || "").trim();
      const last = String(u.last_name || "").trim();
      const full = `${first} ${last}`.trim().toLowerCase();
      let score = 0;
      if (full === qLower) score = 100;
      else if (full.includes(qLower)) score = 80;
      else if (first.toLowerCase() === qLower || last.toLowerCase() === qLower) score = 70;
      else if (
        first.toLowerCase().includes(qLower) ||
        last.toLowerCase().includes(qLower)
      ) {
        score = 50;
      }
      return { id: String(u.id), score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}

/**
 * POST /api/reviews
 * Job mode: { job_id, rating, comment? }
 * Freeform: { guide_name, destination, rating, comment }
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

    if (role !== "agent" && role !== "agency") {
      return NextResponse.json(
        { ok: false, error: "Only travel agents can leave reviews" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const rating =
      typeof body.rating === "number" ? body.rating : Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    const comment =
      typeof body.comment === "string" && body.comment.trim()
        ? body.comment.trim()
        : null;

    const supabase = getSupabaseServer();

    const { data: reviewerUser, error: reviewerError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (reviewerError) {
      return NextResponse.json(
        { ok: false, error: `Database error: ${reviewerError.message}` },
        { status: 500 }
      );
    }

    if (!reviewerUser) {
      return NextResponse.json(
        { ok: false, error: "User not found. Please log in again." },
        { status: 404 }
      );
    }

    let profileId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile) profileId = profile.id;

    const guideName =
      typeof body.guide_name === "string" ? body.guide_name.trim() : "";
    const destination =
      typeof body.destination === "string" ? body.destination.trim() : "";
    const guideIdRaw =
      typeof body.guide_id === "string" ? body.guide_id.trim() : "";
    const jobIdRaw =
      typeof body.job_id === "string" ? body.job_id.trim() : "";

    // ---------- Freeform advisor review ----------
    if (!jobIdRaw && (guideName || destination || guideIdRaw)) {
      if (!guideName && !guideIdRaw) {
        return NextResponse.json(
          { ok: false, error: "Guide name is required" },
          { status: 400 }
        );
      }
      if (!destination) {
        return NextResponse.json(
          { ok: false, error: "Destination is required" },
          { status: 400 }
        );
      }
      if (!comment) {
        return NextResponse.json(
          { ok: false, error: "Review text is required" },
          { status: 400 }
        );
      }

      let reviewee_id: string | null = null;
      let resolvedGuideName = guideName;

      if (guideIdRaw) {
        const { data: guideUser } = await supabase
          .from("users")
          .select("id, first_name, last_name, role")
          .eq("id", guideIdRaw)
          .eq("role", "guide")
          .maybeSingle();
        if (!guideUser) {
          return NextResponse.json(
            { ok: false, error: "Selected guide was not found" },
            { status: 404 }
          );
        }
        reviewee_id = String(guideUser.id);
        resolvedGuideName =
          guideName ||
          `${guideUser.first_name || ""} ${guideUser.last_name || ""}`.trim();
      } else {
        reviewee_id = await findGuideIdByName(supabase, guideName);
      }

      if (!reviewee_id) {
        return NextResponse.json(
          {
            ok: false,
            error: "Please select a guide from the search results",
          },
          { status: 400 }
        );
      }

      let job_id: string | null = null;
      let hiring_history_id: string | null = null;
      const { data: history } = await supabase
        .from("job_hiring_history")
        .select("id, job_id")
        .eq("agent_id", userId)
        .eq("guide_id", reviewee_id)
        .order("offer_accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (history) {
        hiring_history_id = history.id;
        job_id = history.job_id;
      }

      const insertRow: Record<string, unknown> = {
        reviewer_id: reviewerUser.id,
        reviewee_id,
        profile_id: profileId,
        rating,
        comment,
        destination,
        guide_name: resolvedGuideName || guideName,
        is_visible: true,
      };
      if (job_id) insertRow.job_id = job_id;
      if (hiring_history_id) insertRow.hiring_history_id = hiring_history_id;

      const { data: review, error: reviewError } = await supabase
        .from("reviews")
        .insert(insertRow)
        .select()
        .single();

      if (reviewError) {
        // Fallback if destination/guide_name columns not migrated yet
        if (/destination|guide_name/i.test(reviewError.message || "")) {
          const fallbackComment = `[Destination: ${destination}]\n\n${comment}`;
          const fallback: Record<string, unknown> = {
            reviewer_id: reviewerUser.id,
            reviewee_id,
            profile_id: profileId,
            rating,
            comment: fallbackComment,
            is_visible: true,
          };
          if (job_id) fallback.job_id = job_id;
          if (hiring_history_id) fallback.hiring_history_id = hiring_history_id;

          const { data: retry, error: retryError } = await supabase
            .from("reviews")
            .insert(fallback)
            .select()
            .single();

          if (retryError) {
            console.error("Freeform review insert error:", retryError);
            return NextResponse.json(
              { ok: false, error: retryError.message },
              { status: 500 }
            );
          }
          return NextResponse.json({
            ok: true,
            message: "Review submitted successfully",
            review: retry,
            matched_guide: true,
          });
        }

        console.error("Freeform review insert error:", reviewError);
        return NextResponse.json(
          { ok: false, error: reviewError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Review submitted successfully",
        review,
        matched_guide: true,
      });
    }

    // ---------- Job-based review ----------
    if (!jobIdRaw) {
      return NextResponse.json(
        { ok: false, error: "job_id and rating are required" },
        { status: 400 }
      );
    }

    const { data: hiringHistory, error: historyError } = await supabase
      .from("job_hiring_history")
      .select("*")
      .eq("job_id", jobIdRaw)
      .maybeSingle();

    if (historyError || !hiringHistory) {
      return NextResponse.json(
        { ok: false, error: "Job not found or not completed" },
        { status: 404 }
      );
    }

    const reviewee_id = hiringHistory.guide_id;

    if (reviewee_id) {
      const { data: revieweeUser, error: revieweeError } = await supabase
        .from("users")
        .select("id")
        .eq("id", reviewee_id)
        .maybeSingle();

      if (revieweeError || !revieweeUser) {
        return NextResponse.json(
          { ok: false, error: "The person you're reviewing no longer exists" },
          { status: 404 }
        );
      }
    }

    const { data: existingReview, error: checkError } = await supabase
      .from("reviews")
      .select("id")
      .eq("job_id", jobIdRaw)
      .eq("reviewer_id", userId)
      .eq("reviewee_id", reviewee_id)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json(
        { ok: false, error: "Database error checking existing review" },
        { status: 500 }
      );
    }

    if (existingReview) {
      return NextResponse.json(
        { ok: false, error: "You have already reviewed this job" },
        { status: 400 }
      );
    }

    if (hiringHistory.agent_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "You are not authorized to review this job" },
        { status: 403 }
      );
    }

    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        job_id: jobIdRaw,
        hiring_history_id: hiringHistory.id,
        reviewer_id: reviewerUser.id,
        reviewee_id,
        profile_id: profileId,
        rating,
        comment: comment || null,
        is_visible: true,
      })
      .select()
      .single();

    if (reviewError) {
      console.error("Review creation error:", reviewError);
      return NextResponse.json(
        { ok: false, error: reviewError.message, details: reviewError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Review submitted successfully",
      review,
    });
  } catch (err) {
    console.error("Error submitting review:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while submitting review" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reviews?userId=xxx or ?jobId=xxx
 * Get reviews for a user or a job
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const jobId = searchParams.get("jobId");

    if (!userId && !jobId) {
      return NextResponse.json(
        { ok: false, error: "userId or jobId is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Check and update review visibility for closed jobs (in case trigger didn't run)
    try {
      await supabase.rpc("check_review_visibility_for_closed_jobs");
    } catch (error) {
      // Ignore if function doesn't exist yet
      console.log("Visibility check function not available");
    }

    let query = supabase
      .from("reviews")
      .select(`
        *,
        reviewer:users!reviews_reviewer_id_fkey(id, first_name, last_name, role),
        reviewee:users!reviews_reviewee_id_fkey(id, first_name, last_name, role),
        job:jobs(id, name)
      `)
      .eq("is_visible", true); // Only return visible reviews

    if (userId) {
      query = query.eq("reviewee_id", userId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    // Get current user ID for checking if they've reviewed
    const jar = await cookies();
    const currentUserId = jar.get("userId")?.value;

    const { data: reviews, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Get profile pictures for reviewers
    if (reviews && reviews.length > 0) {
      const reviewerIds = reviews
        .map((r: any) => r.reviewer?.id)
        .filter((id: string | undefined): id is string => Boolean(id));

      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, profile_picture_path")
          .in("user_id", reviewerIds);

        // Add profile pictures to reviews
        reviews.forEach((review: any) => {
          const profile = profiles?.find((p) => p.user_id === review.reviewer?.id);
          if (profile?.profile_picture_path) {
            review.reviewer_avatar = profile.profile_picture_path;
          }
        });
      }
    }

    return NextResponse.json({
      ok: true,
      reviews: reviews || [],
      current_user_id: currentUserId || null,
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    return NextResponse.json(
      { ok: false, error: "Server error while fetching reviews" },
      { status: 500 }
    );
  }
}
