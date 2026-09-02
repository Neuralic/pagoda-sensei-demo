import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { fetchMarketplaceToursForGuide } from "@/lib/guide-tour-assignments";
import { enrichGuidesWithStats } from "@/lib/guide-profile-stats";
import { guideTierLabel, isGuideTier, normalizeGuideTier, type GuideTier } from "@/lib/guide-tier";
import { BUCKETS } from "@/lib/buckets";
import { getCurrentExperienceTierDisplay, certificationStatusLabel } from "@/lib/guide-experience-display";
import { userMatchesNameSearch } from "@/lib/user-name-search";

export const runtime = "nodejs";

function escapeIlike(s: string): string {
  return s.replace(/%/g, "").replace(/,/g, "").trim().slice(0, 100);
}

/** PostgREST `.or()` values with `%` wildcards must be double-quoted. */
function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Broad candidate fetch — any name token may match first or last name.
 * Fine-grained matching (incl. reversed “Abe Tadao” / “Tadao Abe”) happens in JS.
 */
function buildGuideUserSearchQuery(
  supabase: ReturnType<typeof getSupabaseServer>,
  opts: { esc: string; tierFilter: GuideTier | null; limit: number }
) {
  const { esc, tierFilter, limit } = opts;
  const parts = esc.split(/\s+/).filter(Boolean);
  const isNumeric = /^\d+$/.test(esc);

  let userQuery = supabase
    .from("users")
    .select("id, first_name, last_name, guide_number, guide_tier, country, city, is_operator, guide_approved")
    .eq("role", "guide")
    .eq("is_active", true);

  if (isNumeric) {
    userQuery = userQuery.or(
      `guide_number.eq.${esc},first_name.ilike.${quoteOrValue(`%${esc}%`)},last_name.ilike.${quoteOrValue(`%${esc}%`)}`
    );
  } else {
    const orParts: string[] = [];
    // Full query against either field (covers "Yutaro Murase" stored in one field)
    orParts.push(`first_name.ilike.${quoteOrValue(`%${esc}%`)}`);
    orParts.push(`last_name.ilike.${quoteOrValue(`%${esc}%`)}`);
    // Each token against either field (covers multi-word + reversed order candidates)
    for (const part of parts) {
      orParts.push(`first_name.ilike.${quoteOrValue(`%${part}%`)}`);
      orParts.push(`last_name.ilike.${quoteOrValue(`%${part}%`)}`);
    }
    userQuery = userQuery.or([...new Set(orParts)].join(","));
  }

  if (tierFilter) {
    userQuery = userQuery.eq("guide_tier", tierFilter);
  }

  // Fetch extra candidates; JS name filter + ranking trim to `limit`
  return userQuery.limit(Math.min(150, Math.max(limit * 8, 40)));
}

function publicProfileUrl(slug: string | null, published: boolean): string | null {
  if (!slug || !published) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/g/${slug}`;
}

/**
 * Search guides / tour operators by name.
 * Active approved guides are returned even when their marketplace profile is still a draft
 * (agents often know the person before the public /g/{slug} profile is published).
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (!userId || (role !== "agent" && role !== "agency" && role !== "guide" && role !== "admin")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServer();
  if (role !== "admin") {
    const block = await denyIfActivityNotApproved(userId, supabase);
    if (block) return block;
  }

  const { searchParams } = new URL(req.url);
  const qRaw = searchParams.get("q")?.trim() || "";
  const tierParam = searchParams.get("tier")?.trim() || "";
  const tierFilter: GuideTier | null = isGuideTier(tierParam) ? tierParam : null;
  const experienceTierParam = parseInt(searchParams.get("experienceTier") || "", 10);
  const experienceTierFilter =
    experienceTierParam >= 1 && experienceTierParam <= 3 ? experienceTierParam : null;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

  if (qRaw.length < 2) {
    return NextResponse.json({ ok: false, error: "Search at least 2 characters" }, { status: 400 });
  }

  const esc = escapeIlike(qRaw);

  const { data: usersRaw, error } = await buildGuideUserSearchQuery(supabase, {
    esc,
    tierFilter,
    limit,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const users = (usersRaw || []).filter((u) =>
    userMatchesNameSearch(
      {
        first_name: (u as { first_name?: string }).first_name,
        last_name: (u as { last_name?: string }).last_name,
      },
      qRaw
    )
  );

  if (!users.length) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const guideIds = users.map((u) => (u as { id: string }).id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "user_id, profile_slug, profile_picture_path, marketplace_available, guide_profile_status, certification_status, experience_tier_declared, experience_tier_verified"
    )
    .in("user_id", guideIds);

  const profilesById: Record<string, Record<string, unknown>> = {};
  for (const pr of profiles || []) {
    profilesById[(pr as { user_id: string }).user_id] = pr as Record<string, unknown>;
  }

  const statsMap = await enrichGuidesWithStats(supabase, guideIds);

  const results = await Promise.all(
    users.map(async (u) => {
      const row = u as Record<string, unknown>;
      const id = row.id as string;
      const isOperator = Boolean(row.is_operator);
      const prof = profilesById[id] || null;
      const profileStatus = String(prof?.guide_profile_status || "").toLowerCase();
      const profilePublished = profileStatus === "published";

      // Hide guides who explicitly opted out of marketplace (only when a profile row exists).
      if (prof && prof.marketplace_available === false) {
        return null;
      }

      const expDeclared = (prof?.experience_tier_declared as number | null) ?? null;
      if (experienceTierFilter != null && expDeclared !== experienceTierFilter) {
        return null;
      }

      const tierDisplay = getCurrentExperienceTierDisplay({
        guideTier: row.guide_tier as string | null,
        experienceTierDeclared: expDeclared,
        experienceTierVerified: (prof?.experience_tier_verified as number | null) ?? null,
      });
      const tier = normalizeGuideTier(row.guide_tier as string);
      let avatarUrl: string | null = null;
      const pic = prof?.profile_picture_path as string | undefined;
      if (pic) {
        const { data: signed } = await supabase.storage.from(BUCKETS.avatars).createSignedUrl(pic, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }
      const st = statsMap[id];
      const tours = await fetchMarketplaceToursForGuide(supabase, id, { isOperator });
      const fn = (row.first_name as string) || "";
      const ln = (row.last_name as string) || "";
      const slug = (prof?.profile_slug as string | null) ?? null;
      const expTierNum =
        prof?.experience_tier_verified != null
          ? (prof.experience_tier_verified as number)
          : expDeclared;

      return {
        id,
        name: `${fn} ${ln}`.trim(),
        firstName: fn,
        lastName: ln,
        isOperator,
        guideNumber: (row.guide_number as string) || null,
        guideTier: tier,
        guideTierLabel: guideTierLabel(tier),
        experienceTier: expTierNum,
        experienceTierLabel: tierDisplay.label,
        experienceTierShortLabel: tierDisplay.shortLabel,
        certificationStatus: (prof?.certification_status as string) || null,
        certificationLabel: certificationStatusLabel(
          (prof?.certification_status as string) || null
        ),
        country: (row.country as string) || null,
        city: (row.city as string) || null,
        rating: st?.ratingAverage ?? null,
        reviewCount: st?.reviewCount ?? 0,
        bookingCount: st?.bookingCount ?? 0,
        marketplaceAvailable: prof ? prof.marketplace_available !== false : true,
        profilePublished,
        profileSlug: slug,
        publicProfileUrl: publicProfileUrl(slug, profilePublished),
        avatarUrl,
        tours,
        tourCount: tours.length,
      };
    })
  );

  const filtered = results.filter(Boolean) as NonNullable<(typeof results)[number]>[];

  filtered.sort((a, b) => {
    // Prefer published marketplace profiles, then activity
    if (a.profilePublished !== b.profilePublished) return a.profilePublished ? -1 : 1;
    if (b.bookingCount !== a.bookingCount) return b.bookingCount - a.bookingCount;
    if (b.tourCount !== a.tourCount) return b.tourCount - a.tourCount;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ ok: true, results: filtered.slice(0, limit) });
}
