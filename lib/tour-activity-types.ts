/**
 * Canonical activity types for Tour Library create/edit and itinerary job forms.
 * Keep in sync across create/edit tour modals, job modals, and catalog filters.
 *
 * Order is intentional (not A–Z) — matches the agent tour list menu.
 */

/** Provider-API airport transfers: live availability and instant confirmation. */
export const INSTANT_AIRPORT_TRANSFERS_TYPE = "Airport transfers - Instant Confirmation";

/** Airport transfers sourced manually through local partners: no provider API. */
export const CUSTOM_AIRPORT_TRANSFERS_TYPE = "Airport transfers - Custom";

export const PRIVATE_TOUR_TYPE = "Private Tour";

export const SHINKANSEN_TICKETS_TYPE = "Shinkansen Tickets (bullet train)";

export const TOUR_ACTIVITY_TYPES = [
  PRIVATE_TOUR_TYPE,
  INSTANT_AIRPORT_TRANSFERS_TYPE,
  CUSTOM_AIRPORT_TRANSFERS_TYPE,
  "Transfers",
  SHINKANSEN_TICKETS_TYPE,
  "Food Tours",
  "Special Accommodation",
  "Pagoda Support",
] as const;

export type TourActivityType = (typeof TOUR_ACTIVITY_TYPES)[number];

/** Always show these in agent catalog filters even when no published tour uses them yet. */
export const CATALOG_ALWAYS_ACTIVITY_TYPES = [
  PRIVATE_TOUR_TYPE,
  INSTANT_AIRPORT_TRANSFERS_TYPE,
  CUSTOM_AIRPORT_TRANSFERS_TYPE,
  "Transfers",
] as const;

/** Labels stored before renames that map to Instant Confirmation. */
const LEGACY_INSTANT_AIRPORT_TRANSFERS_LABELS = [
  "airport transfers",
  "airport transfer",
  "instant confirmation airport transfers",
  "airport transfers - instant confirmation",
];

/** Labels stored before renames that map to Custom. */
const LEGACY_CUSTOM_AIRPORT_TRANSFERS_LABELS = [
  "custom airport transfers",
  "airport transfers - custom",
];

/** Labels stored before renames that map to Shinkansen. */
const LEGACY_SHINKANSEN_LABELS = [
  "shinkansen tickets",
  "shinkansen tickets bullet train",
  "shinkansen ticket",
  "bullet train tickets",
  "bullet train",
];

/** Labels stored before renames that map to Pagoda Support. */
const LEGACY_PAGODA_SUPPORT_LABELS = ["free time", "pagoda support"];

function normalize(name: string | null | undefined): string {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Strip punctuation so "Shinkansen Tickets (bullet train)" ≈ "shinkansen tickets bullet train". */
function normalizeLoose(name: string | null | undefined): string {
  return normalize(name)
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Manually arranged transfers: a plain catalog type, never the provider booking flow. */
function isCustomAirportTransfersType(name: string | null | undefined): boolean {
  const n = normalize(name);
  if (n === normalize(CUSTOM_AIRPORT_TRANSFERS_TYPE)) return true;
  return LEGACY_CUSTOM_AIRPORT_TRANSFERS_LABELS.includes(n);
}

/**
 * Instant Confirmation Airport Transfers opens Transferz booking; Custom Airport
 * Transfers and plain Transfers are normal catalog types.
 */
export function isAirportTransfersCatalogType(name: string): boolean {
  const n = normalize(name);
  if (isCustomAirportTransfersType(n)) return false;
  if (n === normalize(INSTANT_AIRPORT_TRANSFERS_TYPE)) return true;
  if (LEGACY_INSTANT_AIRPORT_TRANSFERS_LABELS.includes(n)) return true;
  if (n.includes("custom")) return false;
  // Avoid matching plain "Transfers" — require both airport + transfer.
  return n.includes("airport") && n.includes("transfer");
}

/**
 * Map any stored / legacy label to the canonical menu label so facets and filters
 * do not show duplicates (e.g. "Private Tours" next to "Private Tour").
 */
export function canonicalizeActivityTypeLabel(name: string | null | undefined): string {
  const raw = (name || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const n = normalize(raw);

  if (n === "private tour" || n === "private tours") return PRIVATE_TOUR_TYPE;

  if (isCustomAirportTransfersType(n)) return CUSTOM_AIRPORT_TRANSFERS_TYPE;

  if (
    n === normalize(INSTANT_AIRPORT_TRANSFERS_TYPE) ||
    LEGACY_INSTANT_AIRPORT_TRANSFERS_LABELS.includes(n)
  ) {
    return INSTANT_AIRPORT_TRANSFERS_TYPE;
  }

  if (
    n === normalize(SHINKANSEN_TICKETS_TYPE) ||
    LEGACY_SHINKANSEN_LABELS.includes(n) ||
    LEGACY_SHINKANSEN_LABELS.includes(normalizeLoose(raw)) ||
    normalizeLoose(raw) === normalizeLoose(SHINKANSEN_TICKETS_TYPE) ||
    (n.includes("shinkansen") && n.includes("ticket"))
  ) {
    return SHINKANSEN_TICKETS_TYPE;
  }

  if (LEGACY_PAGODA_SUPPORT_LABELS.includes(n) || n === "pagoda support") {
    return "Pagoda Support";
  }

  // Known canonical types keep title-case from TOUR_ACTIVITY_TYPES when matched
  for (const label of TOUR_ACTIVITY_TYPES) {
    if (normalize(label) === n) return label;
  }

  return raw;
}

function normalizeActivityTypeLabel(name: string): string {
  return normalize(canonicalizeActivityTypeLabel(name));
}

/**
 * Case-insensitive exact activity-type match.
 * Important: "Transfers" must NOT also match either airport transfer type.
 */
export function activityTypeMatchesFilter(
  tourActivityType: string | null | undefined,
  filter: string | null | undefined
): boolean {
  const filterNorm = normalizeActivityTypeLabel(filter || "");
  if (!filterNorm) return true;
  const tourNorm = normalizeActivityTypeLabel(tourActivityType || "");
  return tourNorm === filterNorm;
}

/** Stored labels a filter must match, so rows saved under a former name still show up. */
export function activityTypeFilterVariants(filter: string): string[] {
  const canonical = canonicalizeActivityTypeLabel(filter);
  if (normalize(canonical) === normalize(INSTANT_AIRPORT_TRANSFERS_TYPE)) {
    return [
      INSTANT_AIRPORT_TRANSFERS_TYPE,
      "Airport Transfers - Instant confirmation",
      "Instant Confirmation Airport Transfers",
      "Airport Transfers",
      "Airport Transfer",
    ];
  }
  if (normalize(canonical) === normalize(CUSTOM_AIRPORT_TRANSFERS_TYPE)) {
    return [
      CUSTOM_AIRPORT_TRANSFERS_TYPE,
      "Airport Transfers - Custom",
      "Custom Airport Transfers",
    ];
  }
  if (normalize(canonical) === normalize(PRIVATE_TOUR_TYPE)) {
    return [PRIVATE_TOUR_TYPE, "Private Tours", "private tour", "private tours"];
  }
  if (normalize(canonical) === normalize(SHINKANSEN_TICKETS_TYPE)) {
    return [
      SHINKANSEN_TICKETS_TYPE,
      "Shinkansen Tickets",
      "Shinkansen tickets",
      "Shinkansen Ticket",
      "Bullet train tickets",
      "Bullet Train",
    ];
  }
  if (normalize(canonical) === "pagoda support") {
    return ["Pagoda Support", "Free Time", "free time"];
  }
  return [canonical || filter.trim().replace(/\s+/g, " ")];
}

/** Activity types priced from advisor-entered supplier/partner cost (not tour/bid net). */
export function isSupplierLedActivityType(
  name: string | null | undefined
): boolean {
  const canonical = canonicalizeActivityTypeLabel(name);
  const n = normalize(canonical);
  return (
    n === "pagoda support" ||
    n === normalize(SHINKANSEN_TICKETS_TYPE) ||
    n === "special accommodation" ||
    n === "food tours"
  );
}

/**
 * Quote a value for PostgREST `.or()` filter strings.
 * Needed for labels with spaces/parentheses (e.g. Shinkansen Tickets (bullet train)).
 */
export function quotePostgrestFilterValue(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build `activity_type.ilike."…"` OR clause for catalog filters. */
export function activityTypePostgrestOrFilter(filter: string): string | null {
  const variants = activityTypeFilterVariants(filter);
  if (!variants.length) return null;
  return variants
    .map((v) => `activity_type.ilike.${quotePostgrestFilterValue(v)}`)
    .join(",");
}

/** Prefer the Tour Library menu order; any unknown labels follow alphabetically. */
export function sortActivityTypesForMenu(types: Iterable<string>): string[] {
  const order = new Map(
    TOUR_ACTIVITY_TYPES.map((label, index) => [normalize(label), index] as const)
  );
  const canonicalized = [...types]
    .map((t) => canonicalizeActivityTypeLabel(t))
    .filter(Boolean);
  return [...new Set(canonicalized)].sort((a, b) => {
    const ai = order.get(normalize(a));
    const bi = order.get(normalize(b));
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });
}
