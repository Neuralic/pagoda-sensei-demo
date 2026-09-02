import type { Tour } from "@/app/types";
import { calculateTimeDuration, formatDate } from "@/lib/common-function";

/**
 * Normalizes a raw tour row (Supabase, /api/tour/*, /api/admin/tours) into the
 * same shape the guide tour library uses for cards, TourDetailModal, and UpdateTourModal.
 */
export function mapApiTourRowToTour(
  apiJob: Partial<Tour> & Record<string, unknown>
): Tour {
  const primaryImage =
    apiJob.image != null && String(apiJob.image).length > 0
      ? Array.isArray(apiJob.image)
        ? JSON.stringify(apiJob.image)
        : String(apiJob.image)
      : "/placeholder.svg";

  let languagesArray: string[] = ["English"];
  if (apiJob.languages != null) {
    if (Array.isArray(apiJob.languages)) {
      languagesArray = apiJob.languages as string[];
    } else if (typeof apiJob.languages === "string") {
      try {
        const parsed = JSON.parse(apiJob.languages);
        languagesArray = Array.isArray(parsed)
          ? parsed
          : apiJob.languages.split(",").map((l) => l.trim()).filter(Boolean) ||
            ["English"];
      } catch {
        languagesArray =
          apiJob.languages.split(",").map((l) => l.trim()).filter(Boolean);
        if (languagesArray.length === 0) languagesArray = ["English"];
      }
    }
  }

  const row = apiJob as {
    price_per_adult?: number | null;
    price_per_child?: number | null;
    price_per_infant?: number | null;
    pricing_model?: string | null;
    base_rate?: number | null;
    base_group_size?: number | null;
    max_group_size?: number | null;
    additional_per_person_rate?: number | null;
    guidePrice?: number | null;
    guide_price?: number | null;
    status?: Tour["status"];
    user_id?: string;
    name?: string;
    created_at?: string;
    group_size?: number | null;
    adults?: number | null;
  };

  const nameStr =
    (typeof apiJob.name === "string" && apiJob.name ? apiJob.name : null) ??
    (typeof apiJob.title === "string" && apiJob.title ? apiJob.title : null) ??
    "";
  const createdAtStr =
    (typeof apiJob.created_at === "string" ? apiJob.created_at : null) ||
    (typeof row.created_at === "string" ? row.created_at : "") ||
    "";

  const groupSize = row.group_size ?? row.adults ?? 1;

  const guidePriceRaw = row.guidePrice ?? row.guide_price;
  const guidePrice =
    typeof guidePriceRaw === "number"
      ? guidePriceRaw
      : guidePriceRaw != null
        ? Number(guidePriceRaw)
        : null;

  return {
    id: String(apiJob.id ?? ""),
    image: primaryImage,
    /** Raw DB image field (JSON array string or path) — used when adding to itineraries */
    imagePath:
      primaryImage !== "/placeholder.svg" ? primaryImage : undefined,
    title: nameStr || undefined,
    name: row.name ?? (typeof apiJob.name === "string" ? apiJob.name : undefined),
    location: (apiJob.location as string) || "",
    country: (apiJob.country as string) || "",
    description: (apiJob.description as string) || "",
    activity_type: (apiJob.activity_type as string) || "",
    activityType: apiJob.activityType as string | undefined,
    duration: calculateTimeDuration(
      apiJob.start_time as string | undefined,
      apiJob.end_time as string | undefined
    ),
    people: Number(groupSize) || 1,
    group_size: Number(groupSize) || 1,
    jobsCount: 0,
    stops: 1,
    tour_date: (apiJob.tour_date as string) || "",
    highlights:
      (apiJob.description as string) || "No description provided",
    languages: languagesArray as unknown as Tour["languages"],
    postedDate: formatDate(createdAtStr || undefined),
    created_at: createdAtStr,
    unassignedCount: 0,
    activities: [],
    notes: (apiJob.notes as string) || "",
    start_time: (apiJob.start_time as string) || "",
    end_time: (apiJob.end_time as string) || "",
    displayPrice: apiJob.displayPrice ?? null,
    priceLabel: apiJob.priceLabel ?? "Your price",
    pricePerAdult:
      apiJob.pricePerAdult ?? row.price_per_adult ?? null,
    pricePerChild:
      apiJob.pricePerChild ?? row.price_per_child ?? null,
    pricePerInfant:
      apiJob.pricePerInfant ?? row.price_per_infant ?? null,
    pricing_model: row.pricing_model ?? null,
    base_rate: row.base_rate ?? null,
    base_group_size: row.base_group_size ?? null,
    max_group_size: row.max_group_size ?? null,
    additional_per_person_rate:
      row.additional_per_person_rate ?? null,
    agent: (apiJob.agent as Tour["agent"]) ?? {
      id: String(row.user_id ?? ""),
      name: "Unknown",
    },
    status: row.status ?? (apiJob as { status?: Tour["status"] }).status,
    guidePrice: Number.isFinite(guidePrice) ? guidePrice : null,
    assignedGuides: Array.isArray(apiJob.assignedGuides)
      ? (apiJob.assignedGuides as Tour["assignedGuides"])
      : undefined,
    needsGuideProfile:
      typeof apiJob.needsGuideProfile === "boolean"
        ? apiJob.needsGuideProfile
        : Array.isArray(apiJob.assignedGuides)
          ? (apiJob.assignedGuides as unknown[]).length === 0
          : undefined,
  };
}
