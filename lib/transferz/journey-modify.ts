/**
 * Partner journey modification (Warp Drive).
 * @see https://developers.transferz.com/reference/createjourneychange
 *
 * **travelAddons:** the array in a modify request replaces the journey’s existing add-ons entirely;
 * include existing entries if they must be kept (see Transferz “Modify bookings” docs).
 */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Keys allowed on `travellerInfo` for `POST /partners/journeys/{id}/changes`. */
export const TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS = [
  "flightNumber",
  "firstName",
  "lastName",
  "phone",
  "email",
] as const;

export type TransferzTravelAddonRow = { type: string; amount: number };

export type TransferzModifyFormDefaults = {
  pickupDatetimeLocal: string;
  travellerInfo: Record<(typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number], string>;
  driverComments: string;
  travelAddons: TransferzTravelAddonRow[];
};

export const TRANSFERZ_MODIFY_TRAVELLER_FIELD_LABELS: Record<
  (typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number],
  string
> = {
  flightNumber: "Flight number",
  firstName: "Traveller first name",
  lastName: "Traveller last name",
  phone: "Traveller phone",
  email: "Traveller email",
};

function strTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function padPickupLocalFromPayload(payload: Record<string, unknown>): string {
  const d = strTrim(payload.pickupWallDate).slice(0, 10);
  const tRaw = strTrim(payload.pickupStartLocalHHMM);
  const nm = tRaw.match(/^(\d{1,2}):(\d{2})/);
  const t = nm ? `${nm[1].padStart(2, "0")}:${nm[2]}` : "10:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return `${d}T${t}`;
}

function pickupLocalFromJourney(journey: Record<string, unknown>): string {
  const pdt =
    (typeof journey.pickupDateTime === "string" && journey.pickupDateTime.trim()) ||
    (isRecord(journey.pickup) && typeof journey.pickup.dateTime === "string" && journey.pickup.dateTime.trim()) ||
    "";
  if (!pdt) return "";
  const m = pdt.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[1]}T${m[2]}:${m[3]}`;
}

function travelAddonsFromUnknown(raw: unknown): TransferzTravelAddonRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TransferzTravelAddonRow[] = [];
  for (const a of raw) {
    if (!isRecord(a)) continue;
    const t = strTrim(a.type);
    const amt = a.amount;
    if (!t) continue;
    if (typeof amt !== "number" || !Number.isFinite(amt)) continue;
    out.push({ type: t, amount: Math.max(0, Math.trunc(amt)) });
  }
  return out;
}

/**
 * Seed the modify form from a live journey (GET booking) plus stored itinerary payload fallbacks.
 */
export function defaultsForTransferzModifyForm(
  journey: Record<string, unknown> | null,
  itineraryPayload: Record<string, unknown>
): TransferzModifyFormDefaults {
  const travellerInfo = {} as Record<(typeof TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS)[number], string>;
  for (const k of TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS) {
    travellerInfo[k] = "";
  }

  if (journey) {
    if (isRecord(journey.travellerInfo)) {
      for (const k of TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS) {
        const v = journey.travellerInfo[k];
        if (typeof v === "string" && v.trim()) travellerInfo[k] = v.trim();
      }
    }
    const tr = isRecord(journey.traveller) ? journey.traveller : null;
    if (tr) {
      if (!travellerInfo.firstName && typeof tr.firstName === "string") travellerInfo.firstName = tr.firstName.trim();
      if (!travellerInfo.lastName && typeof tr.lastName === "string") travellerInfo.lastName = tr.lastName.trim();
      if (!travellerInfo.phone && typeof tr.phone === "string") travellerInfo.phone = tr.phone.trim();
      if (!travellerInfo.email && typeof tr.email === "string") travellerInfo.email = tr.email.trim();
      if (!travellerInfo.flightNumber) {
        if (typeof tr.flightNumber === "string" && tr.flightNumber.trim()) {
          travellerInfo.flightNumber = tr.flightNumber.trim();
        } else if (typeof tr.flightNr === "string" && tr.flightNr.trim()) {
          travellerInfo.flightNumber = tr.flightNr.trim();
        }
      }
    }
    if (!travellerInfo.flightNumber && typeof journey.flightNumber === "string" && journey.flightNumber.trim()) {
      travellerInfo.flightNumber = journey.flightNumber.trim();
    }
  }

  const payloadFlight = itineraryPayload.travellerFlightNumber;
  if (!travellerInfo.flightNumber && typeof payloadFlight === "string" && payloadFlight.trim()) {
    travellerInfo.flightNumber = payloadFlight.trim();
  }

  let pickupDatetimeLocal = journey ? pickupLocalFromJourney(journey) : "";
  if (!pickupDatetimeLocal) pickupDatetimeLocal = padPickupLocalFromPayload(itineraryPayload);

  const driverComments =
    (journey && typeof journey.driverComments === "string" && journey.driverComments.trim()) ||
    strTrim(itineraryPayload.driverCommentsLastChange) ||
    "";

  let travelAddons = journey ? travelAddonsFromUnknown(journey.travelAddons) : [];
  if (travelAddons.length === 0) {
    travelAddons = travelAddonsFromUnknown(itineraryPayload.transferzTravelAddons);
  }

  for (const map of [
    ["firstName", "travellerFirst"],
    ["lastName", "travellerLast"],
    ["email", "travellerEmail"],
    ["phone", "travellerPhone"],
  ] as const) {
    const [tiKey, payKey] = map;
    if (!travellerInfo[tiKey]) {
      const v = itineraryPayload[payKey];
      if (typeof v === "string" && v.trim()) travellerInfo[tiKey] = v.trim();
    }
  }

  return { pickupDatetimeLocal, travellerInfo, driverComments, travelAddons };
}

export function normalizeTravelAddonRows(rows: TransferzTravelAddonRow[]): TransferzTravelAddonRow[] {
  return rows
    .filter((r) => r.type.trim().length > 0)
    .map((r) => ({ type: r.type.trim(), amount: Math.max(0, Math.trunc(r.amount)) }));
}

export function travelAddonsPayloadChanged(a: TransferzTravelAddonRow[], b: TransferzTravelAddonRow[]): boolean {
  return JSON.stringify(normalizeTravelAddonRows(a)) !== JSON.stringify(normalizeTravelAddonRows(b));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Add minutes to `HH:mm` (same day wrap). */
export function addMinutesHHMM(hhmm: string, deltaMin: number): string {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "12:00";
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return "12:00";
  const t = h * 60 + mi + deltaMin;
  const wrapped = ((t % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/**
 * Whitelist body for `POST /partners/journeys/{id}/changes`.
 * Only send fields the client explicitly supplies (Transferz: omit unchanged fields).
 */
export function sanitizeTransferzJourneyChangeBody(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, unknown> = {};

  if (typeof raw.pickupDate === "string" && raw.pickupDate.trim()) {
    const s = raw.pickupDate.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s))) {
      out.pickupDate = s;
    }
  }

  if (isRecord(raw.travellerInfo)) {
    const ti: Record<string, unknown> = {};
    for (const k of TRANSFERZ_MODIFIABLE_TRAVELLER_INFO_KEYS) {
      const v = raw.travellerInfo[k];
      if (typeof v === "string" && v.trim()) {
        ti[k] = v.trim();
      }
    }
    if (Object.keys(ti).length > 0) {
      out.travellerInfo = ti;
    }
  }

  if (typeof raw.driverComments === "string") {
    out.driverComments = raw.driverComments.trim().slice(0, 4000);
  }

  if (Array.isArray(raw.travelAddons)) {
    const addons: Array<{ type: string; amount: number }> = [];
    for (const a of raw.travelAddons) {
      if (!isRecord(a)) continue;
      const t = a.type;
      const amt = a.amount;
      if (typeof t !== "string" || !t.trim()) continue;
      if (typeof amt !== "number" || !Number.isFinite(amt)) continue;
      addons.push({ type: t.trim(), amount: Math.max(0, Math.trunc(amt)) });
    }
    /** Empty array clears add-ons at the provider (replace semantics). */
    out.travelAddons = addons;
  }

  if (Object.keys(out).length === 0) return null;
  return out;
}

/** Parse `pickupDate` from modify API / ISO into wall date + HH:mm for stored payload. */
export function wallDateAndHHMMFromPickupDateIso(iso: string): { date: string; hhmm: string } | null {
  const s = iso.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return { date: m[1], hhmm: `${m[2]}:${m[3]}` };
}
