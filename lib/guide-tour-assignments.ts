import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKETS } from "@/lib/buckets";
import { guideTierLabel, normalizeGuideTier, type GuideTier } from "@/lib/guide-tier";

export type AssignedGuideSummary = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  guideNumber: string | null;
  guideTier: GuideTier;
  guideTierLabel: string;
  rating: number | null;
  reviewCount: number;
  marketplaceAvailable: boolean;
  avatarUrl: string | null;
  profileSlug: string | null;
};

export type AssignedTourSummary = {
  id: string;
  name: string;
  location: string;
  country: string;
  activityType: string;
  status: string;
  image: string | null;
  operatorId: string;
  operatorName: string;
};

async function signAvatar(
  supabase: SupabaseClient,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await supabase.storage.from(BUCKETS.avatars).createSignedUrl(path, 60 * 60 * 24);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function loadReviewStats(
  supabase: SupabaseClient,
  guideIds: string[]
): Promise<Record<string, { avg: number; count: number }>> {
  if (guideIds.length === 0) return {};
  const { data } = await supabase
    .from("reviews")
    .select("reviewee_id, rating")
    .in("reviewee_id", guideIds)
    .eq("is_visible", true);
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const row of data || []) {
    const id = (row as { reviewee_id?: string }).reviewee_id;
    const rating = (row as { rating?: number }).rating;
    if (!id || rating == null) continue;
    if (!acc[id]) acc[id] = { sum: 0, count: 0 };
    acc[id].sum += rating;
    acc[id].count += 1;
  }
  const out: Record<string, { avg: number; count: number }> = {};
  for (const [id, { sum, count }] of Object.entries(acc)) {
    out[id] = { avg: Math.round((sum / count) * 10) / 10, count };
  }
  return out;
}

export async function fetchAssignedGuidesForTours(
  supabase: SupabaseClient,
  tourIds: string[],
  opts?: { publishedToursOnly?: boolean; tierFilter?: GuideTier | null }
): Promise<Record<string, AssignedGuideSummary[]>> {
  if (tourIds.length === 0) return {};

  // Normalize ids to strings — Postgres bigint comes back as number from Supabase,
  // and Set/object key mismatches (123 vs "123") would drop all assignments.
  const requestedIds = [...new Set(tourIds.map((id) => String(id)).filter(Boolean))];
  if (requestedIds.length === 0) return {};

  let tourQuery = supabase.from("tour").select("id, status").in("id", requestedIds);
  if (opts?.publishedToursOnly) {
    tourQuery = tourQuery.eq("status", "published");
  }
  const { data: tours, error: toursErr } = await tourQuery;
  if (toursErr) {
    console.error("[guide-tour-assignments] fetch tours", toursErr);
    return {};
  }
  const allowedTourIds = new Set((tours || []).map((t) => String((t as { id: string | number }).id)));
  const filteredTourIds = requestedIds.filter((id) => allowedTourIds.has(id));
  if (filteredTourIds.length === 0) return {};

  const { data: rows, error } = await supabase
    .from("guide_tour_assignments")
    .select("tour_id, guide_id")
    .in("tour_id", filteredTourIds);
  if (error) {
    console.error("[guide-tour-assignments] fetch assignments", error);
    return {};
  }
  if (!rows?.length) return {};

  const guideIds = [...new Set(rows.map((r) => String((r as { guide_id: string }).guide_id)))];
  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, guide_number, guide_tier, role")
    .in("id", guideIds);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, profile_picture_path, marketplace_available, profile_slug")
    .in("user_id", guideIds);

  const usersById: Record<string, Record<string, unknown>> = {};
  for (const u of users || []) {
    usersById[String((u as { id: string }).id)] = u as Record<string, unknown>;
  }
  const profilesByUserId: Record<string, Record<string, unknown>> = {};
  for (const p of profiles || []) {
    profilesByUserId[String((p as { user_id: string }).user_id)] = p as Record<string, unknown>;
  }

  const reviewStats = await loadReviewStats(supabase, guideIds);
  const avatarByGuide: Record<string, string | null> = {};
  for (const gid of guideIds) {
    const prof = profilesByUserId[gid];
    const path = prof?.profile_picture_path as string | undefined;
    avatarByGuide[gid] = await signAvatar(supabase, path);
  }

  const byTour: Record<string, AssignedGuideSummary[]> = {};
  for (const row of rows) {
    const tourId = String((row as { tour_id: string | number }).tour_id);
    const guideId = String((row as { guide_id: string }).guide_id);
    const u = usersById[guideId];
    if (!u) continue;
    const tier: GuideTier = normalizeGuideTier(u.guide_tier as string | null);
    if (opts?.tierFilter && tier !== opts.tierFilter) continue;

    const prof = profilesByUserId[guideId];
    const available = prof?.marketplace_available !== false;
    const first = (u.first_name as string) || "";
    const last = (u.last_name as string) || "";
    const stats = reviewStats[guideId];

    const summary: AssignedGuideSummary = {
      id: guideId,
      firstName: first,
      lastName: last,
      name: `${first} ${last}`.trim() || "Guide",
      guideNumber: (u.guide_number as string) || null,
      guideTier: tier,
      guideTierLabel: guideTierLabel(tier),
      rating: stats?.avg ?? null,
      reviewCount: stats?.count ?? 0,
      marketplaceAvailable: available,
      avatarUrl: avatarByGuide[guideId] ?? null,
      profileSlug: (prof?.profile_slug as string | null) || null,
    };

    if (!byTour[tourId]) byTour[tourId] = [];
    byTour[tourId].push(summary);
  }

  for (const tid of Object.keys(byTour)) {
    byTour[tid].sort((a, b) => a.name.localeCompare(b.name));
  }
  return byTour;
}

function mapTourRowsToSummaries(
  tours: Array<Record<string, unknown>>,
  opById: Record<string, string>
): AssignedTourSummary[] {
  return tours.map((row) => {
    const opId = row.user_id as string;
    let image: string | null = null;
    const img = row.image;
    if (Array.isArray(img) && img.length > 0) image = String(img[0]);
    else if (typeof img === "string") image = img;
    return {
      id: String(row.id),
      name: (row.name as string) || "",
      location: (row.location as string) || "",
      country: (row.country as string) || "",
      activityType: (row.activity_type as string) || "",
      status: (row.status as string) || "",
      image,
      operatorId: opId,
      operatorName: opById[opId] || "Operator",
    };
  });
}

export async function fetchAssignedToursForGuide(
  supabase: SupabaseClient,
  guideId: string,
  opts?: { publishedOnly?: boolean; operatorId?: string }
): Promise<AssignedTourSummary[]> {
  let assignQuery = supabase
    .from("guide_tour_assignments")
    .select("tour_id, operator_id")
    .eq("guide_id", guideId);
  if (opts?.operatorId) {
    assignQuery = assignQuery.eq("operator_id", opts.operatorId);
  }
  const { data: assignments } = await assignQuery;
  if (!assignments?.length) return [];

  const tourIds = assignments.map((a) => (a as { tour_id: string }).tour_id);
  let tourQuery = supabase
    .from("tour")
    .select("id, user_id, name, location, country, activity_type, status, image")
    .in("id", tourIds);
  if (opts?.publishedOnly) {
    tourQuery = tourQuery.eq("status", "published");
  }
  const { data: tours } = await tourQuery;
  if (!tours?.length) return [];

  const operatorIds = [...new Set(tours.map((t) => (t as { user_id: string }).user_id))];
  const { data: operators } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .in("id", operatorIds);

  const opById: Record<string, string> = {};
  for (const o of operators || []) {
    const id = (o as { id: string }).id;
    const fn = (o as { first_name?: string }).first_name || "";
    const ln = (o as { last_name?: string }).last_name || "";
    opById[id] = `${fn} ${ln}`.trim() || "Operator";
  }

  return mapTourRowsToSummaries(tours as Array<Record<string, unknown>>, opById);
}

/**
 * Tours shown on Find a guide / public profile:
 * - assigned published tours (guide_tour_assignments)
 * - for tour operators, also published tours they own (tour.user_id)
 */
export async function fetchMarketplaceToursForGuide(
  supabase: SupabaseClient,
  guideId: string,
  opts?: { isOperator?: boolean }
): Promise<AssignedTourSummary[]> {
  const assigned = await fetchAssignedToursForGuide(supabase, guideId, { publishedOnly: true });
  if (!opts?.isOperator) return assigned;

  const { data: owned } = await supabase
    .from("tour")
    .select("id, user_id, name, location, country, activity_type, status, image")
    .eq("user_id", guideId)
    .eq("status", "published")
    .order("name");

  if (!owned?.length) return assigned;

  const { data: opUser } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("id", guideId)
    .maybeSingle();
  const fn = (opUser as { first_name?: string } | null)?.first_name || "";
  const ln = (opUser as { last_name?: string } | null)?.last_name || "";
  const opName = `${fn} ${ln}`.trim() || "Operator";
  const ownedSummaries = mapTourRowsToSummaries(owned as Array<Record<string, unknown>>, {
    [guideId]: opName,
  });

  const byId = new Map<string, AssignedTourSummary>();
  for (const t of [...assigned, ...ownedSummaries]) {
    byId.set(String(t.id), t);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function assertGuideOnOperatorRoster(
  supabase: SupabaseClient,
  operatorId: string,
  guideId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("operator_roster")
    .select("id")
    .eq("operator_id", operatorId)
    .eq("guide_id", guideId)
    .maybeSingle();
  return Boolean(data);
}

/** Operator may assign themself (own marketplace profile) or any roster guide. */
export async function assertGuideAssignableToOperator(
  supabase: SupabaseClient,
  operatorId: string,
  guideId: string
): Promise<boolean> {
  if (guideId === operatorId) return true;
  return assertGuideOnOperatorRoster(supabase, operatorId, guideId);
}

export type GuideProfilePublishStatus = {
  guideId: string;
  ok: boolean;
  profileSlug: string | null;
  guideProfileStatus: string | null;
  reason?: string;
};

/** Published tours must link guides who have a public /g/{slug} profile. */
export async function validateGuidesHavePublishedProfiles(
  supabase: SupabaseClient,
  guideIds: string[]
): Promise<{ ok: boolean; results: GuideProfilePublishStatus[]; error?: string }> {
  const unique = [...new Set(guideIds.filter(Boolean))];
  if (unique.length === 0) {
    return {
      ok: false,
      results: [],
      error: "At least one guide profile must be linked to this tour.",
    };
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, profile_slug, guide_profile_status")
    .in("user_id", unique);

  if (error) {
    return { ok: false, results: [], error: error.message };
  }

  const byUser: Record<string, { profile_slug: string | null; guide_profile_status: string | null }> =
    {};
  for (const p of profiles || []) {
    const uid = (p as { user_id: string }).user_id;
    byUser[uid] = {
      profile_slug: ((p as { profile_slug?: string | null }).profile_slug as string | null) || null,
      guide_profile_status:
        ((p as { guide_profile_status?: string | null }).guide_profile_status as string | null) ||
        null,
    };
  }

  const results: GuideProfilePublishStatus[] = unique.map((guideId) => {
    const prof = byUser[guideId];
    if (!prof) {
      return {
        guideId,
        ok: false,
        profileSlug: null,
        guideProfileStatus: null,
        reason: "Guide has no profile yet. Create and publish a guide profile first.",
      };
    }
    const slug = prof.profile_slug?.trim() || null;
    const status = (prof.guide_profile_status || "").toLowerCase();
    if (!slug) {
      return {
        guideId,
        ok: false,
        profileSlug: null,
        guideProfileStatus: prof.guide_profile_status,
        reason: "Guide profile is missing a public link. Publish the guide profile first.",
      };
    }
    if (status && status !== "published") {
      return {
        guideId,
        ok: false,
        profileSlug: slug,
        guideProfileStatus: prof.guide_profile_status,
        reason: `Guide profile must be published (currently ${prof.guide_profile_status}).`,
      };
    }
    return {
      guideId,
      ok: true,
      profileSlug: slug,
      guideProfileStatus: prof.guide_profile_status,
    };
  });

  const failed = results.find((r) => !r.ok);
  return {
    ok: !failed,
    results,
    error: failed?.reason,
  };
}

/**
 * Replace guide assignments for a tour. Self-assignment is allowed (no roster row required).
 */
export async function setTourGuideAssignments(
  supabase: SupabaseClient,
  operatorId: string,
  tourId: string | number,
  guideIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = [...new Set(guideIds.map((g) => String(g).trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "At least one guide profile must be linked to this tour." };
  }

  for (const gid of unique) {
    if (!(await assertGuideAssignableToOperator(supabase, operatorId, gid))) {
      return {
        ok: false,
        error: gid === operatorId ? "Invalid guide selection." : `Guide is not on your roster.`,
      };
    }
  }

  const profileCheck = await validateGuidesHavePublishedProfiles(supabase, unique);
  if (!profileCheck.ok) {
    return { ok: false, error: profileCheck.error || "Linked guide profiles must be published." };
  }

  const tid = String(tourId);
  // tour_id is bigint — prefer numeric insert when the id is numeric
  const tourIdValue = /^\d+$/.test(tid) ? Number(tid) : tid;

  await supabase
    .from("guide_tour_assignments")
    .delete()
    .eq("operator_id", operatorId)
    .eq("tour_id", tourIdValue);

  const rows = unique.map((guide_id) => ({
    operator_id: operatorId,
    tour_id: tourIdValue,
    guide_id,
  }));
  const { error } = await supabase.from("guide_tour_assignments").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type TourGuideOption = {
  id: string;
  name: string;
  guideNumber: string | null;
  profileSlug: string | null;
  guideProfileStatus: string | null;
  profilePublished: boolean;
  isSelf: boolean;
};

/** Self + roster (when operator) for the tour create/edit guide picker. */
export async function fetchTourGuideOptions(
  supabase: SupabaseClient,
  operatorId: string
): Promise<TourGuideOption[]> {
  const guideIds = new Set<string>([operatorId]);

  const { data: roster } = await supabase
    .from("operator_roster")
    .select("guide_id")
    .eq("operator_id", operatorId);
  for (const row of roster || []) {
    const gid = (row as { guide_id: string }).guide_id;
    if (gid) guideIds.add(gid);
  }

  const ids = [...guideIds];
  const { data: users } = await supabase
    .from("users")
    .select("id, first_name, last_name, guide_number")
    .in("id", ids);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, profile_slug, guide_profile_status")
    .in("user_id", ids);

  const profileByUser: Record<
    string,
    { profile_slug: string | null; guide_profile_status: string | null }
  > = {};
  for (const p of profiles || []) {
    const uid = (p as { user_id: string }).user_id;
    profileByUser[uid] = {
      profile_slug: ((p as { profile_slug?: string | null }).profile_slug as string | null) || null,
      guide_profile_status:
        ((p as { guide_profile_status?: string | null }).guide_profile_status as string | null) ||
        null,
    };
  }

  const options: TourGuideOption[] = (users || []).map((u) => {
    const id = (u as { id: string }).id;
    const first = ((u as { first_name?: string }).first_name as string) || "";
    const last = ((u as { last_name?: string }).last_name as string) || "";
    const prof = profileByUser[id];
    const slug = prof?.profile_slug?.trim() || null;
    const status = (prof?.guide_profile_status || "").toLowerCase();
    const published = Boolean(slug && (!status || status === "published"));
    return {
      id,
      name: `${first} ${last}`.trim() || (id === operatorId ? "You" : "Guide"),
      guideNumber: ((u as { guide_number?: string | null }).guide_number as string | null) || null,
      profileSlug: slug,
      guideProfileStatus: prof?.guide_profile_status ?? null,
      profilePublished: published,
      isSelf: id === operatorId,
    };
  });

  options.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return options;
}

export async function assertTourOwnedByOperator(
  supabase: SupabaseClient,
  operatorId: string,
  tourId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("tour")
    .select("id")
    .eq("id", tourId)
    .eq("user_id", operatorId)
    .maybeSingle();
  return Boolean(data);
}
