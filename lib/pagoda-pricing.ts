/**
 * The single pricing authority for advisor-facing prices.
 *
 * There used to be two formulas that disagreed. The Tour Library derived prices live from
 * each guide's `guide_commission_settings` (admin-editable), while itinerary lines, booking
 * confirmation emails and the sidebar preview used a hardcoded 20% Pagoda markup. Raising a
 * partner's commission in admin moved the library price and left the itinerary — and the
 * price actually invoiced — untouched.
 *
 *   guide net (or advisor supplier price)
 *     → + commissionMarketplacePct   Pagoda's cut      (per guide, admin-editable)
 *     = Pagoda price to advisor
 *     → + advisor markup %           advisor's margin  (line → itinerary → account →
 *                                                       the guide's commissionAgentPct)
 *     = client display price
 *
 * The advisor markup defaults to the guide's `commissionAgentPct`, which is why a line with
 * no override prices identically to that tour's "From" price in the library. Percentages are
 * read live on every computation: change a commission, and every surface moves together.
 *
 * Rounding matches `getDisplayTotalExact` — compounded exactly, rounded once at the end — so
 * a library price and an itinerary line never differ by a yen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PAGODA_MARKUP_PCT,
  parseMarkupPct,
  parseMoney,
} from "@/lib/advisor-markup";
import {
  commissionSettingsForUserId,
  fetchPrimaryGuideIdByTourId,
  loadGuideCommissionSettingsByUserIds,
  resolveCommissionUserIdForTour,
} from "@/lib/guide-commission-for-tour";
import { parseCommissionSettings, type CommissionSettings } from "@/lib/tour-price";

export type PagodaLinePrice = {
  /** Pagoda's sell price to the advisor, before the advisor commission. */
  baseDisplayPrice: number | null;
  /** What the client sees on the proposal. */
  displayPrice: number | null;
  advisorProfit: number | null;
  priceSource: "markup" | "base" | "none";
  /** Percentages actually applied — surfaced so the UI can explain the number. */
  marketplacePct: number;
  markupPct: number;
  /** Costs carried at face value inside the two figures above; no commission taken. */
  passThroughCost: number;
};

const EMPTY_PRICE: PagodaLinePrice = {
  baseDisplayPrice: null,
  displayPrice: null,
  advisorProfit: null,
  priceSource: "none",
  marketplacePct: DEFAULT_PAGODA_MARKUP_PCT,
  markupPct: 0,
  passThroughCost: 0,
};

/**
 * The advisor commission applied to a line.
 *
 * This is Pagoda's commission to the advisor, set per guide in
 * `guide_commission_settings.commission_agent_pct` and split with the host agency outside the
 * platform. It is not a margin the advisor chooses: one tour has one sales price, whoever is
 * selling it.
 *
 * It was previously the last step of a chain — line override, then itinerary, then account,
 * then the commission — which meant an advisor could move the sales price simply by dragging
 * the markup slider. A tour quoted at ¥14,375 in the catalog reached the client at ¥14,910
 * because an itinerary carried a 19.3% markup, and a `0` saved anywhere in that chain removed
 * Pagoda's commission altogether.
 *
 * `line_markup_pct` / `markup_pct` / `default_markup_pct` are still stored and still shown as
 * the advisor's own margin target; they no longer decide what the client is charged.
 */
export function advisorCommissionPctForLine(commission: CommissionSettings): number {
  return commission.commissionAgentPct;
}

/** @deprecated Kept so existing callers compile; the markup arguments are ignored. */
export function advisorMarkupPctForLine(opts: {
  lineMarkupPct?: number | null;
  itineraryMarkupPct?: number | null;
  accountDefaultMarkupPct?: number | null;
  commission: CommissionSettings;
  previewItineraryMarkupPct?: number | null;
}): number {
  return advisorCommissionPctForLine(opts.commission);
}

/**
 * Net → Pagoda price to advisor. Unrounded so the advisor layer compounds exactly; callers
 * that display this value round it themselves.
 */
export function pagodaPriceToAdvisorExact(
  net: number,
  commission: CommissionSettings
): number {
  return net + (net * commission.commissionMarketplacePct) / 100;
}

/**
 * Full line price from a guide/supplier net and the guide's live commission settings.
 *
 * `passThroughCost` is money the guide lays out on the client's behalf — train tickets,
 * entrance fees. It is added after both commissions, so the client pays exactly what the
 * ticket cost and Pagoda takes nothing on it. Folding it into `net` instead would put 25% + 15%
 * on a resold ticket: ¥19,145 on a ¥76,580 fare.
 */
export function priceLineForCommission(opts: {
  /** Guide/tour net, or the advisor's supplier quote — whichever this line is priced from. */
  net: number | null | undefined;
  commission: CommissionSettings;
  markupPct: number;
  /** Carried at face value, outside the commission. */
  passThroughCost?: number | null;
}): PagodaLinePrice {
  const net = parseMoney(opts.net);
  const passThrough = parseMoney(opts.passThroughCost) ?? 0;

  if (net == null) {
    // A line with only a pass-through cost is still worth a price: it is what the client pays.
    if (passThrough > 0) {
      const carried = Math.round(passThrough);
      return {
        baseDisplayPrice: carried,
        displayPrice: carried,
        advisorProfit: 0,
        priceSource: "base",
        marketplacePct: opts.commission.commissionMarketplacePct,
        markupPct: 0,
        passThroughCost: carried,
      };
    }
    return { ...EMPTY_PRICE, marketplacePct: opts.commission.commissionMarketplacePct };
  }

  const baseExact = pagodaPriceToAdvisorExact(net, opts.commission);
  const markupPct = Number(opts.markupPct) || 0;
  const carried = Math.round(passThrough);
  const baseDisplayPrice = Math.round(baseExact) + carried;

  if (markupPct <= 0) {
    return {
      baseDisplayPrice,
      displayPrice: baseDisplayPrice,
      advisorProfit: 0,
      priceSource: "base",
      marketplacePct: opts.commission.commissionMarketplacePct,
      markupPct: 0,
      passThroughCost: carried,
    };
  }

  const displayPrice = Math.round(baseExact * (1 + markupPct / 100)) + carried;
  return {
    baseDisplayPrice,
    displayPrice,
    // The commission is earned on the service only, so the carried cost cancels out.
    advisorProfit: displayPrice - baseDisplayPrice,
    priceSource: "markup",
    marketplacePct: opts.commission.commissionMarketplacePct,
    markupPct,
    passThroughCost: carried,
  };
}

/** Commission defaults for a guide with no settings row (25% / 15%). */
export function defaultCommissionSettings(): CommissionSettings {
  return parseCommissionSettings({});
}

export type JobForCommission = {
  id: string;
  tour_id?: string | null;
  /** Guide being booked, when one is committed to this line. */
  guide_id?: string | null;
  tour?: { user_id?: string | null } | null;
};

type ApplicationForCommission = {
  applicant_id?: string | null;
  offer_status?: string | null;
  price_confirmation_status?: string | null;
  is_candidate?: boolean | null;
  is_finalist?: boolean | null;
};

/**
 * The guide who will actually invoice Pagoda for this line, if one is committed yet.
 *
 * Ordered by how settled the commitment is: a confirmed price beats a pending one, which
 * beats an accepted offer, which beats a shortlisted candidate. Anything less than that is
 * still an open job, so the tour owner's commission applies instead.
 */
export function bookedGuideIdFromApplications(
  applications: unknown
): string | null {
  const apps = Array.isArray(applications)
    ? (applications as ApplicationForCommission[])
    : [];
  if (apps.length === 0) return null;

  const applicantId = (a: ApplicationForCommission | undefined): string | null => {
    const id = typeof a?.applicant_id === "string" ? a.applicant_id.trim() : "";
    return id || null;
  };
  const offer = (a: ApplicationForCommission) => String(a.offer_status || "").toLowerCase();

  return (
    applicantId(apps.find((a) => a.price_confirmation_status === "confirmed")) ??
    applicantId(apps.find((a) => a.price_confirmation_status === "requested")) ??
    applicantId(apps.find((a) => ["completed", "hired", "accepted"].includes(offer(a)))) ??
    applicantId(apps.find((a) => a.is_finalist === true)) ??
    applicantId(apps.find((a) => a.is_candidate === true || offer(a) === "candidate")) ??
    null
  );
}

/**
 * Whose commission applies to a job line.
 *
 * A line that came from the Tour Library prices exactly as that tour does in the catalog —
 * assigned guide, else tour owner — because that is the figure the advisor was quoted when
 * they added it. Preferring the booked guide instead makes the price move the moment a guide
 * is committed: an advisor who added a tour at ¥13,800 saw a few hundred more on the
 * itinerary, with nothing in the UI to explain it. Whoever ends up invoicing, the quote holds.
 *
 * The booked guide's commission is used only for a line with no tour behind it — a direct or
 * custom job, where there is no catalog price to honour.
 */
export function resolveCommissionUserIdForJob(
  job: JobForCommission,
  primaryGuideByTourId: Map<string, string>
): string | null {
  const tourId = job.tour_id != null ? String(job.tour_id).trim() : "";
  const tourOwner =
    typeof job.tour?.user_id === "string" ? job.tour.user_id.trim() : "";

  if (tourId || tourOwner) {
    return resolveCommissionUserIdForTour(tourId, tourOwner, primaryGuideByTourId);
  }

  const bookedGuide = typeof job.guide_id === "string" ? job.guide_id.trim() : "";
  return bookedGuide || null;
}

export type JobCommissionLookup = {
  /** Commission for one job, falling back to platform defaults when nothing resolves. */
  forJob: (job: JobForCommission) => CommissionSettings;
};

/**
 * Batch-load commission settings for every guide referenced by a set of jobs.
 *
 * Two queries for a whole itinerary regardless of line count — the per-line alternative
 * would put a round trip inside the price loop.
 */
export async function loadJobCommissionLookup(
  supabase: SupabaseClient,
  jobs: JobForCommission[]
): Promise<JobCommissionLookup> {
  const tourIds = [
    ...new Set(
      jobs
        .map((j) => (j.tour_id != null ? String(j.tour_id).trim() : ""))
        .filter(Boolean)
    ),
  ];

  const primaryGuideByTourId = tourIds.length
    ? await fetchPrimaryGuideIdByTourId(supabase, tourIds)
    : new Map<string, string>();

  const commissionUserIds = [
    ...new Set(
      jobs
        .map((j) => resolveCommissionUserIdForJob(j, primaryGuideByTourId))
        .filter((id): id is string => !!id)
    ),
  ];

  const settingsByUserId = commissionUserIds.length
    ? await loadGuideCommissionSettingsByUserIds(supabase, commissionUserIds)
    : new Map<string, CommissionSettings>();

  return {
    forJob(job) {
      const userId = resolveCommissionUserIdForJob(job, primaryGuideByTourId);
      if (!userId) return defaultCommissionSettings();
      return commissionSettingsForUserId(userId, settingsByUserId);
    },
  };
}

/** Commission for a single guide — for paths that price one booking, not an itinerary. */
export async function loadCommissionForGuide(
  supabase: SupabaseClient,
  guideId: string | null | undefined
): Promise<CommissionSettings> {
  const id = typeof guideId === "string" ? guideId.trim() : "";
  if (!id) return defaultCommissionSettings();
  const byUserId = await loadGuideCommissionSettingsByUserIds(supabase, [id]);
  return commissionSettingsForUserId(id, byUserId);
}
