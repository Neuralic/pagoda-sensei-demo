/**
 * Normalizes POST /partners/quotes JSON to match Transferz Warp Drive expectations.
 * @see https://developers.transferz.com/docs/requesting-quotes-1
 */

// Accept RFC3339 `date-time` with optional seconds and optional timezone.
// Examples:
// - 2026-04-27T10:30
// - 2026-04-27T10:30:00
// - 2026-04-27T10:30:00Z
// - 2026-04-27T10:30+09:00
// - 2026-04-27T10:30:00-05:00
const PICKUP_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

function normalizePickupDateTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(PICKUP_RE);
  if (!m) return null;
  const [, ymd, hh, mm, sec, tz] = m;
  const h = Number(hh),
    mi = Number(mm),
    s = sec != null && sec !== "" ? Number(sec) : 0;
  if (![h, mi, s].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  const ss = (sec != null && sec !== "" ? sec : "00").padStart(2, "0");
  // Validate timezone offset ranges if present (±HH:MM).
  if (tz && tz !== "Z") {
    const sign = tz[0];
    const th = Number(tz.slice(1, 3));
    const tm = Number(tz.slice(4, 6));
    if (sign !== "+" && sign !== "-") return null;
    if (!Number.isInteger(th) || !Number.isInteger(tm)) return null;
    if (th > 23 || tm > 59) return null;
  }
  return `${ymd}T${hh}:${mm}:${ss}${tz ?? ""}`;
}

function asNonNegInt(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function asPositiveInt(raw: unknown, fallback: number): number {
  return Math.max(1, asNonNegInt(raw, fallback));
}

/** Mirrors Warp Drive `LocationInputDto` (Get quotes). */
const LOCATION_PLACE_ID_KEYS = [
  "googlePlaceId",
  "hereId",
  "tomTomId",
] as const;

const LOCATION_CODE_KEYS = ["giataId", "ttiCode"] as const;

/**
 * Builds a `LocationInputDto`-safe object: only known keys, no client junk.
 * @see https://developers.transferz.com/reference/getquotes
 */
function sanitizeLocation(
  raw: unknown,
  label: "origin" | "destination"
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `${label} must be an object` };
  }
  const o = raw as Record<string, unknown>;
  const value: Record<string, unknown> = {};

  const tid = o.transferzLocationId;
  if (typeof tid === "number" && Number.isInteger(tid) && tid > 0) {
    value.transferzLocationId = tid;
  } else if (typeof tid === "string" && /^\d+$/.test(tid.trim())) {
    const n = parseInt(tid.trim(), 10);
    if (n > 0) value.transferzLocationId = n;
  }

  for (const k of LOCATION_PLACE_ID_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) value[k] = v.trim();
  }

  for (const k of LOCATION_CODE_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) value[k] = v.trim();
  }

  const iata = o.iataCode;
  if (typeof iata === "string" && iata.trim()) {
    const code = iata
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3);
    if (code.length === 3) value.iataCode = code;
  }

  const icao = o.icaoCode;
  if (typeof icao === "string" && icao.trim()) {
    value.icaoCode = icao.trim().toUpperCase().replace(/\s+/g, "");
  }

  const coord = o.coordinate;
  if (coord && typeof coord === "object" && !Array.isArray(coord)) {
    const c = coord as Record<string, unknown>;
    const lat =
      typeof c.lat === "number"
        ? c.lat
        : typeof c.lat === "string"
          ? parseFloat(c.lat)
          : NaN;
    const lng =
      typeof c.lng === "number"
        ? c.lng
        : typeof c.lng === "string"
          ? parseFloat(c.lng)
          : NaN;
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      value.coordinate = { lat, lng };
    }
  }

  const addr = o.address;
  if (addr && typeof addr === "object" && !Array.isArray(addr)) {
    const a = addr as Record<string, unknown>;
    const phrase =
      typeof a.addressSearchPhrase === "string" ? a.addressSearchPhrase.trim() : "";
    if (phrase) {
      const addrOut: Record<string, unknown> = { addressSearchPhrase: phrase };
      const ccRaw =
        typeof a.countryCode === "string"
          ? a.countryCode.trim().toUpperCase().replace(/[^A-Z]/g, "")
          : "";
      const countryCode = ccRaw.slice(0, 2);
      if (countryCode.length === 2) addrOut.countryCode = countryCode;
      value.address = addrOut;
    }
  }

  if (Object.keys(value).length === 0) {
    return {
      ok: false,
      error: `${label} must set at least one of: iataCode, icaoCode, address.addressSearchPhrase, coordinate { lat, lng }, googlePlaceId, hereId, tomTomId, giataId, ttiCode, transferzLocationId`,
    };
  }

  return { ok: true, value };
}

export type NormalizeQuotesResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validates and returns a body safe to POST to `.../partners/quotes`.
 * Strips unknown top-level fields from the client and coerces integers.
 */
export function normalizePartnerQuotesBody(input: unknown): NormalizeQuotesResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const inBody = input as Record<string, unknown>;

  const origin = sanitizeLocation(inBody.origin, "origin");
  if (!origin.ok) return origin;

  const destination = sanitizeLocation(inBody.destination, "destination");
  if (!destination.ok) return destination;

  const pickupDateTime = normalizePickupDateTime(inBody.pickupDateTime);
  if (!pickupDateTime) {
    return {
      ok: false,
      error:
        "pickupDateTime must be local wall time at the origin, format YYYY-MM-DDTHH:mm:ss (see Transferz requesting-quotes docs)",
    };
  }

  const adultPassengers = asPositiveInt(inBody.adultPassengers, 1);
  const childPassengers = asNonNegInt(inBody.childPassengers, 0);
  const infantPassengers = asNonNegInt(inBody.infantPassengers, 0);
  const checkedLuggage = asNonNegInt(inBody.checkedLuggage, 0);
  const carryOnLuggage = asNonNegInt(inBody.carryOnLuggage, 0);

  const out: Record<string, unknown> = {
    origin: origin.value,
    destination: destination.value,
    pickupDateTime,
    adultPassengers,
    childPassengers,
    infantPassengers,
    checkedLuggage,
    carryOnLuggage,
  };

  if (typeof inBody.source === "string" && inBody.source.trim()) {
    out.source = inBody.source.trim().slice(0, 200);
  }

  if (typeof inBody.currencyCode === "string" && /^[A-Z]{3}$/i.test(inBody.currencyCode.trim())) {
    out.currencyCode = inBody.currencyCode.trim().toUpperCase();
  }

  if (typeof inBody.partnerId === "number" && Number.isInteger(inBody.partnerId) && inBody.partnerId > 0) {
    out.partnerId = inBody.partnerId;
  } else if (typeof inBody.partnerId === "string" && /^\d+$/.test(inBody.partnerId.trim())) {
    const n = parseInt(inBody.partnerId.trim(), 10);
    if (n > 0) out.partnerId = n;
  }

  if (typeof inBody.requireInstantConfirmation === "boolean") {
    out.requireInstantConfirmation = inBody.requireInstantConfirmation;
  }

  if (typeof inBody.discountCode === "string" && inBody.discountCode.trim()) {
    out.discountCode = inBody.discountCode.trim().slice(0, 120);
  }

  if (typeof inBody.limitToVehicleCategory === "string" && inBody.limitToVehicleCategory.trim()) {
    out.limitToVehicleCategory = inBody.limitToVehicleCategory.trim().toUpperCase();
  }

  if (Array.isArray(inBody.limitToVehicleCategories)) {
    const cats = inBody.limitToVehicleCategories.filter((x) => typeof x === "string") as string[];
    if (cats.length > 0) out.limitToVehicleCategories = cats;
  }

  return { ok: true, body: out };
}
