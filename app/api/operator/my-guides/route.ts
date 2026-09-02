import { NextResponse } from "next/server";
import { requireOperatorAccount } from "@/lib/operator-auth";
import { enrichGuidesWithStats } from "@/lib/guide-profile-stats";
import {
  createManagedGuideUser,
  parseManagedGuideBody,
} from "@/lib/managed-guide-profile";
import { BUCKETS } from "@/lib/buckets";
import { getCurrentExperienceTierDisplay, certificationStatusLabel } from "@/lib/guide-experience-display";
import { validateGuideMarketplaceProfile } from "@/lib/guide-marketplace-validation";
import { computeProfileCompleteness } from "@/lib/profile-completeness";

export const runtime = "nodejs";

function publicProfileUrl(slug: string | null): string | null {
  if (!slug) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/g/${slug}`;
}

/** List operator-managed guides */
export async function GET() {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;

  const { data: guides, error } = await supabase
    .from("users")
    .select(
      "id, first_name, last_name, email, guide_number, is_active, created_at, country, city, guide_tier"
    )
    .eq("managed_by_operator_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (guides || []).map((g) => (g as { id: string }).id);
  const stats = await enrichGuidesWithStats(supabase, ids);

  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "user_id, profile_slug, guide_profile_status, certification_status, experience_tier_declared, experience_tier_verified, profile_picture_path, marketplace_available, years_experience, tours_completed_estimate, crisis_handling_example, local_expertise_highlight, pre_tour_preparation, client_fit_description, destinations, daily_rate_amount, languages, specialties, bio, intro_video_path, intro_video_url, guide_availability_calendar"
    )
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const profByUser: Record<string, Record<string, unknown>> = {};
  for (const p of profiles || []) {
    profByUser[(p as { user_id: string }).user_id] = p as Record<string, unknown>;
  }

  const list = await Promise.all(
    (guides || []).map(async (g) => {
      const row = g as Record<string, unknown>;
      const id = row.id as string;
      const prof = profByUser[id] || {};
      const st = stats[id];
      let avatarUrl: string | null = null;
      const pic = prof.profile_picture_path as string | undefined;
      if (pic) {
        const { data: signed } = await supabase.storage
          .from(BUCKETS.avatars)
          .createSignedUrl(pic, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }
      const tierDisplay = getCurrentExperienceTierDisplay({
        guideTier: row.guide_tier as string | null,
        experienceTierDeclared: prof.experience_tier_declared as number | null,
        experienceTierVerified: prof.experience_tier_verified as number | null,
      });
      const slug = prof.profile_slug as string | null;
      const certStatus = (prof.certification_status as string) || "pending";
      const completeness = computeProfileCompleteness(prof as Record<string, unknown>);
      return {
        id,
        firstName: row.first_name,
        lastName: row.last_name,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        email: row.email,
        guideNumber: row.guide_number,
        isActive: row.is_active !== false,
        guideTier: row.guide_tier,
        guideProfileStatus: prof.guide_profile_status || "draft",
        certificationStatus: certStatus,
        certificationLabel: certificationStatusLabel(certStatus),
        experienceTierDeclared: prof.experience_tier_declared,
        experienceTierVerified: prof.experience_tier_verified,
        experienceTierLabel: tierDisplay.label,
        experienceTierShortLabel: tierDisplay.shortLabel,
        experienceTierSource: tierDisplay.source,
        bookingCount: st?.bookingCount ?? 0,
        ratingAverage: st?.ratingAverage ?? null,
        reviewCount: st?.reviewCount ?? 0,
        profileSlug: slug,
        publicProfileUrl:
          prof.guide_profile_status === "published" ? publicProfileUrl(slug) : null,
        experienceTier:
          tierDisplay.source === "verified"
            ? (prof.experience_tier_verified as number)
            : (prof.experience_tier_declared as number),
        avatarUrl,
        yearsExperience: prof.years_experience,
        profileCompleteness: completeness,
      };
    })
  );

  return NextResponse.json({ ok: true, guides: list });
}

/** Create a new managed guide profile */
export async function POST(req: Request) {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const saveAsDraft = body.saveAsDraft === true;
  const parsed = parseManagedGuideBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  if (!saveAsDraft) {
    const validation = validateGuideMarketplaceProfile(parsed);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, error: validation.error, field: validation.field },
        { status: 400 }
      );
    }
  }

  const created = await createManagedGuideUser(supabase, userId, parsed);
  if ("error" in created) {
    const status = created.field ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: created.error, field: created.field },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    guideUserId: created.guideUserId,
    profileSlug: created.profileSlug,
    publicProfileUrl: publicProfileUrl(created.profileSlug),
  });
}
