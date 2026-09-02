import type { DestinationStay } from "@/lib/itinerary-intake";
import { citiesByDayFromStays } from "@/lib/itinerary-day-summary";

/** Standard proposal cover when Edit Summary title/subtitle were never set. */
export const DEFAULT_PDF_TITLE = "Japan Awaits";
export const DEFAULT_PDF_SUBTITLE = "Welcome to the land of the rising Sun";

export type PdfDefaultItinerary = {
  name?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pdf_title?: string | null;
  pdf_subtitle?: string | null;
  intake_data?: unknown;
};

export type PdfDefaultActivity = {
  location?: string | null;
  title?: string | null;
};

/** Day ids `day-YYYY-MM-DD` for each calendar day in the trip (UTC). */
export function itineraryDayIds(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return out;
  }
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(+s) || Number.isNaN(+e) || e < s) return out;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(`day-${d.toISOString().slice(0, 10)}`);
  }
  return out;
}

/** Fill blank day locations from intake city stay plan. */
export function mergeArrivalLocationsFromStays(
  dayIds: string[],
  existing: Record<string, string> | null | undefined,
  stays?: DestinationStay[] | null
): Record<string, string> {
  const fromStays = citiesByDayFromStays(dayIds, stays);
  const out: Record<string, string> = { ...fromStays };
  for (const id of dayIds) {
    const saved = String(existing?.[id] || "").trim();
    if (saved) out[id] = saved;
  }
  return out;
}

/** Standard PDF cover title when Edit Summary was never filled. */
export function defaultPdfTitle(_itinerary?: PdfDefaultItinerary | null): string {
  return DEFAULT_PDF_TITLE;
}

/** Standard PDF cover subtitle when Edit Summary was never filled. */
export function defaultPdfSubtitle(
  _itinerary?: PdfDefaultItinerary | null,
  _activitiesByDay?: Record<string, PdfDefaultActivity[]> | null
): string {
  return DEFAULT_PDF_SUBTITLE;
}

/** Prefer saved PDF fields; otherwise Japan Awaits / rising Sun defaults. */
export function resolvePdfTitleSubtitle(
  itinerary: PdfDefaultItinerary | null | undefined,
  activitiesByDay?: Record<string, PdfDefaultActivity[]> | null
): { title: string; subtitle: string } {
  const savedTitle = String(itinerary?.pdf_title || "").trim();
  const savedSubtitle = String(itinerary?.pdf_subtitle || "").trim();
  return {
    title: savedTitle || defaultPdfTitle(itinerary),
    subtitle: savedSubtitle || defaultPdfSubtitle(itinerary, activitiesByDay),
  };
}
