/**
 * Travel advisor proposal markup primitives.
 *
 * `lib/pagoda-pricing.ts` is the pricing authority — it composes these helpers with each
 * guide's live `guide_commission_settings`. Use it, not these functions, for anything an
 * advisor or client sees.
 *
 * Pricing layers:
 * 1) Pagoda price to advisor = guide/net + that guide's commissionMarketplacePct
 * 2) Client / proposal price = that amount + advisor markup %
 *
 * Margin strategy (keep/share/split) is a suggestion only — host agency
 * divides commission outside Pagoda.
 */

export type MarginStrategy = "keep" | "share" | "split";

/**
 * Last-resort Pagoda markup, NOT a business rule.
 *
 * Real pricing uses the booked guide's `commissionMarketplacePct` from
 * `guide_commission_settings` (admin-editable at /admin/commission-settings). This constant
 * only covers callers with no guide and no commission row to read. Hardcoding it in a priced
 * path is what let an admin raise a partner's commission and still invoice at the old margin.
 */
export const DEFAULT_PAGODA_MARKUP_PCT = 20;

/**
 * Fallback advisor markup when no line, itinerary or account value is set.
 *
 * `advisorMarkupPctForLine` in `lib/pagoda-pricing.ts` prefers the guide's
 * `commissionAgentPct` over this — that is what makes an un-overridden itinerary line match
 * the same tour's price in the Tour Library.
 */
export const DEFAULT_ADVISOR_MARKUP_PCT = 15;

/** Suggestion-only labels (no payout math in Pagoda). */
export const MARGIN_STRATEGIES: {
  value: MarginStrategy;
  label: string;
  hint: string;
}[] = [
  {
    value: "keep",
    label: "KEEP",
    hint: "Advisor keeps the margin (suggestion for host discussions)",
  },
  {
    value: "share",
    label: "SHARE",
    hint: "Share margin with the host agency (they decide the split)",
  },
  {
    value: "split",
    label: "SPLIT",
    hint: "Split margin with the host (suggestion only — host pays out)",
  },
];

export function normalizeMarginStrategy(
  raw: unknown
): MarginStrategy | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "keep" || s === "share" || s === "split") return s;
  return null;
}

/** Clamp markup % to a sane range; null/empty → null (use fallback). */
export function parseMarkupPct(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(500, Math.max(0, n));
}

export function parseMoney(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Net cost used to build Pagoda’s price-to-advisor.
 * An explicit supplier/partner quote always wins (advisor override on tours,
 * or the only price for tickets/hotels/support). Otherwise use guide/tour net.
 */
export function resolveLineNetPrice(opts: {
  supplierPrice?: number | null;
  guideNet?: number | null;
}): number | null {
  const supplier = parseMoney(opts.supplierPrice);
  if (supplier != null) return supplier;
  return parseMoney(opts.guideNet);
}

/**
 * Effective advisor markup for an itinerary:
 * itinerary override → account default → DEFAULT_ADVISOR_MARKUP_PCT (15).
 */
export function effectiveMarkupPct(
  itineraryMarkupPct: number | null | undefined,
  accountDefaultMarkupPct: number | null | undefined
): number {
  const fromItin = parseMarkupPct(itineraryMarkupPct);
  if (fromItin != null) return fromItin;
  const fromAccount = parseMarkupPct(accountDefaultMarkupPct);
  if (fromAccount != null) return fromAccount;
  return DEFAULT_ADVISOR_MARKUP_PCT;
}

/** Per-line override → itinerary → account default → 15%. */
export function effectiveLineMarkupPct(
  lineMarkupPct: number | null | undefined,
  itineraryMarkupPct: number | null | undefined,
  accountDefaultMarkupPct: number | null | undefined
): number {
  const fromLine = parseMarkupPct(lineMarkupPct);
  if (fromLine != null) return fromLine;
  return effectiveMarkupPct(itineraryMarkupPct, accountDefaultMarkupPct);
}

export function applyMarkup(base: number, markupPct: number): number {
  const b = Number(base) || 0;
  const m = Number(markupPct) || 0;
  if (!Number.isFinite(b) || b < 0) return 0;
  return Math.round(b * (1 + m / 100));
}

/** Guide/net → Pagoda’s sell price to the advisor. */
export function pagodaPriceToAdvisor(
  netPrice: number,
  pagodaMarkupPct: number = DEFAULT_PAGODA_MARKUP_PCT
): number {
  return applyMarkup(netPrice, pagodaMarkupPct);
}

export function advisorProfitAmount(
  clientPrice: number,
  basePrice: number
): number {
  const c = Number(clientPrice) || 0;
  const b = Number(basePrice) || 0;
  return Math.round(c - b);
}

/**
 * Resolve client-facing line price via advisor markup on Pagoda
 * price-to-advisor (or supplier folded into that base).
 *
 * `platformBasePrice` should already be Pagoda’s price to the advisor
 * (guide/net + Pagoda %).
 */
export function resolveClientDisplayPrice(opts: {
  /** Pagoda price to advisor (before advisor markup) */
  platformBasePrice: number | null | undefined;
  supplierPrice?: number | null;
  /** @deprecated Ignored — per-line fixed sell override removed */
  clientPrice?: number | null;
  markupPct: number;
  pagodaMarkupPct?: number;
}): {
  baseDisplayPrice: number | null;
  displayPrice: number | null;
  advisorProfit: number | null;
  priceSource: "markup" | "base" | "none";
} {
  const supplier = parseMoney(opts.supplierPrice);
  const platform = parseMoney(opts.platformBasePrice);
  const pagodaPct = opts.pagodaMarkupPct ?? DEFAULT_PAGODA_MARKUP_PCT;

  // Partner/net quote → apply Pagoda layer first when no platform base yet
  const base =
    platform != null
      ? platform
      : supplier != null
        ? pagodaPriceToAdvisor(supplier, pagodaPct)
        : null;

  if (base == null) {
    return {
      baseDisplayPrice: null,
      displayPrice: null,
      advisorProfit: null,
      priceSource: "none",
    };
  }

  const markupPct = Number(opts.markupPct) || 0;
  if (markupPct <= 0) {
    const rounded = Math.round(base);
    return {
      baseDisplayPrice: rounded,
      displayPrice: rounded,
      advisorProfit: 0,
      priceSource: "base",
    };
  }

  const display = applyMarkup(base, markupPct);
  return {
    baseDisplayPrice: Math.round(base),
    displayPrice: display,
    advisorProfit: advisorProfitAmount(display, base),
    priceSource: "markup",
  };
}

export function sumAdvisorMarkupTotals(
  lines: Array<{
    baseDisplayPrice: number | null | undefined;
    displayPrice: number | null | undefined;
    advisorProfit: number | null | undefined;
  }>
): {
  supplierNetTotal: number;
  clientTotal: number;
  advisorProfitTotal: number;
} {
  let supplierNetTotal = 0;
  let clientTotal = 0;
  let advisorProfitTotal = 0;
  for (const line of lines) {
    if (line.baseDisplayPrice != null && Number.isFinite(line.baseDisplayPrice)) {
      supplierNetTotal += Number(line.baseDisplayPrice);
    }
    if (line.displayPrice != null && Number.isFinite(line.displayPrice)) {
      clientTotal += Number(line.displayPrice);
    }
    if (line.advisorProfit != null && Number.isFinite(line.advisorProfit)) {
      advisorProfitTotal += Number(line.advisorProfit);
    }
  }
  return {
    supplierNetTotal: Math.round(supplierNetTotal),
    clientTotal: Math.round(clientTotal),
    advisorProfitTotal: Math.round(advisorProfitTotal),
  };
}

export type JobMarkupPreviewFields = {
  baseDisplayPrice?: number | null;
  displayPrice?: number | null;
  advisorProfit?: number | null;
  line_markup_pct?: number | null;
  markupPct?: number | null;
};

/** Recompute client price from Pagoda price-to-advisor using a new markup %. */
export function reapplyAdvisorMarkupToJob<T extends JobMarkupPreviewFields>(
  job: T,
  markupPct: number
): T {
  const base = parseMoney(job.baseDisplayPrice);
  if (base == null) return job;
  const resolved = resolveClientDisplayPrice({
    platformBasePrice: base,
    markupPct,
  });
  return {
    ...job,
    baseDisplayPrice: resolved.baseDisplayPrice,
    displayPrice: resolved.displayPrice,
    advisorProfit: resolved.advisorProfit,
    markupPct,
  };
}

/**
 * Apply itinerary (or preview) markup to job lines for the builder UI.
 * Respects per-line `line_markup_pct` when set.
 */
export function applyMarkupPreviewToJobs<T extends JobMarkupPreviewFields>(
  jobs: T[],
  opts: {
    itineraryMarkupPct: number | null | undefined;
    accountDefaultMarkupPct: number | null | undefined;
    /** Live slider value before Save — overrides itinerary markup only. */
    previewItineraryMarkupPct?: number | null;
  }
): T[] {
  const previewItinerary =
    opts.previewItineraryMarkupPct != null &&
    Number.isFinite(Number(opts.previewItineraryMarkupPct))
      ? Number(opts.previewItineraryMarkupPct)
      : null;

  return jobs.map((job) => {
    const lineOverride = parseMarkupPct(job.line_markup_pct);
    if (lineOverride != null) {
      return reapplyAdvisorMarkupToJob(job, lineOverride);
    }
    const markupPct =
      previewItinerary != null
        ? previewItinerary
        : effectiveMarkupPct(opts.itineraryMarkupPct, opts.accountDefaultMarkupPct);
    return reapplyAdvisorMarkupToJob(job, markupPct);
  });
}
