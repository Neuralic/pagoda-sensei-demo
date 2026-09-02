import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clampFxProtectionPct,
  DEFAULT_FX_PROTECTION_PCT,
  invalidateFxRateCache,
} from "@/lib/fx-rate";

export const FX_PROTECTION_SETTING_KEY = "fx_protection_pct";

const CACHE_TTL_MS = 30_000;
let cachedPct: { pct: number; at: number } | null = null;

export function invalidateFxProtectionPctCache(): void {
  cachedPct = null;
}

function parsePctValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return clampFxProtectionPct(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? clampFxProtectionPct(n) : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if ("pct" in rec) return parsePctValue(rec.pct);
    if ("value" in rec) return parsePctValue(rec.value);
  }
  return null;
}

export async function getFxProtectionPct(supabase: SupabaseClient): Promise<number> {
  if (cachedPct && Date.now() - cachedPct.at < CACHE_TTL_MS) {
    return cachedPct.pct;
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("value_json")
    .eq("key", FX_PROTECTION_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("[fx] load protection %:", error.message);
    return DEFAULT_FX_PROTECTION_PCT;
  }

  const pct = parsePctValue(data?.value_json) ?? DEFAULT_FX_PROTECTION_PCT;
  cachedPct = { pct, at: Date.now() };
  return pct;
}

async function upsertPctRow(
  supabase: SupabaseClient,
  normalized: number,
  updatedBy?: string | null
): Promise<{ error: { message: string } | null }> {
  return supabase.from("platform_settings").upsert(
    {
      key: FX_PROTECTION_SETTING_KEY,
      value_json: normalized,
      updated_at: new Date().toISOString(),
      ...(updatedBy ? { updated_by: updatedBy } : { updated_by: null }),
    },
    { onConflict: "key" }
  );
}

export async function setFxProtectionPct(
  supabase: SupabaseClient,
  pct: number,
  updatedBy?: string | null
): Promise<number> {
  const normalized = clampFxProtectionPct(pct);

  let { error } = await upsertPctRow(supabase, normalized, updatedBy);

  if (
    error &&
    updatedBy &&
    /foreign key|platform_settings_updated_by/i.test(error.message)
  ) {
    ({ error } = await upsertPctRow(supabase, normalized, null));
  }

  if (error) {
    throw new Error(error.message);
  }

  invalidateFxProtectionPctCache();
  invalidateFxRateCache();
  return normalized;
}
