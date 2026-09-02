/**
 * Pagoda platform markup on Transferz provider quotes (percent of provider net).
 * Stored on `itinerary_transferz_bookings.payload`: `providerPrice`, `platformCommissionAmount`, `price` (customer total).
 *
 * Percent is loaded from `platform_settings` (admin-editable). Pass `commissionPct` into helpers when known.
 */

import { DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT } from "./platform-commission-settings";

function finiteNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && /^-?\d/.test(x.trim())) {
    const n = Number(x.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function transferzPlatformCommissionRounded(
  providerNet: number,
  commissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): number {
  if (!Number.isFinite(providerNet)) return 0;
  const pct = Number.isFinite(commissionPct) ? commissionPct : DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT;
  return Math.round((providerNet * pct) / 100);
}

export function transferzCustomerTotalFromProvider(
  providerNet: number,
  commissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): number {
  if (!Number.isFinite(providerNet)) return NaN;
  return providerNet + transferzPlatformCommissionRounded(providerNet, commissionPct);
}

/** Fields to merge onto a Transferz booking payload (prices are major units, same as the provider API). */
export function commissionPriceFieldsFromProvider(
  providerNet: number,
  commissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): {
  providerPrice: number;
  platformCommissionPct: number;
  platformCommissionAmount: number;
  price: number;
} {
  const pct = Number.isFinite(commissionPct) ? commissionPct : DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT;
  const providerPrice = providerNet;
  const platformCommissionAmount = transferzPlatformCommissionRounded(providerNet, pct);
  const price = providerPrice + platformCommissionAmount;
  return {
    providerPrice,
    platformCommissionPct: pct,
    platformCommissionAmount,
    price,
  };
}

/**
 * Recompute commission fields from provider net. Use on create/update so client cannot omit markup.
 */
export function enrichTransferzPayloadWithCommission(
  payload: Record<string, unknown>,
  commissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): Record<string, unknown> {
  if (payload.source !== "transferz") return payload;
  const prov =
    finiteNumber(payload.providerPrice) ??
    finiteNumber(payload.price);
  if (prov == null) return payload;
  return {
    ...payload,
    ...commissionPriceFieldsFromProvider(prov, commissionPct),
  };
}

/**
 * Display commission from fields saved on the booking at creation time.
 * Uses `providerPrice`, `platformCommissionPct`, `platformCommissionAmount`, and `price` when present.
 * Legacy rows (provider net only in `price`): falls back to `fallbackCommissionPct`.
 */
export function transferzCommissionBreakdownFromPayload(
  payload: Record<string, unknown>,
  fallbackCommissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): { provider: number; commission: number; customer: number; commissionPct: number } | null {
  const storedPct = finiteNumber(payload.platformCommissionPct);
  const pct = storedPct != null ? storedPct : fallbackCommissionPct;
  const provExplicit = finiteNumber(payload.providerPrice);
  const priceStored = finiteNumber(payload.price);
  const commStored = finiteNumber(payload.platformCommissionAmount);

  if (provExplicit != null) {
    const commission =
      commStored != null ? Math.round(commStored) : transferzPlatformCommissionRounded(provExplicit, pct);
    const customer = priceStored != null ? priceStored : provExplicit + commission;
    return {
      provider: provExplicit,
      commission,
      customer,
      commissionPct: storedPct != null ? storedPct : pct,
    };
  }
  if (priceStored != null) {
    const commission =
      commStored != null ? Math.round(commStored) : transferzPlatformCommissionRounded(priceStored, pct);
    const customer =
      commStored != null && commStored < priceStored ? priceStored : priceStored + commission;
    return {
      provider: commStored != null && commStored < priceStored ? priceStored - commStored : priceStored,
      commission,
      customer,
      commissionPct: storedPct != null ? storedPct : pct,
    };
  }
  return null;
}

/** Agent itinerary / PDF: amount including platform markup. */
export function transferzCustomerDisplayAmount(
  payload: Record<string, unknown>,
  fallbackCommissionPct: number = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
): number | null {
  return transferzCommissionBreakdownFromPayload(payload, fallbackCommissionPct)?.customer ?? null;
}
