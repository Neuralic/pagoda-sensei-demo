/**
 * Build per-day activity lists for edit-itinerary DaySection.
 * Day placement always follows job/transfer dates (toActivities), not stale
 * activitiesByDay keys — so drag-and-drop day moves reflect immediately.
 */

import { resolveActivityIconPath } from "@/lib/activity-type-icons";

export type DaySectionListActivity = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  time: string;
  location: string;
  duration: string;
  price?: number | null;
  guideName?: string | null;
  guideId?: string | null;
  bidsCount?: number;
  isTransferzBooking?: boolean;
  transferzJourneyCanceled?: boolean;
  transferzFreeCancellationSummary?: string | null;
};

type EnrichSource = {
  id: string;
  title?: string;
  subtitle?: string;
  time?: string;
  location?: string;
  duration?: string;
  price?: number | null;
  image?: string | null;
  images?: string[];
  activityType?: string | null;
  isTransferzBooking?: boolean;
};

/** Flat lookup of saved activity rows (images, etc.) — not used for day assignment. */
export function indexActivitiesById(
  activitiesByDay: Record<string, EnrichSource[]> | undefined
): Map<string, EnrichSource> {
  const map = new Map<string, EnrichSource>();
  if (!activitiesByDay) return map;
  for (const list of Object.values(activitiesByDay)) {
    for (const a of list) {
      if (a?.id) map.set(a.id, a);
    }
  }
  return map;
}

/**
 * Image for one itinerary row, or the icon for its activity type.
 *
 * Two ways this used to come back blank. An unsigned storage path that was not in
 * `jobImageMap` yet was returned verbatim, and the renderer — which only accepts a URL or an
 * absolute path — fell through to the generic photo placeholder. And a line with no image at
 * all returned `""` unless it was a Transferz booking, so airport transfers, Shinkansen
 * tickets and support lines showed that placeholder in the builder while the exported PDF
 * gave them their proper icon.
 *
 * Now: a usable image if there is one, otherwise the activity-type icon, and never a string
 * the renderer cannot resolve.
 */
export function resolveActivityListImage(
  activityId: string,
  fromActivity: { image?: string; images?: string[]; activityType?: string | null },
  saved: EnrichSource | undefined,
  jobImageMap: Record<string, string>,
  transferzDefaultImage: string
): string {
  const isTransferz =
    Boolean(saved?.isTransferzBooking) || activityId.startsWith("transferz-");

  const imgs = Array.isArray(saved?.images)
    ? saved.images
    : Array.isArray(fromActivity.images)
      ? fromActivity.images
      : [];
  const firstImg = typeof imgs[0] === "string" ? imgs[0] : "";
  const rawImage =
    (typeof saved?.image === "string" && saved.image) ||
    firstImg ||
    (typeof fromActivity.image === "string" ? fromActivity.image : "");

  if (
    rawImage &&
    (rawImage.startsWith("http://") ||
      rawImage.startsWith("https://") ||
      rawImage.startsWith("/"))
  ) {
    return rawImage;
  }
  if (rawImage && jobImageMap[rawImage]) {
    return jobImageMap[rawImage];
  }

  // rawImage here is an unsigned storage path we could not resolve — falling back to the
  // type icon beats handing the renderer a string it will discard.
  if (isTransferz) return transferzDefaultImage;

  const activityType =
    (typeof saved?.activityType === "string" && saved.activityType) ||
    (typeof fromActivity.activityType === "string" ? fromActivity.activityType : "");
  return activityType ? resolveActivityIconPath(activityType) : "";
}
