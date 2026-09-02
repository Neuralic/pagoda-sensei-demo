/** Helpers for `itinerary_transferz_bookings` rows (advisor + admin invoice views). */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Advisor removed a canceled transfer from the itinerary; row stays for admin invoicing. */
export function isTransferzBookingRemovedFromItinerary(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const at = payload.removedFromItineraryAt;
  return typeof at === "string" && at.trim().length > 0;
}

export function markTransferzBookingRemovedFromItinerary(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...payload,
    removedFromItineraryAt: new Date().toISOString(),
  };
}

export function invoiceTransferRowMatchesSearch(
  row: {
    title?: string | null;
    itinerary_id?: string | null;
    created_by?: string | null;
    created_by_name?: string | null;
    created_by_email?: string | null;
    itinerary_title?: string | null;
    payload?: unknown;
  },
  search: string
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;

  const payload = isRecord(row.payload) ? row.payload : {};
  const bookingCode = String(payload.bookingCode || "").toLowerCase();
  const journeyCode = String(payload.journeyCode || "").toLowerCase();
  const providerBookingId = String(payload.bookingId || "").toLowerCase();

  return (
    String(row.title || "").toLowerCase().includes(q) ||
    String(row.itinerary_id || "").toLowerCase().includes(q) ||
    String(row.itinerary_title || "").toLowerCase().includes(q) ||
    String(row.created_by || "").toLowerCase().includes(q) ||
    String(row.created_by_name || "").toLowerCase().includes(q) ||
    String(row.created_by_email || "").toLowerCase().includes(q) ||
    bookingCode.includes(q) ||
    journeyCode.includes(q) ||
    providerBookingId.includes(q)
  );
}
