import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_COMMISSION_SETTINGS,
  parseCommissionSettings,
  type CommissionSettings,
} from "@/lib/tour-price";

/** First assigned guide per tour (operator-owned tours). */
export async function fetchPrimaryGuideIdByTourId(
  supabase: SupabaseClient,
  tourIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(tourIds.map(String).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("guide_tour_assignments")
    .select("tour_id, guide_id")
    .in("tour_id", ids);

  if (error) {
    console.warn("[guide-commission-for-tour] assignment lookup failed", error.message);
    return out;
  }

  for (const row of data || []) {
    const tourId = String((row as { tour_id?: string | number }).tour_id ?? "");
    const guideId = String((row as { guide_id?: string }).guide_id ?? "");
    if (tourId && guideId && !out.has(tourId)) {
      out.set(tourId, guideId);
    }
  }
  return out;
}

export async function loadGuideCommissionSettingsByUserIds(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, CommissionSettings>> {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  const out = new Map<string, CommissionSettings>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("guide_commission_settings")
    .select("user_id, commission_marketplace_pct, commission_agent_pct, vat_rate_pct")
    .in("user_id", ids);

  if (error) {
    console.warn("[guide-commission-for-tour] settings lookup failed", error.message);
    return out;
  }

  for (const row of data || []) {
    const uid = String((row as { user_id?: string }).user_id ?? "");
    if (uid) {
      out.set(uid, parseCommissionSettings(row as Record<string, unknown>));
    }
  }
  return out;
}

/**
 * Commission for marketplace display: prefer assigned guide (operator tours),
 * otherwise the tour owner (`tour.user_id`, independent guides).
 */
export function resolveCommissionUserIdForTour(
  tourId: string,
  tourOwnerUserId: string,
  primaryGuideByTourId: Map<string, string>
): string {
  return primaryGuideByTourId.get(String(tourId)) ?? String(tourOwnerUserId);
}

export function commissionSettingsForUserId(
  userId: string,
  settingsByUserId: Map<string, CommissionSettings>
): CommissionSettings {
  return settingsByUserId.get(String(userId)) ?? parseCommissionSettings({});
}

/** @deprecated use parseCommissionSettings({}) — kept for explicit default reference */
export { DEFAULT_COMMISSION_SETTINGS };
