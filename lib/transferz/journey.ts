import { commissionPriceFieldsFromProvider } from "./commission";

/**
 * Transferz journey helpers (Warp Drive booking payloads).
 * Cancellation policy fields are documented on each journey (e.g. `cancellationDetails`).
 *
 * @see https://developers.transferz.com/ — Partner Postman workspace for cancel / booking GET shapes.
 */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const CANCELED_STATUSES = new Set(
  [
    "CANCELLED",
    "CANCELED",
    "CANCELLED_FREE",
    "CANCELLED_WITH_COSTS",
    "BOOKER_CANCELLED",
    "SUPPLIER_CANCELLED",
    "CANCELLED_BY_PARTNER",
    "CANCELLED_BY_CUSTOMER",
    "CANCELLED_BY_OPERATOR",
    "VOID",
    "VOIDED",
  ].map((s) => s.toUpperCase())
);

export function isTransferzJourneyCanceledStatus(status: string | null | undefined): boolean {
  if (!status || typeof status !== "string") return false;
  return CANCELED_STATUSES.has(status.trim().toUpperCase());
}

/** Count journeys on a GET `/partners/bookings/{id}` payload (for safe booking-level cancel fallback). */
export function countTransferzJourneysInBooking(booking: unknown): number {
  if (!isRecord(booking)) return 0;
  const journeys = booking.journeys;
  return Array.isArray(journeys) ? journeys.length : 0;
}

/**
 * Whether the first cancel attempt should send `acceptCharges: true`.
 * Outside the free-cancellation window (or unknown / not cancellable), default to true per Warp Drive rules.
 */
export function transferzCancelFirstAttemptAcceptCharges(cancellationDetails: unknown): boolean {
  if (!isRecord(cancellationDetails)) return true;
  if (cancellationDetails.cancellable === false) return true;
  const untilRaw = cancellationDetails.freeCancellationUntil;
  if (typeof untilRaw === "string" && untilRaw.trim()) {
    const until = new Date(untilRaw.trim());
    if (!Number.isNaN(until.getTime())) {
      return Date.now() > until.getTime();
    }
  }
  return false;
}

/**
 * After `freeCancellationUntil`, Transferz only allows changes that do not affect price
 * (e.g. traveller name, driver comments). Pickup time / add-ons must not be sent.
 *
 * @see https://developers.transferz.com/docs/modify-bookings — free cancellation period
 */
export function transferzPastFreeCancellationDeadline(cancellationDetails: unknown): boolean {
  if (!isRecord(cancellationDetails)) return false;
  const untilRaw = cancellationDetails.freeCancellationUntil;
  if (typeof untilRaw !== "string" || !untilRaw.trim()) return false;
  const until = new Date(untilRaw.trim());
  if (Number.isNaN(until.getTime())) return false;
  return Date.now() > until.getTime();
}

/** Normalise `payload.journeyId` for partner APIs and `pickJourneyFromBookingBody`. */
export function journeyIdFromTransferzPayloadValue(v: unknown): string | number | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function pickJourneyFromBookingBody(
  booking: unknown,
  journeyId: string | number | null | undefined
): Record<string, unknown> | null {
  if (!isRecord(booking)) return null;
  const journeys = booking.journeys;
  if (!Array.isArray(journeys) || journeys.length === 0) return null;
  const want = journeyId != null && journeyId !== "" ? String(journeyId) : null;
  for (const j of journeys) {
    if (!isRecord(j)) continue;
    if (!want) return j;
    const id = j.id;
    if (id != null && String(id) === want) return j;
  }
  const j0 = journeys[0];
  return isRecord(j0) ? j0 : null;
}

export function mergeTransferzPayloadFromJourney(
  payload: Record<string, unknown>,
  journey: Record<string, unknown> | null,
  commissionPct: number
): Record<string, unknown> {
  if (!journey) return { ...payload };
  const next = { ...payload };
  if (typeof journey.status === "string") {
    next.journeyStatus = journey.status;
  }
  if (journey.cancellationDetails !== undefined) {
    next.cancellationDetails = journey.cancellationDetails;
  }
  if (typeof journey.travellerAppUrl === "string" || journey.travellerAppUrl === null) {
    next.travellerAppUrl = journey.travellerAppUrl;
  }
  const ps = journey.priceSummary;
  if (isRecord(ps)) {
    if (typeof ps.price === "number" && Number.isFinite(ps.price)) {
      Object.assign(next, commissionPriceFieldsFromProvider(ps.price, commissionPct));
    }
    if (typeof ps.currency === "string") {
      next.currency = ps.currency;
    }
  }

  const ji = isRecord(journey.travellerInfo) ? journey.travellerInfo : null;
  const jr = isRecord(journey.traveller) ? journey.traveller : null;
  const pickStr = (a: string | undefined, b: string | undefined): string | undefined => {
    const x = typeof a === "string" && a.trim() ? a.trim() : "";
    if (x) return x;
    const y = typeof b === "string" && b.trim() ? b.trim() : "";
    return y || undefined;
  };
  const first = pickStr(
    ji && typeof ji.firstName === "string" ? ji.firstName : undefined,
    jr && typeof jr.firstName === "string" ? jr.firstName : undefined
  );
  if (first) next.travellerFirst = first;
  const last = pickStr(
    ji && typeof ji.lastName === "string" ? ji.lastName : undefined,
    jr && typeof jr.lastName === "string" ? jr.lastName : undefined
  );
  if (last) next.travellerLast = last;
  const email = pickStr(
    ji && typeof ji.email === "string" ? ji.email : undefined,
    jr && typeof jr.email === "string" ? jr.email : undefined
  );
  if (email) next.travellerEmail = email;
  const phone = pickStr(
    ji && typeof ji.phone === "string" ? ji.phone : undefined,
    jr && typeof jr.phone === "string" ? jr.phone : undefined
  );
  if (phone) next.travellerPhone = phone;
  const flightNr = pickStr(
    ji && typeof ji.flightNumber === "string" ? ji.flightNumber : undefined,
    jr && typeof jr.flightNumber === "string" ? jr.flightNumber : undefined
  );
  const flightNrAlt =
    !flightNr && jr && typeof jr.flightNr === "string" && jr.flightNr.trim() ? jr.flightNr.trim() : undefined;
  const fn = flightNr || flightNrAlt;
  if (fn) next.travellerFlightNumber = fn;
  else if (typeof journey.flightNumber === "string" && journey.flightNumber.trim()) {
    next.travellerFlightNumber = journey.flightNumber.trim();
  }

  if (Array.isArray(journey.travelAddons)) {
    next.transferzTravelAddons = journey.travelAddons;
  }

  return next;
}

/** Human-readable line for itinerary UI / preview modal. */
export function formatTransferzFreeCancellationSummary(details: unknown): string | null {
  if (!isRecord(details)) return null;
  const untilRaw = details.freeCancellationUntil;
  const hoursRaw = details.freeCancellationWindowHours;
  const cancellable = details.cancellable;

  const parts: string[] = [];

  if (typeof untilRaw === "string" && untilRaw.trim()) {
    const d = new Date(untilRaw);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        `Free cancellation until ${d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}`
      );
    } else {
      parts.push(`Free cancellation until ${untilRaw.trim()}`);
    }
  } else if (typeof hoursRaw === "number" && Number.isFinite(hoursRaw) && hoursRaw > 0) {
    parts.push(`Free cancellation window: ${hoursRaw} hour${hoursRaw === 1 ? "" : "s"} before pickup`);
  }

  if (cancellable === false) {
    parts.push("Not cancellable via self-service for this fare.");
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
