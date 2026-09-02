/**
 * USD/JPY reference rates via Frankfurter (ECB daily reference). Free, no API key.
 * @see https://www.frankfurter.app/docs/
 */

export const FX_RATE_SOURCE = "frankfurter_ecb" as const;
export const DEFAULT_FX_PROTECTION_PCT = 3;
export const FRANKFURTER_LATEST_USD_JPY_URL =
  "https://api.frankfurter.app/latest?from=USD&to=JPY";

/** How long a successful Frankfurter response is reused (ECB updates once per business day). */
export const FX_RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type FxUsdJpyQuote = {
  jpyPerUsd: number;
  rateDate: string;
  fetchedAt: string;
  source: typeof FX_RATE_SOURCE;
};

export type JpyUsdConversion = {
  jpy: number;
  jpyPerUsd: number;
  fxProtectionPct: number;
  usdBase: number;
  usdFinal: number;
  rateDate: string;
  fetchedAt: string;
  source: typeof FX_RATE_SOURCE;
};

type FrankfurterLatestResponse = {
  amount?: number;
  base?: string;
  date?: string;
  rates?: { JPY?: number };
};

let cachedQuote: { quote: FxUsdJpyQuote; at: number } | null = null;

export function invalidateFxRateCache(): void {
  cachedQuote = null;
}

export function parseFrankfurterUsdJpy(body: unknown): FxUsdJpyQuote | null {
  if (!body || typeof body !== "object") return null;
  const data = body as FrankfurterLatestResponse;
  const jpyPerUsd = data.rates?.JPY;
  if (typeof jpyPerUsd !== "number" || !Number.isFinite(jpyPerUsd) || jpyPerUsd <= 0) {
    return null;
  }
  const rateDate = typeof data.date === "string" && data.date.trim() ? data.date.trim() : "";
  if (!rateDate) return null;
  return {
    jpyPerUsd,
    rateDate,
    fetchedAt: new Date().toISOString(),
    source: FX_RATE_SOURCE,
  };
}

/** Fetch USD/JPY from Frankfurter, with in-process cache (24h). */
export async function fetchFrankfurterUsdJpyQuote(
  opts?: { forceRefresh?: boolean }
): Promise<FxUsdJpyQuote> {
  if (
    !opts?.forceRefresh &&
    cachedQuote &&
    Date.now() - cachedQuote.at < FX_RATE_CACHE_TTL_MS
  ) {
    return cachedQuote.quote;
  }

  const res = await fetch(FRANKFURTER_LATEST_USD_JPY_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    if (cachedQuote) return cachedQuote.quote;
    throw new Error(`Frankfurter rate fetch failed (${res.status})`);
  }

  const body = await res.json().catch(() => null);
  const quote = parseFrankfurterUsdJpy(body);
  if (!quote) {
    if (cachedQuote) return cachedQuote.quote;
    throw new Error("Frankfurter returned an invalid USD/JPY rate");
  }

  cachedQuote = { quote, at: Date.now() };
  return quote;
}

export function clampFxProtectionPct(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_FX_PROTECTION_PCT;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/**
 * JPY partner/client price → USD with Pagoda FX protection buffer.
 * Formula (John / Pagoda Pro spec): usd_base = jpy ÷ jpy_per_usd; usd_final = usd_base × (1 + buffer%).
 */
export function convertJpyToUsdWithBuffer(
  jpy: number,
  jpyPerUsd: number,
  fxProtectionPct: number = DEFAULT_FX_PROTECTION_PCT
): JpyUsdConversion {
  const jpyRounded = Math.round(Number(jpy));
  const rate = Number(jpyPerUsd);
  const buffer = clampFxProtectionPct(fxProtectionPct);
  const usdBase = jpyRounded / rate;
  const usdFinal = usdBase * (1 + buffer / 100);

  return {
    jpy: jpyRounded,
    jpyPerUsd: rate,
    fxProtectionPct: buffer,
    usdBase,
    usdFinal: roundUsd(usdFinal),
    rateDate: "",
    fetchedAt: "",
    source: FX_RATE_SOURCE,
  };
}

export function convertJpyToUsdWithBufferFromQuote(
  jpy: number,
  quote: FxUsdJpyQuote,
  fxProtectionPct: number
): JpyUsdConversion {
  const out = convertJpyToUsdWithBuffer(jpy, quote.jpyPerUsd, fxProtectionPct);
  return {
    ...out,
    rateDate: quote.rateDate,
    fetchedAt: quote.fetchedAt,
    source: quote.source,
  };
}

export function roundUsd(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

/** US$1,234.56 for display (always 2 decimals). */
export function formatUsdAmount(usd: number): string {
  return roundUsd(usd).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Admin-only: full rate metadata including FX buffer %. */
export function fxRateTooltip(quote: FxUsdJpyQuote, fxProtectionPct: number): string {
  return `USD estimate: ECB reference rate (${quote.rateDate}), ¥${quote.jpyPerUsd.toLocaleString()} per US$1, plus ${fxProtectionPct}% FX protection. JPY is the source price.`;
}

/** Advisor-facing hover text — no rate math or buffer % (avoids side-by-side JPY comparison). */
export function fxRateAdvisorHint(): string {
  return "Approximate USD equivalent for reference.";
}
