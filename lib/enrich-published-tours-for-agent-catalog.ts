import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKETS } from "@/lib/buckets";
import {
  computeGuideTotalFromTour,
  getAgentDisplayTotalRounded,
  getDisplayTotalExact,
  parseCommissionSettings,
} from "@/lib/tour-price";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";
import {
  commissionSettingsForUserId,
  fetchPrimaryGuideIdByTourId,
  loadGuideCommissionSettingsByUserIds,
  resolveCommissionUserIdForTour,
} from "@/lib/guide-commission-for-tour";

/** Raw rows from `tour` with the agent-catalog select shape. */
export type TourRowForAgentCatalog = Record<string, unknown> & {
  user_id: string;
  pricing_model?: string | null;
  price_per_adult?: number | null;
  price_per_child?: number | null;
  price_per_infant?: number | null;
  base_rate?: number | null;
  base_group_size?: number | null;
  max_group_size?: number | null;
  additional_per_person_rate?: number | null;
};

/**
 * Enrich published tour rows with guide users, avatars, and agent-facing prices
 * (same shape as GET /api/tour/all).
 */
export async function enrichPublishedToursForAgentCatalog(
  supabase: SupabaseClient,
  tours: TourRowForAgentCatalog[] | null,
  isAdmin: boolean
): Promise<Record<string, unknown>[]> {
  const list = tours || [];
  const userIds = [...new Set(list.map((t) => t.user_id).filter((id): id is string => !!id))];

  let users: Array<Record<string, unknown>> = [];
  let profiles: Array<Record<string, unknown>> = [];

  if (userIds.length > 0) {
    const { data: uData, error: usersErr } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .in("id", userIds);

    if (usersErr) {
      throw new Error(usersErr.message);
    }
    users = uData || [];

    const { data: pData, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, user_id, profile_picture_path")
      .in("user_id", userIds);

    if (profilesErr) {
      throw new Error(profilesErr.message);
    }
    profiles = pData || [];
  }

  const usersById: Record<string, Record<string, unknown>> = {};
  for (const u of users) {
    const id = u?.id;
    if (typeof id === "string") usersById[id] = u;
  }

  const profilesByUserId: Record<string, Record<string, unknown>> = {};
  for (const p of profiles) {
    const uid = p?.user_id;
    if (typeof uid === "string") profilesByUserId[uid] = p;
  }

  const guideIds = userIds;
  const tourIds = list.map((t) => String(t.id ?? "")).filter(Boolean);
  const primaryGuideByTourId = await fetchPrimaryGuideIdByTourId(supabase, tourIds);
  const commissionUserIds = [
    ...new Set([
      ...guideIds,
      ...Array.from(primaryGuideByTourId.values()),
    ]),
  ];
  const settingsByGuideIdMap = await loadGuideCommissionSettingsByUserIds(supabase, commissionUserIds);

  return list.map((tour) => {
    const user = usersById[tour.user_id] || null;
    const profile = profilesByUserId[tour.user_id] || null;

    const agencyName = user
      ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Agency"
      : "Agency";

    let avatarUrl: string | null = null;
    const path = profile?.profile_picture_path;
    if (typeof path === "string" && path) {
      try {
        const { data: pub } = supabase.storage.from(BUCKETS.avatars).getPublicUrl(path);
        avatarUrl = (pub as Record<string, unknown> | null)?.publicUrl as string || null;
      } catch {
        avatarUrl = null;
      }
    }

    const pricePerAdult = tour.price_per_adult != null ? Number(tour.price_per_adult) : null;
    const pricePerChild = tour.price_per_child != null ? Number(tour.price_per_child) : null;
    const pricePerInfant = tour.price_per_infant != null ? Number(tour.price_per_infant) : null;
    const isGroupRate = tour.pricing_model === "group_rate";
    const baseGroupSize = tour.base_group_size != null ? Number(tour.base_group_size) : 1;

    const commissionUserId = resolveCommissionUserIdForTour(
      String(tour.id ?? ""),
      tour.user_id,
      primaryGuideByTourId
    );
    const commissionSettings =
      commissionSettingsForUserId(
        commissionUserId,
        settingsByGuideIdMap
      );
    let guideTotalForDisplay: number | null = null;
    const participantsForFromPrice = isGroupRate
      ? { adults: baseGroupSize, children: 0, infants: 0 }
      : { adults: 1, children: 0, infants: 0 };
    const pricingResult = computeGuideTotalFromTour(
      {
        pricing_model: tour.pricing_model,
        price_per_adult: tour.price_per_adult,
        price_per_child: tour.price_per_child,
        price_per_infant: tour.price_per_infant,
        base_rate: tour.base_rate,
        base_group_size: tour.base_group_size,
        max_group_size: tour.max_group_size,
        additional_per_person_rate: tour.additional_per_person_rate,
      },
      participantsForFromPrice
    );
    if (pricingResult) guideTotalForDisplay = pricingResult.guideTotal;
    const hasPerPerson =
      pricePerAdult != null && pricePerChild != null && pricePerInfant != null;

    const hasPrice =
      guideTotalForDisplay != null &&
      Number.isFinite(guideTotalForDisplay) &&
      guideTotalForDisplay >= 0;

    const agentDisplayTotalRounded =
      hasPrice && guideTotalForDisplay != null
        ? getAgentDisplayTotalRounded(
            guideTotalForDisplay,
            commissionSettings.commissionMarketplacePct,
            commissionSettings.commissionAgentPct,
            commissionSettings.vatRatePct
          )
        : null;

    const displayPricePerAdultExact = hasPerPerson
      ? getDisplayTotalExact(
          pricePerAdult!,
          commissionSettings.commissionMarketplacePct,
          commissionSettings.commissionAgentPct,
          commissionSettings.vatRatePct
        )
      : null;
    const displayPricePerChildExact = hasPerPerson
      ? getDisplayTotalExact(
          pricePerChild!,
          commissionSettings.commissionMarketplacePct,
          commissionSettings.commissionAgentPct,
          commissionSettings.vatRatePct
        )
      : null;
    const displayPricePerInfantExact = hasPerPerson
      ? getDisplayTotalExact(
          pricePerInfant!,
          commissionSettings.commissionMarketplacePct,
          commissionSettings.commissionAgentPct,
          commissionSettings.vatRatePct
        )
      : null;

    const out: Record<string, unknown> = {
      ...tour,
      activity_type: canonicalizeActivityTypeLabel(
        typeof tour.activity_type === "string" ? tour.activity_type : ""
      ),
      agent: {
        id: tour.user_id,
        name: agencyName,
        user: user
          ? {
              id: user.id,
              firstName: user.first_name,
              lastName: user.last_name,
              email: user.email,
            }
          : null,
        profile: profile
          ? {
              id: profile.id,
              userId: profile.user_id,
              avatarPath: profile.profile_picture_path,
              avatarUrl,
            }
          : null,
      },
    };
    delete out.guide_price;
    if (hasPerPerson) {
      out.pricePerAdult = pricePerAdult;
      out.pricePerChild = pricePerChild;
      out.pricePerInfant = pricePerInfant;
    }
    if (agentDisplayTotalRounded != null) {
      out.displayPrice = agentDisplayTotalRounded;
      out.priceLabel = isGroupRate
        ? `From (up to ${baseGroupSize} people)`
        : "From (1 adult)";
      if (isAdmin && guideTotalForDisplay != null) {
        out.guidePrice = guideTotalForDisplay;
      }
    }
    out.priceDisplayCommissions = {
      commissionMarketplacePct: commissionSettings.commissionMarketplacePct,
      commissionAgentPct: commissionSettings.commissionAgentPct,
      vatRatePct: commissionSettings.vatRatePct,
    };
    if (
      displayPricePerAdultExact != null &&
      displayPricePerChildExact != null &&
      displayPricePerInfantExact != null
    ) {
      out.displayPricePerAdult = displayPricePerAdultExact;
      out.displayPricePerChild = displayPricePerChildExact;
      out.displayPricePerInfant = displayPricePerInfantExact;
    }
    return out;
  });
}
