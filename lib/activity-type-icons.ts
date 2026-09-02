/**
 * Activity type → icon in `public/assets/icons/`.
 *
 * Lived only in the PDF renderer, so a transfer or Shinkansen line in the itinerary builder
 * showed the generic photo placeholder while the same line carried its proper icon in the
 * exported proposal. One map, used by both.
 *
 * Legacy labels are kept because rows saved before the renames still carry them.
 */

import {
  CUSTOM_AIRPORT_TRANSFERS_TYPE,
  INSTANT_AIRPORT_TRANSFERS_TYPE,
  PRIVATE_TOUR_TYPE,
  SHINKANSEN_TICKETS_TYPE,
  canonicalizeActivityTypeLabel,
} from "@/lib/tour-activity-types";

export const FALLBACK_ACTIVITY_ICON = "/assets/icons/miscellaneous.svg";

/** Map canonical (and legacy) activity labels → public icon paths. */
const iconList: Record<string, string> = {
  [PRIVATE_TOUR_TYPE]: "/assets/icons/private_tour.svg",
  "Private Tours": "/assets/icons/private_tour.svg",
  "Private tour": "/assets/icons/private_tour.svg",
  "Airport Transfers": "/assets/icons/airport_transfer.svg",
  [INSTANT_AIRPORT_TRANSFERS_TYPE]: "/assets/icons/airport_transfer.svg",
  [CUSTOM_AIRPORT_TRANSFERS_TYPE]: "/assets/icons/airport_transfer.svg",
  "Airport Transfers - Instant confirmation": "/assets/icons/airport_transfer.svg",
  "Airport Transfers - Custom": "/assets/icons/airport_transfer.svg",
  "Instant Confirmation Airport Transfers": "/assets/icons/airport_transfer.svg",
  "Custom Airport Transfers": "/assets/icons/airport_transfer.svg",
  [SHINKANSEN_TICKETS_TYPE]: "/assets/icons/shinkansen.svg",
  "Shinkansen Tickets": "/assets/icons/shinkansen.svg",
  "Special Accommodation": "/assets/icons/special_accommodation.svg",
  "Food Tours": "/assets/icons/food_tours.svg",
  "Pagoda Support": "/assets/icons/free_time.svg",
  "Free Time": "/assets/icons/free_time.svg",
  Transfers: "/assets/icons/airport_transfer.svg",
};

function normalizeIconKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Resolve activity-type icon; tolerate legacy labels and whitespace/case drift. */
export function resolveActivityIconPath(activityType: string | null | undefined): string {
  const raw = (activityType || "").trim();
  if (!raw) return FALLBACK_ACTIVITY_ICON;

  const canonical = canonicalizeActivityTypeLabel(raw);
  if (iconList[canonical]) return iconList[canonical];
  if (iconList[raw]) return iconList[raw];

  const want = normalizeIconKey(canonical || raw);
  for (const [label, path] of Object.entries(iconList)) {
    if (normalizeIconKey(label) === want) return path;
  }
  // Heuristic fallbacks for partial / renamed labels
  if (want.includes("shinkansen") || want.includes("bullet")) {
    return "/assets/icons/shinkansen.svg";
  }
  if (want.includes("airport") && want.includes("transfer")) {
    return "/assets/icons/airport_transfer.svg";
  }
  if (want.includes("private") && want.includes("tour")) {
    return "/assets/icons/private_tour.svg";
  }
  if (want.includes("food")) return "/assets/icons/food_tours.svg";
  if (want.includes("accommodation")) return "/assets/icons/special_accommodation.svg";
  if (want.includes("pagoda support") || want.includes("free")) {
    return "/assets/icons/free_time.svg";
  }
  if (want === "transfers" || want.includes("transfer")) {
    return "/assets/icons/airport_transfer.svg";
  }
  return FALLBACK_ACTIVITY_ICON;
}
