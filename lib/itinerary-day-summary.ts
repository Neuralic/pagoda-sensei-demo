/**
 * Build itinerary day summary lines from booked activities for that day.
 * Empty days get a leisure placeholder so advisors don't type every day by hand.
 */

import type { DestinationStay } from "@/lib/itinerary-intake";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";

export const LEISURE_DAY_SUMMARY = "Today is at your leisure";

export type DaySummaryActivityLike = {
  title?: string | null;
  name?: string | null;
  activity_type?: string | null;
  subtitle?: string | null;
  location?: string | null;
  transferzJourneyCanceled?: boolean | null;
  status?: string | null;
};

function activitySummaryLabel(a: DaySummaryActivityLike): string | null {
  if (a.transferzJourneyCanceled) return null;
  const status = String(a.status || "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return null;

  // Prefer tour/activity title so the PDF trip summary shows what was booked
  const name = String(a.title || a.name || "").trim();
  if (name) return name;

  const type = canonicalizeActivityTypeLabel(a.activity_type || a.subtitle || "") || String(a.activity_type || a.subtitle || "").trim();
  return type || null;
}

/** Prefer tour/activity title for “Today’s main event”; fall back to type. */
export function dayMainEventFromActivities(
  activities: DaySummaryActivityLike[] | null | undefined
): string {
  for (const a of activities || []) {
    if (a.transferzJourneyCanceled) continue;
    const status = String(a.status || "").toLowerCase();
    if (status === "canceled" || status === "cancelled") continue;

    const title = String(a.title || a.name || "").trim();
    if (title) return title;

    const type = canonicalizeActivityTypeLabel(a.activity_type || a.subtitle || "") || String(a.activity_type || a.subtitle || "").trim();
    if (type) return type;
  }
  return "";
}

export function dayLocationFromActivities(
  activities: DaySummaryActivityLike[] | null | undefined
): string {
  for (const a of activities || []) {
    if (a.transferzJourneyCanceled) continue;
    const status = String(a.status || "").toLowerCase();
    if (status === "canceled" || status === "cancelled") continue;
    const loc = String(a.location || "").trim();
    if (loc) return loc;
  }
  return "";
}

/**
 * Map city stay nights onto consecutive itinerary days (day 1 = first night city).
 * e.g. Tokyo 3 → Kyoto 2 fills days 1–3 Tokyo, days 4–5 Kyoto.
 * Hotel name follows the same night span as its city.
 * Trip calendar days = nights + 1; leftover days (usually departure) keep the last city.
 */
export function staysByDayFromStays(
  dayIds: string[],
  stays?: DestinationStay[] | null
): Record<string, { city: string; hotelName: string }> {
  const out: Record<string, { city: string; hotelName: string }> = {};
  if (!dayIds.length) return out;

  const cleaned = (stays ?? [])
    .map((s) => ({
      city: String(s.city || "").trim(),
      hotelName: String(s.hotelName || "").trim(),
      nights: Math.max(0, Math.floor(Number(s.nights) || 0)),
    }))
    .filter((s) => s.city.length > 0);

  if (!cleaned.length) return out;

  let dayIndex = 0;
  for (const stay of cleaned) {
    const span = Math.max(1, stay.nights);
    for (let n = 0; n < span && dayIndex < dayIds.length; n += 1) {
      out[dayIds[dayIndex]] = {
        city: stay.city,
        hotelName: stay.hotelName,
      };
      dayIndex += 1;
    }
  }
  // Leftover days after stay plan ends keep the last city/hotel
  if (dayIndex > 0 && dayIndex < dayIds.length) {
    const last = out[dayIds[dayIndex - 1]];
    for (; dayIndex < dayIds.length; dayIndex += 1) {
      out[dayIds[dayIndex]] = { ...last };
    }
  }
  return out;
}

export function citiesByDayFromStays(
  dayIds: string[],
  stays?: DestinationStay[] | null
): Record<string, string> {
  const staysByDay = staysByDayFromStays(dayIds, stays);
  const out: Record<string, string> = {};
  for (const [dayId, stay] of Object.entries(staysByDay)) {
    out[dayId] = stay.city;
  }
  return out;
}

export function hotelsByDayFromStays(
  dayIds: string[],
  stays?: DestinationStay[] | null
): Record<string, string> {
  const staysByDay = staysByDayFromStays(dayIds, stays);
  const out: Record<string, string> = {};
  for (const [dayId, stay] of Object.entries(staysByDay)) {
    if (stay.hotelName) out[dayId] = stay.hotelName;
  }
  return out;
}

/** Unique activity labels for one day (tour title preferred). */
export function summaryLinesFromActivities(
  activities: DaySummaryActivityLike[] | null | undefined
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const a of activities || []) {
    const label = activitySummaryLabel(a);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  if (labels.length === 0) return [LEISURE_DAY_SUMMARY];
  return labels;
}

/** True when the day has no meaningful advisor-entered summary yet (incl. leisure placeholder). */
export function isBlankDaySummary(summary: string[] | null | undefined): boolean {
  if (!summary || summary.length === 0) return true;
  return summary.every((line) => {
    const t = String(line || "").trim();
    return !t || t === LEISURE_DAY_SUMMARY;
  });
}

/**
 * Merge booked tour/activity titles into the day summary.
 * Blank/leisure days are replaced; custom notes are kept and missing tour titles are appended.
 * Lines that exactly match a current activity title are treated as auto-managed (re-added from activities).
 */
export function mergeDaySummaryWithActivities(
  existing: string[] | null | undefined,
  activities: DaySummaryActivityLike[] | null | undefined
): string[] {
  const fromActivities = summaryLinesFromActivities(activities);
  const activityOnly = fromActivities.filter((l) => l !== LEISURE_DAY_SUMMARY);
  const activityKeys = new Set(activityOnly.map((l) => l.toLowerCase()));

  if (isBlankDaySummary(existing)) {
    return fromActivities;
  }

  if (activityOnly.length === 0) {
    return (existing || []).map((l) => String(l || "")).filter((l) => l.trim());
  }

  const merged: string[] = [];
  const seen = new Set<string>();

  // Keep custom advisor notes only (not current auto tour titles — those come from activities)
  for (const line of existing || []) {
    const t = String(line || "").trim();
    if (!t || t === LEISURE_DAY_SUMMARY) continue;
    const key = t.toLowerCase();
    if (activityKeys.has(key)) continue; // will re-add from activities below
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }

  for (const line of activityOnly) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(line);
  }

  return merged.length > 0 ? merged : [LEISURE_DAY_SUMMARY];
}

export function buildDaySummariesFromActivities(
  dayIds: string[],
  activitiesByDay: Record<string, DaySummaryActivityLike[]> | null | undefined
): Record<string, { summary: string[] }> {
  const out: Record<string, { summary: string[] }> = {};
  for (const dayId of dayIds) {
    out[dayId] = {
      summary: summaryLinesFromActivities(activitiesByDay?.[dayId]),
    };
  }
  return out;
}

export type DayPdfDefaults = {
  summary: string[];
  arrivalHeading: string;
  arrivalLocation: string;
};

/** Summaries + main event + location defaults for each day (blank fields only when applied). */
export function buildDayPdfDefaults(
  dayIds: string[],
  activitiesByDay?: Record<string, DaySummaryActivityLike[]> | null,
  destinationStays?: DestinationStay[] | null
): Record<string, DayPdfDefaults> {
  const summaries = buildDaySummariesFromActivities(dayIds, activitiesByDay);
  const citiesFromStays = citiesByDayFromStays(dayIds, destinationStays);
  const out: Record<string, DayPdfDefaults> = {};
  for (const dayId of dayIds) {
    const acts = activitiesByDay?.[dayId];
    out[dayId] = {
      summary: summaries[dayId].summary,
      arrivalHeading: dayMainEventFromActivities(acts),
      // City stay plan is the destination source of truth for each day
      arrivalLocation:
        citiesFromStays[dayId] || dayLocationFromActivities(acts) || "",
    };
  }
  return out;
}

export type DayPdfFieldMaps = {
  trips_summary: Record<string, { summary: string[] }>;
  arrival_heading: Record<string, string>;
};

function parseJsonRecord<T extends Record<string, unknown>>(raw: unknown): T {
  if (!raw) return {} as T;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as T)
        : ({} as T);
    } catch {
      return {} as T;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as T;
  return {} as T;
}

/** Day key used in trips_summary / arrival_heading (`day-YYYY-MM-DD`). */
export function itineraryDayIdFromIsoDate(isoOrDateTime: string | null | undefined): string | null {
  const raw = String(isoOrDateTime || "").trim();
  if (!raw) return null;
  const iso = raw.length >= 10 ? raw.slice(0, 10) : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return `day-${iso}`;
}

/**
 * When a tour is removed, drop its auto-added title from that day's PDF summary
 * and clear “main event” heading if it still names that tour.
 */
export function removeActivityTitleFromDayPdfFields(
  tripsSummaryRaw: unknown,
  arrivalHeadingRaw: unknown,
  dayId: string | null | undefined,
  title: string | null | undefined
): { fields: DayPdfFieldMaps; changed: boolean } {
  const tripsParsed = parseJsonRecord<{ summary?: string[] }>(tripsSummaryRaw) as Record<
    string,
    { summary?: string[] }
  >;
  const trips_summary: Record<string, { summary: string[] }> = {};
  for (const [k, v] of Object.entries(tripsParsed)) {
    trips_summary[k] = {
      summary: Array.isArray(v?.summary) ? v.summary.map((l) => String(l ?? "")) : [],
    };
  }
  const arrival_heading = { ...parseJsonRecord<Record<string, string>>(arrivalHeadingRaw) };
  const dayKey = String(dayId || "").trim();
  const needle = String(title || "").trim().toLowerCase();
  if (!dayKey || !needle) {
    return { fields: { trips_summary, arrival_heading }, changed: false };
  }

  let changed = false;
  const daySummary = trips_summary[dayKey];
  if (daySummary && Array.isArray(daySummary.summary)) {
    const nextLines = daySummary.summary
      .map((l) => String(l || "").trim())
      .filter((l) => l && l.toLowerCase() !== needle);
    if (nextLines.length !== daySummary.summary.length) {
      changed = true;
      if (nextLines.length === 0) {
        trips_summary[dayKey] = { summary: [LEISURE_DAY_SUMMARY] };
      } else {
        trips_summary[dayKey] = { summary: nextLines };
      }
    }
  }

  const heading = String(arrival_heading[dayKey] || "").trim();
  if (heading && heading.toLowerCase() === needle) {
    arrival_heading[dayKey] = "";
    changed = true;
  }

  return { fields: { trips_summary, arrival_heading }, changed };
}

/**
 * Clear day “main event” headings (and matching summary lines) that no longer
 * match any activity on that day — fixes leftover titles after past deletes.
 */
export function reconcileOrphanDayHeadingsWithActivities(
  tripsSummaryRaw: unknown,
  arrivalHeadingRaw: unknown,
  activitiesByDay: Record<string, DaySummaryActivityLike[]> | null | undefined
): { fields: DayPdfFieldMaps; changed: boolean } {
  const trips_summary = parseJsonRecord<{ summary?: string[] }>(
    tripsSummaryRaw
  ) as Record<string, { summary: string[] }>;
  const arrival_heading = {
    ...parseJsonRecord<Record<string, string>>(arrivalHeadingRaw),
  };
  let changed = false;

  const dayIds = new Set([
    ...Object.keys(arrival_heading),
    ...Object.keys(trips_summary),
    ...Object.keys(activitiesByDay || {}),
  ]);

  for (const dayId of dayIds) {
    const heading = String(arrival_heading[dayId] || "").trim();
    if (!heading) continue;
    const acts = activitiesByDay?.[dayId] || [];
    const titles = new Set(
      acts
        .map((a) => activitySummaryLabel(a))
        .filter((t): t is string => Boolean(t))
        .map((t) => t.toLowerCase())
    );
    if (titles.has(heading.toLowerCase())) continue;

    const pruned = removeActivityTitleFromDayPdfFields(
      trips_summary,
      arrival_heading,
      dayId,
      heading
    );
    Object.assign(trips_summary, pruned.fields.trips_summary);
    Object.assign(arrival_heading, pruned.fields.arrival_heading);
    if (pruned.changed) changed = true;
  }

  return { fields: { trips_summary, arrival_heading }, changed };
}
