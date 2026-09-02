import type { SupabaseClient } from "@supabase/supabase-js";
import { getGuideBookingCount } from "@/lib/guide-profile-stats";

export type GuideAvailabilityCalendar = {
  unavailableDates: string[];
  updatedAt: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyAvailabilityCalendar(): GuideAvailabilityCalendar {
  return { unavailableDates: [], updatedAt: null };
}

export function parseAvailabilityCalendar(raw: unknown): GuideAvailabilityCalendar {
  if (!raw || typeof raw !== "object") return emptyAvailabilityCalendar();
  const o = raw as Record<string, unknown>;
  const dates = Array.isArray(o.unavailableDates)
    ? normalizeUnavailableDates(o.unavailableDates.map(String))
    : [];
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : null;
  return { unavailableDates: dates, updatedAt };
}

export function normalizeUnavailableDates(dates: string[]): string[] {
  const set = new Set<string>();
  for (const d of dates) {
    const t = d.trim();
    if (DATE_RE.test(t)) set.add(t);
  }
  return [...set].sort();
}

/** True after the guide or operator has saved the calendar at least once. */
export function isAvailabilityConfigured(cal: GuideAvailabilityCalendar): boolean {
  return Boolean(cal.updatedAt);
}

export function isDateUnavailable(cal: GuideAvailabilityCalendar, ymd: string): boolean {
  return cal.unavailableDates.includes(ymd);
}

export function toYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function serializeAvailabilityCalendar(
  unavailableDates: string[],
  markConfigured = true
): GuideAvailabilityCalendar {
  return {
    unavailableDates: normalizeUnavailableDates(unavailableDates),
    updatedAt: markConfigured ? new Date().toISOString() : null,
  };
}

export async function fetchGuideAvailability(
  supabase: SupabaseClient,
  guideUserId: string
): Promise<GuideAvailabilityCalendar> {
  const { data } = await supabase
    .from("profiles")
    .select("guide_availability_calendar")
    .eq("user_id", guideUserId)
    .maybeSingle();
  return parseAvailabilityCalendar(data?.guide_availability_calendar);
}

export type AvailabilityGateResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * §3.3 — required before first booking (no prior job_hiring_history rows).
 */
export async function requireGuideAvailabilityForFirstBooking(
  supabase: SupabaseClient,
  guideUserId: string,
  opts?: { jobStartIso?: string | null }
): Promise<AvailabilityGateResult> {
  const bookingCount = await getGuideBookingCount(supabase, guideUserId);
  if (bookingCount > 0) return { ok: true };

  const cal = await fetchGuideAvailability(supabase, guideUserId);
  if (!isAvailabilityConfigured(cal)) {
    return {
      ok: false,
      status: 400,
      error:
        "Availability calendar is required before the first booking. Open Settings → Guide marketplace profile (or My Guides → edit guide) and save your calendar.",
    };
  }

  const jobYmd = opts?.jobStartIso ? toYmdFromIso(opts.jobStartIso) : null;
  if (jobYmd && isDateUnavailable(cal, jobYmd)) {
    return {
      ok: false,
      status: 400,
      error: `This guide marked ${jobYmd} as unavailable on their calendar.`,
    };
  }

  return { ok: true };
}
