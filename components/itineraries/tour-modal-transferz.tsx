"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import {
  TRANSFERZ_ADDRESS_PRESET_CUSTOM,
  TRANSFERZ_ADDRESS_PRESETS,
  TRANSFERZ_COUNTRY_OPTIONS,
  TRANSFERZ_IATA_OPTIONS,
} from "@/components/itineraries/transferz-form-options";
import { countryNameFromAlpha2 } from "@/lib/transfer-booking-display";
import { formatDailyRateLabel } from "@/lib/currency-format";
import {
  clearTransferzDraft,
  loadTransferzDraft,
  saveTransferzDraft,
  transferzDraftStorageKey,
  type TransferzFormDraft,
  type TransferzQuoteDraft,
} from "@/lib/transferz-form-draft";
import { INSTANT_AIRPORT_TRANSFERS_TYPE } from "@/lib/tour-activity-types";
import { commissionPriceFieldsFromProvider, transferzCustomerTotalFromProvider } from "@/lib/transferz/commission";
import { DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT } from "@/lib/transferz/platform-commission-settings";

type Props = {
  itineraryId: string;
  activityDateISO: string | null;
  onBack: () => void;
  onComplete: () => void;
};

type TransferzQuote = TransferzQuoteDraft;

function buildDraftSnapshot(state: {
  step: TransferzFormDraft["step"];
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
  quotesList: TransferzQuote[];
  quotesPayload: unknown;
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
}): TransferzFormDraft {
  return { version: 1, ...state };
}

function plural(n: number, one: string, many?: string): string {
  const v = Number.isFinite(n) ? n : 0;
  const label = v === 1 ? one : (many || `${one}s`);
  return `${v} ${label}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** First 10 chars of an ISO-like string when they form YYYY-MM-DD. */
function itineraryYmdOnly(iso: string | null | undefined): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const ymd = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
}

function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Pickup is prefilled from the itinerary "activity" day, but that is only a hint. If the
 * itinerary day is already in the past (browser local date), use today so Transferz
 * quote requests are not blocked on open.
 */
function defaultPickupYmdFromItineraryHint(itineraryYmd: string): string {
  const today = localTodayYmd();
  if (!itineraryYmd) return today;
  return itineraryYmd < today ? today : itineraryYmd;
}

/** Normalizes `<input type="time">` values to `HH:mm` for Transferz (local wall clock, no offset). */
function normalizePickupTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/**
 * Transferz only quotes future journeys. We use the viewer's local calendar/clock as a
 * practical check (pickup is "local wall time at origin"; Japan itineraries usually match).
 */
function isPickupLikelyInPast(dateYmd: string, timeRaw: string): boolean {
  const hhmm = normalizePickupTime(timeRaw);
  if (!hhmm) return false;
  const [y, mo, d] = dateYmd.split("-").map(Number);
  if (![y, mo, d].every((n) => Number.isInteger(n) && n > 0)) return false;
  const [h, mi] = hhmm.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(dt.getTime())) return false;
  const BUFFER_MS = 120_000;
  return dt.getTime() < Date.now() - BUFFER_MS;
}

function addMinutesHHMM(hhmm: string, deltaMin: number): string {
  const normalized = normalizePickupTime(hhmm);
  if (!normalized) return "10:30";
  const [h, m] = normalized.split(":").map(Number);
  const t = h * 60 + m + deltaMin;
  const wrapped = ((t % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

function buildLocation(
  mode: "iata" | "address",
  iata: string,
  phrase: string,
  country: string
): Record<string, unknown> | null {
  if (mode === "iata") {
    const code = iata.trim().toUpperCase();
    if (code.length < 3) return null;
    return { iataCode: code.slice(0, 3) };
  }
  const p = phrase.trim();
  const cc = country.trim().toUpperCase();
  if (!p || cc.length !== 2) return null;
  return { address: { addressSearchPhrase: p, countryCode: cc } };
}

const transferzSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function resolveAddressFromPreset(
  presetId: string,
  freePhrase: string,
  freeCountry: string
): { phrase: string; countryCode: string } | null {
  if (!presetId) return null;
  if (presetId === TRANSFERZ_ADDRESS_PRESET_CUSTOM) {
    const phrase = freePhrase.trim();
    const countryCode = freeCountry.trim().toUpperCase();
    if (!phrase || countryCode.length !== 2) return null;
    return { phrase, countryCode };
  }
  const preset = TRANSFERZ_ADDRESS_PRESETS.find((x) => x.id === presetId);
  if (!preset?.phrase) return null;
  return { phrase: preset.phrase, countryCode: preset.countryCode };
}

export function TourModalTransferzPanel({
  itineraryId,
  activityDateISO,
  onBack,
  onComplete,
}: Props) {
  const draftKey = transferzDraftStorageKey(itineraryId, activityDateISO);
  const initialDraftRef = useRef<TransferzFormDraft | null | undefined>(undefined);
  if (initialDraftRef.current === undefined) {
    initialDraftRef.current = loadTransferzDraft(draftKey);
  }
  const initialDraft = initialDraftRef.current;
  const restoredFromDraftRef = useRef(Boolean(initialDraft));
  const defaultPickupYmd = defaultPickupYmdFromItineraryHint(itineraryYmdOnly(activityDateISO));

  const [configured, setConfigured] = useState<boolean | null>(null);
  /** Shown when the server reports a misconfiguration (e.g. mixed staging/production Transferz URLs). */
  const [transferzBlockReason, setTransferzBlockReason] = useState<string | null>(null);
  /** Snapshot from `/api/transferz/status` — stored on the itinerary row for support / auditing. */
  const [transferzMetaForPayload, setTransferzMetaForPayload] = useState<{
    environment: "staging" | "production";
    warpDriveHost: string;
    gatewayHost: string;
  } | null>(null);
  const [platformCommissionPct, setPlatformCommissionPct] = useState(
    DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
  );
  const [step, setStep] = useState<"form" | "quotes" | "booker">(initialDraft?.step ?? "form");

  const [originMode, setOriginMode] = useState<"iata" | "address">(initialDraft?.originMode ?? "iata");
  const [originIata, setOriginIata] = useState(initialDraft?.originIata ?? "");
  const [originAddress, setOriginAddress] = useState(initialDraft?.originAddress ?? "");
  const [originCountry, setOriginCountry] = useState(initialDraft?.originCountry ?? "JP");

  const [destMode, setDestMode] = useState<"iata" | "address">(initialDraft?.destMode ?? "address");
  const [destIata, setDestIata] = useState(initialDraft?.destIata ?? "");
  const [destAddress, setDestAddress] = useState(initialDraft?.destAddress ?? "");
  const [destCountry, setDestCountry] = useState(initialDraft?.destCountry ?? "JP");
  const [originAddressPresetId, setOriginAddressPresetId] = useState(
    initialDraft?.originAddressPresetId ?? ""
  );
  const [destAddressPresetId, setDestAddressPresetId] = useState(initialDraft?.destAddressPresetId ?? "");

  const [pickupTime, setPickupTime] = useState(initialDraft?.pickupTime ?? "10:00");
  const [checkedLuggage, setCheckedLuggage] = useState(initialDraft?.checkedLuggage ?? 1);
  const [carryOnLuggage, setCarryOnLuggage] = useState(initialDraft?.carryOnLuggage ?? 1);

  const [adults, setAdults] = useState(initialDraft?.adults ?? 1);
  const [children, setChildren] = useState(initialDraft?.children ?? 0);
  const [infants, setInfants] = useState(initialDraft?.infants ?? 0);

  const [quotesPayload, setQuotesPayload] = useState<unknown>(initialDraft?.quotesPayload ?? null);
  const [quotesList, setQuotesList] = useState<TransferzQuote[]>(initialDraft?.quotesList ?? []);
  const [resolvedOrigin, setResolvedOrigin] = useState<string>(initialDraft?.resolvedOrigin ?? "");
  const [resolvedDestination, setResolvedDestination] = useState<string>(
    initialDraft?.resolvedDestination ?? ""
  );
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(
    initialDraft?.selectedQuoteId ?? null
  );

  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);

  const [bookerFirst, setBookerFirst] = useState(initialDraft?.bookerFirst ?? "");
  const [bookerLast, setBookerLast] = useState(initialDraft?.bookerLast ?? "");
  const [bookerEmail, setBookerEmail] = useState(initialDraft?.bookerEmail ?? "");
  const [bookerPhone, setBookerPhone] = useState(initialDraft?.bookerPhone ?? "");

  const [travellerFirst, setTravellerFirst] = useState(initialDraft?.travellerFirst ?? "");
  const [travellerLast, setTravellerLast] = useState(initialDraft?.travellerLast ?? "");
  const [travellerEmail, setTravellerEmail] = useState(initialDraft?.travellerEmail ?? "");
  const [travellerPhone, setTravellerPhone] = useState(initialDraft?.travellerPhone ?? "");
  const [flightNumber, setFlightNumber] = useState(initialDraft?.flightNumber ?? "");
  const [driverComments, setDriverComments] = useState(initialDraft?.driverComments ?? "");
  const [internalNotes, setInternalNotes] = useState(initialDraft?.internalNotes ?? "");

  /** Calendar day sent to Transferz as part of `pickupDateTime` — editable here. */
  const [pickupDayYmd, setPickupDayYmd] = useState(
    () => initialDraft?.pickupDayYmd ?? defaultPickupYmd
  );
  const prevActivityDateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = activityDateISO?.trim() ?? "";
    if (key === prevActivityDateKeyRef.current) return;
    prevActivityDateKeyRef.current = key;
    if (!restoredFromDraftRef.current) {
      setPickupDayYmd(defaultPickupYmdFromItineraryHint(itineraryYmdOnly(activityDateISO)));
    }
  }, [activityDateISO]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveTransferzDraft(
        draftKey,
        buildDraftSnapshot({
          step,
          originMode,
          originIata,
          originAddress,
          originCountry,
          destMode,
          destIata,
          destAddress,
          destCountry,
          originAddressPresetId,
          destAddressPresetId,
          pickupTime,
          pickupDayYmd,
          checkedLuggage,
          carryOnLuggage,
          adults,
          children,
          infants,
          quotesList,
          quotesPayload,
          resolvedOrigin,
          resolvedDestination,
          selectedQuoteId,
          bookerFirst,
          bookerLast,
          bookerEmail,
          bookerPhone,
          travellerFirst,
          travellerLast,
          travellerEmail,
          travellerPhone,
          flightNumber,
          driverComments,
          internalNotes,
        })
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [
    draftKey,
    step,
    originMode,
    originIata,
    originAddress,
    originCountry,
    destMode,
    destIata,
    destAddress,
    destCountry,
    originAddressPresetId,
    destAddressPresetId,
    pickupTime,
    pickupDayYmd,
    checkedLuggage,
    carryOnLuggage,
    adults,
    children,
    infants,
    quotesList,
    quotesPayload,
    resolvedOrigin,
    resolvedDestination,
    selectedQuoteId,
    bookerFirst,
    bookerLast,
    bookerEmail,
    bookerPhone,
    travellerFirst,
    travellerLast,
    travellerEmail,
    travellerPhone,
    flightNumber,
    driverComments,
    internalNotes,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/transferz/status", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!cancelled) {
          const pairing =
            typeof j?.pairingError === "string" && j.pairingError.trim() ? j.pairingError.trim() : "";
          const ready = Boolean(j?.warpDriveReady ?? j?.configured);
          if (pairing) {
            setTransferzBlockReason(pairing);
            setTransferzMetaForPayload(null);
            setConfigured(false);
          } else {
            setTransferzBlockReason(null);
            setConfigured(ready);
            const pct = Number(j?.platformCommissionPct);
            if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
              setPlatformCommissionPct(pct);
            }
            const env = j?.environment;
            if (
              ready &&
              (env === "staging" || env === "production") &&
              typeof j?.warpDriveHost === "string" &&
              typeof j?.gatewayHost === "string"
            ) {
              setTransferzMetaForPayload({
                environment: env,
                warpDriveHost: j.warpDriveHost,
                gatewayHost: j.gatewayHost,
              });
            } else {
              setTransferzMetaForPayload(null);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setTransferzBlockReason(null);
          setTransferzMetaForPayload(null);
          setConfigured(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const itineraryContextYmd = useMemo(
    () => itineraryYmdOnly(activityDateISO),
    [activityDateISO]
  );

  /** Browser-local calendar day; used for help copy and past-itinerary checks. */
  const browserTodayYmd = localTodayYmd();

  /** Validated pickup calendar day (from the date control below). */
  const pickupDateYmd = useMemo(() => {
    const t = pickupDayYmd.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return null;
  }, [pickupDayYmd]);

  const pickupDateTime = useMemo(() => {
    if (!pickupDateYmd) return null;
    const hhmm = normalizePickupTime(pickupTime);
    if (!hhmm) return null;
    return `${pickupDateYmd}T${hhmm}:00`;
  }, [pickupDateYmd, pickupTime]);

  const pickupIsLikelyPast = useMemo(() => {
    if (!pickupDateYmd) return false;
    return isPickupLikelyInPast(pickupDateYmd, pickupTime);
  }, [pickupDateYmd, pickupTime]);

  const requestQuotes = useCallback(async () => {
    if (!pickupDateYmd) {
      toast.error("Choose a pickup date for this transfer.");
      return;
    }
    if (!pickupDateTime) {
      toast.error("Enter a valid pickup time (HH:MM).");
      return;
    }
    if (pickupDateYmd && isPickupLikelyInPast(pickupDateYmd, pickupTime)) {
      toast.error(
        "Pickup is in the past. This transfer service only returns quotes for future journeys — set a future pickup date or time (local to the origin)."
      );
      return;
    }

    let origin: Record<string, unknown> | null = null;
    if (originMode === "iata") {
      origin = buildLocation("iata", originIata, "", "");
      if (!origin) {
        toast.error("Select an origin airport.");
        return;
      }
    } else {
      const r = resolveAddressFromPreset(originAddressPresetId, originAddress, originCountry);
      if (!r) {
        toast.error(
          originAddressPresetId === TRANSFERZ_ADDRESS_PRESET_CUSTOM
            ? "Enter a custom origin address and country."
            : "Select an origin place."
        );
        return;
      }
      origin = buildLocation("address", "", r.phrase, r.countryCode);
    }

    let destination: Record<string, unknown> | null = null;
    if (destMode === "iata") {
      destination = buildLocation("iata", destIata, "", "");
      if (!destination) {
        toast.error("Select a destination airport.");
        return;
      }
    } else {
      const r = resolveAddressFromPreset(destAddressPresetId, destAddress, destCountry);
      if (!r) {
        toast.error(
          destAddressPresetId === TRANSFERZ_ADDRESS_PRESET_CUSTOM
            ? "Enter a custom destination address and country."
            : "Select a destination place."
        );
        return;
      }
      destination = buildLocation("address", "", r.phrase, r.countryCode);
    }

    const payload = {
      origin,
      destination,
      pickupDateTime,
      adultPassengers: Math.max(1, adults),
      childPassengers: Math.max(0, children),
      infantPassengers: Math.max(0, infants),
      checkedLuggage: Math.max(0, checkedLuggage),
      carryOnLuggage: Math.max(0, carryOnLuggage),
      source: "pagoda-travel-itinerary",
    };

    setLoadingQuotes(true);
    try {
      const res = await fetch("/api/transferz/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not load quotes");
      }
      const inner = data.data as {
        origin?: { resolvedAddress?: string };
        destination?: { resolvedAddress?: string };
        quotes?: TransferzQuote[];
      };
      const list = Array.isArray(inner?.quotes) ? inner.quotes : [];
      setQuotesPayload(data.data);
      setResolvedOrigin(inner?.origin?.resolvedAddress || "");
      setResolvedDestination(inner?.destination?.resolvedAddress || "");
      setQuotesList(list);
      setSelectedQuoteId(null);
      setStep("quotes");
      if (list.length === 0) {
        toast(
          "No quotes returned. Common causes: pickup date/time is in the past or too soon, no hub on the route (use IATA for an airport on at least one end), or no vehicle capacity for your party/luggage.",
          { icon: "ℹ️", duration: 8000 }
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quote request failed");
    } finally {
      setLoadingQuotes(false);
    }
  }, [
    pickupDateTime,
    originMode,
    originIata,
    originAddress,
    originCountry,
    originAddressPresetId,
    destMode,
    destIata,
    destAddress,
    destCountry,
    destAddressPresetId,
    adults,
    children,
    infants,
    checkedLuggage,
    carryOnLuggage,
    pickupDateYmd,
    pickupTime,
  ]);

  const selectedQuote = useMemo(
    () => quotesList.find((q) => q.id === selectedQuoteId) ?? null,
    [quotesList, selectedQuoteId]
  );

  const activityTypeForJob = useMemo(() => {
    const hubLeg =
      (originMode === "iata" && originIata.trim().length >= 3) ||
      (destMode === "iata" && destIata.trim().length >= 3);
    return hubLeg ? INSTANT_AIRPORT_TRANSFERS_TYPE : "Transfers";
  }, [originMode, originIata, destMode, destIata]);

  const confirmBookingAndJob = useCallback(async () => {
    if (!selectedQuoteId) {
      toast.error("Select a vehicle quote.");
      return;
    }
    if (!bookerFirst.trim() || !bookerLast.trim() || !bookerEmail.trim() || !bookerPhone.trim()) {
      toast.error("Fill in all booker fields (name, email, phone).");
      return;
    }
    if (!travellerFirst.trim() || !travellerLast.trim() || !travellerEmail.trim() || !travellerPhone.trim()) {
      toast.error("Fill in all traveller fields.");
      return;
    }
    const fn = flightNumber.trim() || "N/A";
    const partnerReference = `pagoda-${itineraryId.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    const bookingBody = {
      booker: {
        firstName: bookerFirst.trim(),
        lastName: bookerLast.trim(),
        email: bookerEmail.trim(),
        phone: bookerPhone.trim(),
        languageIsoCode: "en",
      },
      quotes: [
        {
          quoteId: selectedQuoteId,
          traveller: {
            firstName: travellerFirst.trim(),
            lastName: travellerLast.trim(),
            email: travellerEmail.trim(),
            phone: travellerPhone.trim(),
            flightNumber: fn,
            languageIsoCode: "en",
            ...(driverComments.trim() ? { driverComments: driverComments.trim() } : {}),
          },
        },
      ],
      partnerReference,
      travelIntent: "LEISURE",
    };

    setLoadingBook(true);
    try {
      const res = await fetch("/api/transferz/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingBody),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Booking failed");
      }

      const booking = data.data as {
        id?: number;
        code?: string;
        journeys?: Array<{
          id?: number;
          code?: string;
          vehicleCategory?: string;
          status?: string;
          travellerAppUrl?: string;
          cancellationDetails?: unknown;
          priceSummary?: { price?: number; currency?: string };
          origin?: { resolvedAddress?: string };
          destination?: { resolvedAddress?: string };
        }>;
      };
      const j0 = Array.isArray(booking?.journeys) ? booking.journeys[0] : undefined;
      if (!j0?.code) {
        throw new Error("Booking response missing journey details.");
      }

      const startHH = normalizePickupTime(pickupTime) ?? "10:00";
      const endHH = addMinutesHHMM(startHH, 120);
      const loc =
        j0.destination?.resolvedAddress?.trim() ||
        resolvedDestination ||
        destAddress.trim() ||
        "—";
      const routeLine = `${resolvedOrigin || "Origin"} → ${resolvedDestination || "Destination"}`;

      const paxLine = `${plural(adults, "adult")} · ${plural(children, "child", "children")} · ${plural(infants, "infant")}`;
      const bagsLine = `${plural(checkedLuggage, "checked bag")} · ${plural(carryOnLuggage, "carry-on")}`;
      const pickupLabel = pickupDateYmd ? `${pickupDateYmd} ${startHH}` : startHH;

      const descriptionParts = [
        `Route: ${routeLine}`,
        `Pickup: ${pickupLabel} (local)`,
        `Passengers: ${paxLine}`,
        `Luggage: ${bagsLine}`,
        internalNotes.trim() ? `Notes: ${internalNotes.trim()}` : null,
      ].filter(Boolean);

      const jobActivityDate =
        pickupDateYmd || itineraryYmdOnly(activityDateISO) || activityDateISO?.trim() || null;

      const providerNet =
        j0.priceSummary?.price != null && Number.isFinite(Number(j0.priceSummary.price))
          ? Number(j0.priceSummary.price)
          : selectedQuote?.price != null && Number.isFinite(Number(selectedQuote.price))
            ? Number(selectedQuote.price)
            : NaN;

      const saveResp = await fetch(
        `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityDateISO: jobActivityDate,
            startTime: startHH,
            endTime: endHH,
            title: `Transfer · ${selectedQuote?.vehicleCategory || j0.vehicleCategory || "Transfer"}`,
            activityType: activityTypeForJob,
            location: countryNameFromAlpha2(destCountry),
            description: descriptionParts.join("\n"),
            payload: {
              source: "transferz",
              fullDestinationAddress: loc,
              destinationCountryCode: destCountry.trim().toUpperCase(),
              /** What the user entered for Transferz; use for UI — DB timestamps are stored in a fixed UTC scheme. */
              pickupWallDate: jobActivityDate,
              pickupStartLocalHHMM: normalizePickupTime(pickupTime) ?? "10:00",
              pickupEndLocalHHMM: addMinutesHHMM(
                normalizePickupTime(pickupTime) ?? "10:00",
                120
              ),
              payment: {
                method: "invoice",
                cadence: "monthly",
                status: "invoiced",
              },
              internalNotes: internalNotes.trim() || null,
              bookingId: booking.id ?? null,
              bookingCode: booking.code ?? null,
              journeyId: j0.id ?? null,
              journeyCode: j0.code,
              journeyStatus: j0.status ?? null,
              cancellationDetails: j0.cancellationDetails ?? null,
              quoteId: selectedQuoteId,
              travellerAppUrl: j0.travellerAppUrl ?? null,
              ...(Number.isFinite(providerNet)
                ? commissionPriceFieldsFromProvider(providerNet, platformCommissionPct)
                : {}),
              currency:
                j0.priceSummary?.currency ??
                selectedQuote?.currencyCode ??
                null,
              adults,
              children,
              infants,
              checkedLuggage,
              carryOnLuggage,
              ...(fn && fn !== "N/A" ? { travellerFlightNumber: fn } : {}),
              ...(transferzMetaForPayload
                ? {
                    transferzEnvironment: transferzMetaForPayload.environment,
                    transferzWarpDriveHost: transferzMetaForPayload.warpDriveHost,
                    transferzGatewayHost: transferzMetaForPayload.gatewayHost,
                  }
                : {}),
            },
          }),
        }
      );
      const saveData = await saveResp.json().catch(() => null);
      if (!saveResp.ok || !saveData?.ok) {
        throw new Error(
          saveData?.error ||
            "Booking succeeded but saving the itinerary transfer failed. Add details manually if needed."
        );
      }

      toast.success("Transfer booked and added to the itinerary.");
      clearTransferzDraft(draftKey);
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoadingBook(false);
    }
  }, [
    selectedQuoteId,
    bookerFirst,
    bookerLast,
    bookerEmail,
    bookerPhone,
    travellerFirst,
    travellerLast,
    travellerEmail,
    travellerPhone,
    flightNumber,
    driverComments,
    internalNotes,
    itineraryId,
    activityDateISO,
    pickupDateYmd,
    pickupTime,
    resolvedOrigin,
    resolvedDestination,
    destAddress,
    destCountry,
    activityTypeForJob,
    adults,
    children,
    infants,
    checkedLuggage,
    carryOnLuggage,
    selectedQuote,
    transferzMetaForPayload,
  ]);

  if (configured === null) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Checking transfer configuration…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="space-y-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tour list
        </button>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {transferzBlockReason?.trim() ? (
            transferzBlockReason.trim()
          ) : (
            <>
              Transfers are not configured on this server yet. Ask an admin to set up the transfer provider credentials
              in the server environment.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      <button
        type="button"
        onClick={() => {
          if (step === "form") onBack();
          else if (step === "quotes") {
            setStep("form");
          } else {
            setStep("quotes");
          }
        }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === "form" ? "Back to tour list" : step === "quotes" ? "Edit journey details" : "Back to quotes"}
      </button>

      <div>
        <h3 className="text-lg font-semibold text-foreground">Book a transfer</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Arrange a professional transfer. At least one end should be an
          airport (IATA) or other provider hub — address-to-address often returns no vehicles. Pickup must be a{" "}
          <strong>future</strong> local date and time at the origin (the provider does not quote past trips; send local
          wall time with no timezone suffix). 
        </p>
      </div>

      {pickupIsLikelyPast && pickupDateYmd && (
        <p className="text-sm text-amber-800 dark:text-amber-300 rounded-lg border border-amber-600/50 bg-amber-500/15 px-3 py-2">
          <strong>Past pickup.</strong> The pickup date and time below are already in the past (checked with your
          device clock). The provider will not quote this. Set a future <strong>Pickup date</strong> or time, then try
          again.
        </p>
      )}

      {step === "form" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Origin</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={originMode === "iata" ? "default" : "outline"}
                  size="sm"
                  className={originMode === "iata" ? "bg-[#D4AA25] hover:bg-[#C49A1F]" : ""}
                  onClick={() => {
                    setOriginMode("iata");
                    setOriginAddressPresetId("");
                  }}
                >
                  IATA
                </Button>
                <Button
                  type="button"
                  variant={originMode === "address" ? "default" : "outline"}
                  size="sm"
                  className={originMode === "address" ? "bg-[#D4AA25] hover:bg-[#C49A1F]" : ""}
                  onClick={() => {
                    setOriginMode("address");
                    setOriginIata("");
                  }}
                >
                  Address
                </Button>
              </div>
              {originMode === "iata" ? (
                <select
                  className={transferzSelectClass}
                  value={originIata}
                  onChange={(e) => setOriginIata(e.target.value.toUpperCase())}
                  aria-label="Origin airport"
                >
                  <option value="">Select airport…</option>
                  {TRANSFERZ_IATA_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    className={transferzSelectClass}
                    value={originAddressPresetId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOriginAddressPresetId(v);
                      if (v && v !== TRANSFERZ_ADDRESS_PRESET_CUSTOM) {
                        const p = TRANSFERZ_ADDRESS_PRESETS.find((x) => x.id === v);
                        if (p) {
                          setOriginAddress(p.phrase);
                          setOriginCountry(p.countryCode);
                        }
                      }
                    }}
                    aria-label="Origin place"
                  >
                    <option value="">Select origin…</option>
                    {TRANSFERZ_ADDRESS_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {originAddressPresetId === TRANSFERZ_ADDRESS_PRESET_CUSTOM && (
                    <>
                      <Input
                        placeholder="Hotel, street, city…"
                        value={originAddress}
                        onChange={(e) => setOriginAddress(e.target.value)}
                      />
                      <select
                        className={transferzSelectClass}
                        value={originCountry}
                        onChange={(e) => setOriginCountry(e.target.value)}
                        aria-label="Origin country"
                      >
                        {TRANSFERZ_COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Destination</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={destMode === "iata" ? "default" : "outline"}
                  size="sm"
                  className={destMode === "iata" ? "bg-[#D4AA25] hover:bg-[#C49A1F]" : ""}
                  onClick={() => {
                    setDestMode("iata");
                    setDestAddressPresetId("");
                  }}
                >
                  IATA
                </Button>
                <Button
                  type="button"
                  variant={destMode === "address" ? "default" : "outline"}
                  size="sm"
                  className={destMode === "address" ? "bg-[#D4AA25] hover:bg-[#C49A1F]" : ""}
                  onClick={() => {
                    setDestMode("address");
                    setDestIata("");
                  }}
                >
                  Address
                </Button>
              </div>
              {destMode === "iata" ? (
                <select
                  className={transferzSelectClass}
                  value={destIata}
                  onChange={(e) => setDestIata(e.target.value.toUpperCase())}
                  aria-label="Destination airport"
                >
                  <option value="">Select airport…</option>
                  {TRANSFERZ_IATA_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    className={transferzSelectClass}
                    value={destAddressPresetId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDestAddressPresetId(v);
                      if (v && v !== TRANSFERZ_ADDRESS_PRESET_CUSTOM) {
                        const p = TRANSFERZ_ADDRESS_PRESETS.find((x) => x.id === v);
                        if (p) {
                          setDestAddress(p.phrase);
                          setDestCountry(p.countryCode);
                        }
                      }
                    }}
                    aria-label="Destination place"
                  >
                    <option value="">Select destination…</option>
                    {TRANSFERZ_ADDRESS_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {destAddressPresetId === TRANSFERZ_ADDRESS_PRESET_CUSTOM && (
                    <>
                      <Input
                        placeholder="Hotel, street, city…"
                        value={destAddress}
                        onChange={(e) => setDestAddress(e.target.value)}
                      />
                      <select
                        className={transferzSelectClass}
                        value={destCountry}
                        onChange={(e) => setDestCountry(e.target.value)}
                        aria-label="Destination country"
                      >
                        {TRANSFERZ_COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="transferz-pickup-date">
                Pickup date (local calendar day at origin)
              </label>
              <input
                id="transferz-pickup-date"
                type="date"
                value={pickupDayYmd}
                onChange={(e) => setPickupDayYmd(e.target.value)}
                className={transferzSelectClass}
                aria-label="Pickup date"
              />
              {itineraryContextYmd &&
              itineraryContextYmd < browserTodayYmd ? (
                <p className="text-xs text-muted-foreground leading-snug">
                  <strong>Itinerary context:</strong> you opened <strong>Add tour</strong> for{" "}
                  <span className="tabular-nums">{itineraryContextYmd}</span>. That day is already in the past on
                  your device, so the pickup date starts as <span className="tabular-nums">{browserTodayYmd}</span>{" "}
                  (local today) for Transferz. Change the date if the transfer is on another day.
                </p>
              ) : itineraryContextYmd ? (
                <p className="text-xs text-muted-foreground leading-snug">
                  We prefilled this from the itinerary day used when you opened <strong>Add tour</strong> (
                  <span className="tabular-nums">{itineraryContextYmd}</span>). That is not a separate transfer
                  step — change the date here if the transfer is on another day.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground leading-snug">
                  No itinerary day was in context when this panel opened; choose the transfer date explicitly.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Pickup time (local wall clock)</label>
              <p className="text-xs text-muted-foreground leading-snug mb-1.5">
                Same calendar day as <span className="tabular-nums font-medium text-foreground">{pickupDateYmd ?? "—"}</span>.
                Time at the <strong>transfer origin</strong>, in the <strong>future</strong> — no timezone suffix in
                the API.
              </p>
              <input
                type="time"
                step={60}
                value={pickupTime}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setPickupTime(v.length >= 5 ? v.slice(0, 5) : v);
                }}
                className={transferzSelectClass}
                aria-label="Pickup local time"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Checked bags</label>
                <Input
                  type="number"
                  min={0}
                  value={checkedLuggage}
                  onChange={(e) => setCheckedLuggage(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Carry-on</label>
                <Input
                  type="number"
                  min={0}
                  value={carryOnLuggage}
                  onChange={(e) => setCarryOnLuggage(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Passengers</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-xs text-muted-foreground">Adults</span>
                <Input
                  type="number"
                  min={1}
                  value={adults}
                  onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Children</span>
                <Input
                  type="number"
                  min={0}
                  value={children}
                  onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Infants</span>
                <Input
                  type="number"
                  min={0}
                  value={infants}
                  onChange={(e) => setInfants(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
            disabled={loadingQuotes || !pickupDateYmd || pickupIsLikelyPast}
            onClick={() => void requestQuotes()}
          >
            {loadingQuotes
              ? "Getting quotes…"
              : !pickupDateYmd
                ? "Choose pickup date"
                : pickupIsLikelyPast
                  ? "Pickup is in the past — fix date or time"
                  : "Get quotes"}
          </Button>
        </div>
      )}

      {step === "quotes" && (
        <div className="space-y-3">
          {(resolvedOrigin || resolvedDestination) && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {resolvedOrigin && <span className="block">From: {resolvedOrigin}</span>}
              {resolvedDestination && <span className="block">To: {resolvedDestination}</span>}
            </p>
          )}
          {quotesList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quotes. If pickup date/time is in the past, go back and set a future <strong>Pickup date</strong> or
              time. Otherwise try a different time, use IATA on at least one end, or adjust passengers and luggage.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {quotesList.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedQuoteId(q.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${
                      selectedQuoteId === q.id
                        ? "border-[#D4AA25] bg-[#D4AA25]/10"
                        : "border-border hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-sm">{q.vehicleCategory || "Vehicle"}</span>
                      <span className="text-sm tabular-nums shrink-0 text-right font-semibold">
                        {q.price != null && q.currencyCode && Number.isFinite(Number(q.price))
                          ? formatDailyRateLabel(
                              transferzCustomerTotalFromProvider(Number(q.price), platformCommissionPct),
                              q.currencyCode
                            )
                          : "—"}
                      </span>
                    </div>
                    {q.vehicleModels && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{q.vehicleModels}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Up to {q.passengerCapacity ?? "—"} passengers
                      {q.instantConfirmation ? " · Instant confirmation" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
            disabled={!selectedQuoteId}
            onClick={() => setStep("booker")}
          >
            Continue with selected vehicle
          </Button>
        </div>
      )}

      {step === "booker" && (
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {selectedQuote?.price != null &&
          selectedQuote.currencyCode &&
          Number.isFinite(Number(selectedQuote.price)) ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-semibold tabular-nums">
                {formatDailyRateLabel(
                  transferzCustomerTotalFromProvider(Number(selectedQuote.price), platformCommissionPct),
                  selectedQuote.currencyCode
                )}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The transfer provider requires booker and traveller contact details, including traveller flight number
            (use &quot;N/A&quot; if not applicable).
          </p>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Booker (agent)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="First name" value={bookerFirst} onChange={(e) => setBookerFirst(e.target.value)} />
              <Input placeholder="Last name" value={bookerLast} onChange={(e) => setBookerLast(e.target.value)} />
            </div>
            <Input placeholder="Email" value={bookerEmail} onChange={(e) => setBookerEmail(e.target.value)} />
            <Input placeholder="Phone (+country…)" value={bookerPhone} onChange={(e) => setBookerPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Lead traveller</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="First name"
                value={travellerFirst}
                onChange={(e) => setTravellerFirst(e.target.value)}
              />
              <Input
                placeholder="Last name"
                value={travellerLast}
                onChange={(e) => setTravellerLast(e.target.value)}
              />
            </div>
            <Input placeholder="Email" value={travellerEmail} onChange={(e) => setTravellerEmail(e.target.value)} />
            <Input
              placeholder="Phone (+country…)"
              value={travellerPhone}
              onChange={(e) => setTravellerPhone(e.target.value)}
            />
            <Input
              placeholder="Flight number (or N/A)"
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
            />
            <textarea
              placeholder="Driver comments (optional)"
              value={driverComments}
              onChange={(e) => setDriverComments(e.target.value)}
              className="w-full min-h-[72px] px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Notes (internal)</p>
            <textarea
              placeholder="Visible to your team in Pagoda (optional). Not sent to the driver."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full min-h-[72px] px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
          </div>

          <Button
            type="button"
            className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
            disabled={loadingBook}
            onClick={() => void confirmBookingAndJob()}
          >
            {loadingBook ? "Booking…" : "Create booking & add to itinerary"}
          </Button>
        </div>
      )}
    </div>
  );
}
