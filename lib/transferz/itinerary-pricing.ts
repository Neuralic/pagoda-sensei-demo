/**
 * Transferz lines on advisor itineraries: client-facing price (with advisor markup)
 * and markup-panel totals. Partner net stays in payload.providerPrice — never overwritten.
 */

import {
  effectiveMarkupPct,
  resolveClientDisplayPrice,
  type JobMarkupPreviewFields,
} from "@/lib/advisor-markup";
import { transferzCustomerDisplayAmount } from "@/lib/transferz/commission";

/**
 * Photo shown on airport-transfer lines in the itinerary builder.
 *
 * AVIF, served through next/image, which negotiates a fallback for anything that cannot take
 * it. The PDF export is unaffected — it renders its own SVG icon per activity type, so this
 * does not need to survive html2canvas.
 *
 * Optimised with `npm run optimize:image`: 130 KB PNG down to 7 KB.
 */
export const TRANSFERZ_ITINERARY_DEFAULT_IMAGE = "/assets/images/airport-transfer.avif";

export type TransferzMarkupOpts = {
  itineraryMarkupPct?: number | null;
  accountDefaultMarkupPct?: number | null;
  previewItineraryMarkupPct?: number | null;
  fallbackCommissionPct?: number;
};

function payloadRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Pagoda transfer price to advisor + advisor markup → proposal line price. */
export function transferzAdvisorDisplayPricing(
  payload: Record<string, unknown>,
  opts: TransferzMarkupOpts = {}
): Pick<JobMarkupPreviewFields, "baseDisplayPrice" | "displayPrice" | "advisorProfit"> {
  const pagodaToAdvisor = transferzCustomerDisplayAmount(
    payload,
    opts.fallbackCommissionPct
  );
  if (pagodaToAdvisor == null) {
    return {
      baseDisplayPrice: null,
      displayPrice: null,
      advisorProfit: null,
    };
  }

  const preview =
    opts.previewItineraryMarkupPct != null &&
    Number.isFinite(Number(opts.previewItineraryMarkupPct))
      ? Number(opts.previewItineraryMarkupPct)
      : null;
  const markupPct =
    preview ??
    effectiveMarkupPct(opts.itineraryMarkupPct, opts.accountDefaultMarkupPct);

  return resolveClientDisplayPrice({
    platformBasePrice: pagodaToAdvisor,
    markupPct,
  });
}

export function transferzBookingsToPriceLines(
  bookings: Array<{ payload?: unknown }>,
  opts: TransferzMarkupOpts = {}
): Array<
  Pick<JobMarkupPreviewFields, "baseDisplayPrice" | "displayPrice" | "advisorProfit">
> {
  return (bookings || []).map((tb) =>
    transferzAdvisorDisplayPricing(payloadRecord(tb.payload), opts)
  );
}
