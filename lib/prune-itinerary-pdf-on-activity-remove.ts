import type { SupabaseClient } from "@supabase/supabase-js";
import {
  itineraryDayIdFromIsoDate,
  removeActivityTitleFromDayPdfFields,
} from "@/lib/itinerary-day-summary";

/**
 * After a job/transfer is deleted, remove its auto-filled title from that day's
 * PDF summary + arrival heading so ghost tour names don't linger in the UI/PDF.
 */
export async function pruneItineraryPdfFieldsAfterActivityRemoved(
  supabase: SupabaseClient,
  opts: {
    itineraryId: string;
    title: string | null | undefined;
    /** ISO date or datetime of the activity day */
    activityDate: string | null | undefined;
  }
): Promise<void> {
  const itineraryId = String(opts.itineraryId || "").trim();
  const title = String(opts.title || "").trim();
  const dayId = itineraryDayIdFromIsoDate(opts.activityDate);
  if (!itineraryId || !title || !dayId) return;

  const { data: row, error } = await supabase
    .from("itineraries")
    .select("trips_summary, arrival_heading")
    .eq("id", itineraryId)
    .maybeSingle();

  if (error || !row) return;

  const { fields, changed } = removeActivityTitleFromDayPdfFields(
    row.trips_summary,
    row.arrival_heading,
    dayId,
    title
  );
  if (!changed) return;

  await supabase
    .from("itineraries")
    .update({
      trips_summary: fields.trips_summary,
      arrival_heading: fields.arrival_heading,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itineraryId);
}
