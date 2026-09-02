export type ItineraryTimeframe = "upcoming" | "completed";

/** Today's date in UTC as YYYY-MM-DD (matches itinerary end_date storage). */
export function todayUtcDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseItineraryTimeframe(value: string | null): ItineraryTimeframe | null {
  if (value === "upcoming" || value === "completed") return value;
  return null;
}

/** True when the trip end date is before today (UTC calendar date). */
export function isItineraryPast(
  endDate: string | null | undefined,
  now = new Date()
): boolean {
  if (!endDate || typeof endDate !== "string") return false;
  const day = endDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day < todayUtcDateString(now);
}

/**
 * Archive = past trip dates, or explicit archived status.
 * Used to move finished itineraries out of active Draft / Published lists.
 */
export function isItineraryArchived(it: {
  endDate?: string | null;
  end_date?: string | null;
  status?: string | null;
}, now = new Date()): boolean {
  if (String(it.status || "").toLowerCase() === "archived") return true;
  return isItineraryPast(it.endDate ?? it.end_date, now);
}
