const DRAFT_PREFIX = "transferz-draft:";
const PAGE_SESSION_KEY = "__pagoda_transferz_draft_page__";

export type TransferzQuoteDraft = {
  id: number;
  vehicleCategory?: string;
  vehicleModels?: string;
  passengerCapacity?: number;
  price?: number;
  currencyCode?: string;
  expires?: string;
  instantConfirmation?: boolean;
};

export type TransferzFormDraft = {
  version: 1;
  step: "form" | "quotes" | "booker";
  originMode: "iata" | "address";
  originIata: string;
  originAddress: string;
  originCountry: string;
  destMode: "iata" | "address";
  destIata: string;
  destAddress: string;
  destCountry: string;
  originAddressPresetId: string;
  destAddressPresetId: string;
  pickupTime: string;
  pickupDayYmd: string;
  checkedLuggage: number;
  carryOnLuggage: number;
  adults: number;
  children: number;
  infants: number;
  quotesList: TransferzQuoteDraft[];
  quotesPayload?: unknown;
  resolvedOrigin: string;
  resolvedDestination: string;
  selectedQuoteId: number | null;
  bookerFirst: string;
  bookerLast: string;
  bookerEmail: string;
  bookerPhone: string;
  travellerFirst: string;
  travellerLast: string;
  travellerEmail: string;
  travellerPhone: string;
  flightNumber: string;
  driverComments: string;
  internalNotes: string;
};

function ymdFromActivityDate(iso: string | null | undefined): string {
  const raw = iso?.trim() ?? "";
  const ymd = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "undated";
}

/** Clears all transfer drafts on full page reload; keeps them when only closing the modal. */
function ensurePageSession() {
  if (typeof window === "undefined") return;
  try {
    if (!sessionStorage.getItem(PAGE_SESSION_KEY)) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(k);
      }
      sessionStorage.setItem(PAGE_SESSION_KEY, "1");
    }
  } catch {
    // ignore quota / private mode
  }
}

export function transferzDraftStorageKey(
  itineraryId: string,
  activityDateISO: string | null | undefined
): string {
  return `${DRAFT_PREFIX}${itineraryId}:${ymdFromActivityDate(activityDateISO)}`;
}

export function loadTransferzDraft(key: string): TransferzFormDraft | null {
  if (typeof window === "undefined") return null;
  ensurePageSession();
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransferzFormDraft;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTransferzDraft(key: string, draft: TransferzFormDraft): void {
  if (typeof window === "undefined") return;
  ensurePageSession();
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // ignore quota
  }
}

export function clearTransferzDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasTransferzDraft(
  itineraryId: string,
  activityDateISO: string | null | undefined
): boolean {
  return loadTransferzDraft(transferzDraftStorageKey(itineraryId, activityDateISO)) != null;
}
