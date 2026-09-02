/**
 * Canonical booking progress for a guide activity.
 *
 * Listing availability (open/closed) is deliberately separate from booking
 * progress. A booked activity is normally hidden from the guide board, but
 * that must never make its booking status look "Open".
 */
export type BookingProgress =
  | "open"
  | "bids_received"
  | "candidate_selected"
  | "offer_sent"
  | "offer_accepted"
  | "awaiting_price_confirmation"
  | "booked"
  | "rejected"
  | "closed";

export type BookingApplicationLike = {
  offer_status?: string | null;
  hire_id?: string | null;
  is_candidate?: boolean | null;
  is_finalist?: boolean | null;
  submitted_at?: string | null;
  price_confirmation_status?: string | null;
};

const BOOKED = new Set(["completed", "hired"]);

export function isBookedApplication(app: BookingApplicationLike): boolean {
  const status = String(app.offer_status || "").toLowerCase();
  return BOOKED.has(status) || Boolean(app.hire_id);
}

function applicationRank(app: BookingApplicationLike): number {
  if (isBookedApplication(app)) return 70;
  const status = String(app.offer_status || "").toLowerCase();
  if (status === "accepted") return 60;
  if (status === "offered") return 50;
  if (status === "candidate" || app.is_candidate || app.is_finalist) return 40;
  if (status === "pending") return 30;
  if (status === "rejected") return 10;
  return 0;
}

/** Most advanced application, rather than simply the newest application. */
export function pickLeadingBookingApplication<T extends BookingApplicationLike>(
  applications: T[] | null | undefined
): T | null {
  const apps = [...(applications || [])];
  apps.sort((a, b) => {
    const rankDiff = applicationRank(b) - applicationRank(a);
    if (rankDiff !== 0) return rankDiff;
    return String(b.submitted_at || "").localeCompare(String(a.submitted_at || ""));
  });
  return apps[0] ?? null;
}

export function deriveBookingProgress(input: {
  applications?: BookingApplicationLike[] | null;
  jobAvailable?: boolean | null;
  isActive?: boolean | null;
}): BookingProgress {
  const apps = input.applications || [];
  const lead = pickLeadingBookingApplication(apps);

  if (apps.some((app) => app.price_confirmation_status === "confirmed")) {
    return "booked";
  }
  if (apps.some((app) => app.price_confirmation_status === "requested")) {
    return "awaiting_price_confirmation";
  }

  if (lead && isBookedApplication(lead)) return "offer_accepted";

  const status = String(lead?.offer_status || "").toLowerCase();
  if (status === "accepted") return "offer_accepted";
  if (status === "offered") return "offer_sent";
  if (status === "candidate" || lead?.is_candidate || lead?.is_finalist) {
    return "candidate_selected";
  }
  if (apps.some((app) => String(app.offer_status || "").toLowerCase() === "pending")) {
    return "bids_received";
  }

  const unavailable = input.jobAvailable === false || input.isActive === false;
  if (unavailable) return "closed";
  if (apps.length > 0 && apps.every((app) => app.offer_status === "rejected")) {
    return "rejected";
  }
  return "open";
}

export const BOOKING_PROGRESS_LABEL: Record<BookingProgress, string> = {
  open: "Open for bids",
  bids_received: "Bids received",
  candidate_selected: "Candidate selected",
  offer_sent: "Offer sent",
  offer_accepted: "Awaiting booking confirmation",
  awaiting_price_confirmation: "Waiting for guide to confirm price",
  booked: "Booked",
  rejected: "No active bids",
  closed: "Closed",
};
