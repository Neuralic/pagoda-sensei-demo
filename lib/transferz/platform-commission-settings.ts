import type { SupabaseClient } from "@supabase/supabase-js";

export const TRANSFERZ_PLATFORM_COMMISSION_SETTING_KEY = "transferz_platform_commission_pct";

/** Fallback when DB row is missing or unreadable (matches pre-settings default). */
export const DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT = 30;

const CACHE_TTL_MS = 30_000;
let cached: { pct: number; at: number } | null = null;

export function invalidateTransferzPlatformCommissionCache(): void {
  cached = null;
}

function parseCommissionPct(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return clampPct(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? clampPct(n) : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if ("pct" in rec) return parseCommissionPct(rec.pct);
    if ("value" in rec) return parseCommissionPct(rec.value);
  }
  return null;
}

export function clampTransferzPlatformCommissionPct(pct: number): number {
  return clampPct(pct);
}

function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT;
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
}

export async function getTransferzPlatformCommissionPct(
  supabase: SupabaseClient
): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.pct;
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("value_json")
    .eq("key", TRANSFERZ_PLATFORM_COMMISSION_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("[transferz] load platform commission %:", error.message);
    return DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT;
  }

  const pct = parseCommissionPct(data?.value_json) ?? DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT;
  cached = { pct, at: Date.now() };
  return pct;
}

async function upsertCommissionRow(
  supabase: SupabaseClient,
  normalized: number,
  updatedBy?: string | null
): Promise<{ error: { message: string } | null }> {
  return supabase.from("platform_settings").upsert(
    {
      key: TRANSFERZ_PLATFORM_COMMISSION_SETTING_KEY,
      value_json: normalized,
      updated_at: new Date().toISOString(),
      ...(updatedBy ? { updated_by: updatedBy } : { updated_by: null }),
    },
    { onConflict: "key" }
  );
}

export async function setTransferzPlatformCommissionPct(
  supabase: SupabaseClient,
  pct: number,
  updatedBy?: string | null
): Promise<number> {
  const normalized = clampTransferzPlatformCommissionPct(pct);

  let { error } = await upsertCommissionRow(supabase, normalized, updatedBy);

  // Admin ids are in `admin`, not `users` — retry without audit column if FK still points at users.
  if (
    error &&
    updatedBy &&
    /foreign key|platform_settings_updated_by/i.test(error.message)
  ) {
    ({ error } = await upsertCommissionRow(supabase, normalized, null));
  }

  if (error) {
    throw new Error(error.message);
  }

  invalidateTransferzPlatformCommissionCache();
  return normalized;
}
