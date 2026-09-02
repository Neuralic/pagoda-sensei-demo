import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeGuideTotalFromTour,
  normalizeJobParticipants,
} from "@/lib/tour-price";

export type PriceConfirmationStatus = "requested" | "confirmed";

export type PriceConfirmationAppLike = {
  offer_status?: string | null;
  price_confirmation_status?: string | null;
  price_confirmation_last_notified_at?: string | null;
  hire_id?: string | null;
};

export function resolvePriceConfirmationStatus(
  apps: PriceConfirmationAppLike[] | null | undefined
): PriceConfirmationStatus | null {
  const list = apps || [];
  if (list.some((a) => a.price_confirmation_status === "confirmed")) {
    return "confirmed";
  }
  if (list.some((a) => a.price_confirmation_status === "requested")) {
    return "requested";
  }
  return null;
}

/** Guide/net from the tour library for this job's party size, if linked. */
export async function snapshotLibraryGuidePrice(
  supabase: SupabaseClient,
  job: {
    tour_id?: string | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    group_size?: number | null;
  }
): Promise<number | null> {
  const tourId = job.tour_id != null ? String(job.tour_id).trim() : "";
  if (!tourId) return null;

  const { data: tour, error } = await supabase
    .from("tour")
    .select(
      "pricing_model, price_per_adult, price_per_child, price_per_infant, base_rate, base_group_size, max_group_size, additional_per_person_rate"
    )
    .eq("id", tourId)
    .maybeSingle();

  if (error || !tour) return null;

  const participants = normalizeJobParticipants({
    adults: job.adults,
    children: job.children,
    infants: job.infants,
    group_size: job.group_size,
  });
  const result = computeGuideTotalFromTour(tour, participants);
  if (result == null || !Number.isFinite(result.guideTotal) || result.guideTotal < 0) {
    return null;
  }
  return Math.round(result.guideTotal);
}

export function formatYen(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  return `¥${Math.round(Number(amount)).toLocaleString()}`;
}

type ApplicationRow = PriceConfirmationAppLike & {
  is_candidate?: boolean | null;
};

export function bookingConfirmFieldsFromJob(job: {
  price_confirmation_status?: string | null;
  job_applications?: unknown;
} | null | undefined): {
  priceConfirmationStatus: string | null;
  offerStatus: string | null;
  hasCommittedGuide: boolean;
  /** Last time the guide's confirmation email actually went out; null = never reached them. */
  priceConfirmationLastNotifiedAt: string | null;
} {
  const apps = Array.isArray(job?.job_applications)
    ? (job.job_applications as ApplicationRow[])
    : [];
  const hasCommittedGuide = apps.some((a) => {
    const s = String(a.offer_status || "").toLowerCase();
    return (
      s === "accepted" ||
      s === "completed" ||
      s === "hired" ||
      s === "pending" ||
      a.is_candidate === true ||
      (typeof a.hire_id === "string" && a.hire_id.length > 0)
    );
  });
  const lead =
    apps.find((a) => {
      const s = String(a.offer_status || "").toLowerCase();
      return (
        s === "completed" ||
        s === "hired" ||
        s === "accepted" ||
        s === "offered" ||
        s === "pending" ||
        a.is_candidate === true
      );
    }) ?? apps[0];
  // Read the timestamp off the application that owns the pending ask, not `lead` — on a job
  // with several bidders the requested one is not always the highest-ranked.
  const pending = apps.find((a) => a.price_confirmation_status === "requested") ?? lead;

  return {
    priceConfirmationStatus:
      resolvePriceConfirmationStatus(apps) ??
      (typeof job?.price_confirmation_status === "string" ? job.price_confirmation_status : null),
    offerStatus: lead?.offer_status ? String(lead.offer_status) : null,
    hasCommittedGuide,
    priceConfirmationLastNotifiedAt:
      typeof pending?.price_confirmation_last_notified_at === "string"
        ? pending.price_confirmation_last_notified_at
        : null,
  };
}
