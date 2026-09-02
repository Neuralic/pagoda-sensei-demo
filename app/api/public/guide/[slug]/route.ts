import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { enrichGuidesWithStats } from "@/lib/guide-profile-stats";
import { EXPERIENCE_TIER_LABELS, EXPERIENCE_TIER_SHORT } from "@/lib/guide-profile-slug";
import { getCurrentExperienceTierDisplay } from "@/lib/guide-experience-display";
import { certificationBadgeLabel, certificationStageFromStatus } from "@/lib/certification-display";
import { fetchMarketplaceToursForGuide } from "@/lib/guide-tour-assignments";
import { guideTierLabel, isGuideTier } from "@/lib/guide-tier";
import { BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public guide profile — no login required */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!slug?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  const supabase = getSupabaseServer();

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("profile_slug", slug.trim())
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  if (profile.guide_profile_status !== "published") {
    return NextResponse.json({ ok: false, error: "Profile is not published" }, { status: 404 });
  }

  const guideUserId = profile.user_id as string;

  const { data: user } = await supabase
    .from("users")
    .select("id, first_name, last_name, guide_number, guide_tier, country, city, is_operator")
    .eq("id", guideUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  let avatarUrl: string | null = null;
  if (profile.profile_picture_path) {
    const { data: signed } = await supabase.storage
      .from(BUCKETS.avatars)
      .createSignedUrl(profile.profile_picture_path as string, 60 * 60 * 24);
    avatarUrl = signed?.signedUrl ?? null;
  }

  let introVideoSignedUrl: string | null = null;
  if (profile.intro_video_path) {
    const { data: signed } = await supabase.storage
      .from(BUCKETS.introVideos)
      .createSignedUrl(profile.intro_video_path as string, 60 * 60 * 24);
    introVideoSignedUrl = signed?.signedUrl ?? null;
  }

  const stats = await enrichGuidesWithStats(supabase, [guideUserId]);
  const st = stats[guideUserId];
  const tours = await fetchMarketplaceToursForGuide(supabase, guideUserId, {
    isOperator: Boolean((user as { is_operator?: boolean }).is_operator),
  });

  let reviewRows: Array<Record<string, unknown>> = [];
  {
    const primary = await supabase
      .from("reviews")
      .select(
        "id, rating, comment, destination, guide_name, created_at, reviewer_id"
      )
      .eq("reviewee_id", guideUserId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (primary.error && /destination|guide_name/i.test(primary.error.message || "")) {
      const fallback = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, reviewer_id")
        .eq("reviewee_id", guideUserId)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(20);
      reviewRows = (fallback.data || []) as Array<Record<string, unknown>>;
    } else if (!primary.error) {
      reviewRows = (primary.data || []) as Array<Record<string, unknown>>;
    }
  }

  const reviewerIds = [
    ...new Set(
      reviewRows
        .map((r) => r.reviewer_id as string | undefined)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const reviewerNameById: Record<string, string> = {};
  if (reviewerIds.length > 0) {
    const { data: reviewers } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", reviewerIds);
    for (const u of reviewers || []) {
      const id = String((u as { id: string }).id);
      const first = String((u as { first_name?: string }).first_name || "");
      const last = String((u as { last_name?: string }).last_name || "");
      reviewerNameById[id] = `${first} ${last}`.trim() || "Advisor";
    }
  }

  const reviews = reviewRows.map((row) => {
    const comment = (row.comment as string | null) || null;
    let destination = (row.destination as string | null) || null;
    // Legacy freeform reviews stored destination in the comment prefix
    if (!destination && comment?.startsWith("[Destination:")) {
      const match = comment.match(/^\[Destination:\s*([^\]]+)\]/);
      if (match) destination = match[1].trim();
    }
    const displayComment =
      destination && comment?.startsWith("[Destination:")
        ? comment.replace(/^\[Destination:\s*[^\]]+\]\s*/i, "").trim()
        : comment;

    return {
      id: String(row.id),
      rating: Number(row.rating) || 0,
      comment: displayComment,
      destination,
      createdAt: String(row.created_at || ""),
      reviewerName: row.reviewer_id
        ? reviewerNameById[String(row.reviewer_id)] || "Advisor"
        : "Advisor",
    };
  });

  const tierDeclared = profile.experience_tier_declared as number | null;
  const tierVerified = profile.experience_tier_verified as number | null;
  const tierMarket = isGuideTier(user.guide_tier as string) ? user.guide_tier : "professional";
  const tierDisplay = getCurrentExperienceTierDisplay({
    guideTier: user.guide_tier as string | null,
    experienceTierDeclared: tierDeclared,
    experienceTierVerified: tierVerified,
  });
  const experienceTier =
    tierVerified != null && tierVerified >= 1 && tierVerified <= 3
      ? tierVerified
      : tierDeclared;

  return NextResponse.json({
    ok: true,
    guide: {
      id: user.id,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      guideNumber: user.guide_number,
      country: user.country,
      city: user.city,
      profileSlug: profile.profile_slug,
      bio: profile.bio,
      languages: profile.languages,
      destinations: profile.destinations,
      availableForVideoCall: profile.available_for_video_call ?? null,
      yearsExperience: profile.years_experience,
      toursCompletedEstimate: profile.tours_completed_estimate,
      experienceTierDeclared: tierDeclared,
      experienceTier,
      experienceTierLabel: tierDisplay.label,
      experienceTierShortLabel: tierDisplay.shortLabel,
      guideTierLabel: guideTierLabel(tierMarket),
      certificationStatus: profile.certification_status,
      certificationLabel: certificationBadgeLabel(
        certificationStageFromStatus(profile.certification_status as string)
      ),
      crisisHandlingExample: profile.crisis_handling_example,
      localExpertiseHighlight: profile.local_expertise_highlight,
      preTourPreparation: profile.pre_tour_preparation,
      clientFitDescription: profile.client_fit_description,
      avatarUrl,
      introVideoUrl: profile.intro_video_url || introVideoSignedUrl,
      introVideoSignedUrl,
      bookingCount: st?.bookingCount ?? 0,
      ratingAverage: st?.ratingAverage ?? null,
      reviewCount: st?.reviewCount ?? 0,
      assignedTours: tours,
      reviews,
      marketplaceAvailable: profile.marketplace_available !== false,
    },
  });
}
