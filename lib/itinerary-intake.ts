export type ItineraryBuildMode = "self" | "pagoda_build";

/** One stop in the client stay plan (order matters; same city can appear twice). */
export type DestinationStay = {
  city: string;
  nights: number;
  /** Optional hotel name for this stay. */
  hotelName?: string;
};

export type ItineraryIntakeData = {
  advisorName?: string;
  agencyName?: string;
  clientFullName?: string;
  clientEmail?: string;
  totalTravelers?: number;
  adults?: number;
  children?: number;
  infants?: number;
  primaryDestination?: string;
  /** Free-text cities/regions that matter to the client (e.g. Tokyo, Kyoto, Osaka). */
  importantDestinations?: string;
  /**
   * Ordered city stay plan with nights (e.g. Tokyo 3 → Kyoto 2 → Tokyo 3).
   * Preferred over free-text for itinerary/AI drafting.
   */
  destinationStays?: DestinationStay[];
  /** Whether clients are open to Pagoda destination recommendations. */
  openToRecommendations?: "Yes" | "No" | string;
  additionalDestinations?: string[];
  travelerTypes?: string[];
  estimatedBudget?: string;
  travelStyles?: string[];
  tripPace?: string;
  activityLevel?: string;
  japanExperiences?: string[];
  thailandExperiences?: string[];
  vietnamExperiences?: string[];
  cambodiaExperiences?: string[];
  southKoreaExperiences?: string[];
  chinaExperiences?: string[];
  taiwanExperiences?: string[];
  tourStyles?: string[];
  transportationPreferences?: string[];
  experiencesToAvoid?: string[];
  /** Ordered priorities (tap order = rank). */
  topPriorities?: string[];
  mustHaveExperiences?: string;
  additionalNotes?: string;
  /** @deprecated legacy single travel style */
  travelStyle?: string;
  /** @deprecated */
  activityTypes?: string[];
  /** @deprecated */
  specialInterests?: string[];
  /** @deprecated */
  mobilityRequirements?: string;
  /** @deprecated */
  dietaryRequirements?: string;
};

export const ITINERARY_BUILD_MODES: {
  value: ItineraryBuildMode;
  label: string;
  description: string;
}[] = [
  {
    value: "pagoda_build",
    label: "Pagoda team builds this for me",
    description: "Submit your client details and our team will create the first draft proposal.",
  },
  {
    value: "self",
    label: "I will build this itinerary myself",
    description: "Use the Pagoda guide library and tour library to create the proposal.",
  },
];

export const PRIMARY_DESTINATIONS = [
  "Japan",
  "Thailand",
  "Vietnam",
  "Cambodia",
  "South Korea",
  "China",
  "Taiwan",
] as const;

export const ADDITIONAL_DESTINATIONS = [
  "Thailand",
  "Vietnam",
  "Cambodia",
  "South Korea",
  "China",
  "Taiwan",
] as const;

export const TRAVELER_TYPES = [
  "Solo Traveler",
  "Couple",
  "Family",
  "Multi-Generational Family",
  "Friends Group",
  "Honeymoon",
  "Special occasion",
] as const;

export const BUDGET_OPTIONS = [
  "Under $3,000",
  "$3,000–$5,000",
  "$5,000–$8,000",
  "$8,000–$12,000",
  "Over $12,000",
] as const;

export const TRAVEL_STYLES = [
  "Food",
  "Off-the-Beaten-Path",
  "Culture",
  "Nature",
] as const;

export const JAPAN_EXPERIENCES = [
  "Kyoto Culture",
  "Mount Fuji / Hakone",
  "Osaka Food Scene",
  "Skiing",
  "Cherry Blossom Season",
  "Food tours",
  "Samurai & Geisha",
  "Sake tasting",
  "Tea Ceremonies",
  "Cooking class",
  "Sake Tastings",
  "Helicopter",
  "Private yacht",
  "Luxury & Race cars",
] as const;

export const THAILAND_EXPERIENCES = [
  "Bangkok Luxury",
  "Thai Street Food",
  "Wellness Retreats",
  "Phuket Beaches",
  "Island Hopping",
  "Elephant Sanctuaries",
  "Temples & Culture",
  "Nightlife",
  "Yacht Experiences",
  "Jungle Adventures",
  "Cooking Classes",
] as const;

export const VIETNAM_EXPERIENCES = [
  "Hanoi Culture",
  "Ho Chi Minh City",
  "Ha Long Bay Cruise",
  "Street Food Tours",
  "History & War Sites",
  "Countryside Experiences",
  "Luxury River Cruises",
  "Lantern Festivals",
  "Artisan Workshops",
  "Nature & Mountains",
] as const;

export const CAMBODIA_EXPERIENCES = [
  "Angkor Wat",
  "Luxury Heritage Experiences",
  "Temple Exploration",
  "River Cruises",
  "Village Experiences",
  "Cultural Performances",
  "Wellness Retreats",
] as const;

export const SOUTH_KOREA_EXPERIENCES = [
  "Seoul Luxury",
  "K-Culture / K-Pop",
  "Korean BBQ & Culinary",
  "Beauty & Skincare",
  "Traditional Hanok Experiences",
  "Shopping",
  "Historical Palaces",
  "Nature & Hiking",
  "Wellness Experiences",
  "Jeju Island",
] as const;

export const CHINA_EXPERIENCES = [
  "Great Wall",
  "Beijing History",
  "Shanghai Luxury",
  "Panda Experiences",
  "River Cruises",
  "Culinary Experiences",
  "Ancient Villages",
  "Nature Landscapes",
  "Silk Road Experiences",
  "Tea Culture",
] as const;

export const TAIWAN_EXPERIENCES = [
  "Taipei Food Scene",
  "Night Markets",
  "Tea Culture",
  "Nature & Mountains",
  "Hot Springs",
  "Indigenous Culture",
  "Scenic Rail Journeys",
] as const;

export const TOUR_STYLES = [
  "Private Tours",
  "Self guided tours",
  "A mix of guided and self guided activities",
  "Driver & Vehicle",
] as const;

export const TRANSPORTATION_PREFERENCES = [
  "Bullet Trains",
  "Airport transfers",
  "Private Transfers",
] as const;

export const EXPERIENCES_TO_AVOID = [
  "Physically Demanding Activities",
  "Long Walking Days",
  "Early Morning Starts",
  "Fast-Paced Itineraries",
  "Crowds",
  "Long drives",
] as const;

export const PRIORITY_OPTIONS = [
  "Luxury",
  "Authentic Experiences",
  "Food & Culinary",
  "Culture & History",
  "Relaxation",
  "Adventure",
  "Shopping",
  "Wellness",
  "Convenience",
  "VIP Access",
  "Nature",
  "Family-Friendly Activities",
] as const;

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Parse ordered city + nights stays from intake JSON (or empty). */
export function parseDestinationStays(raw: unknown): DestinationStay[] {
  if (!Array.isArray(raw)) return [];
  const out: DestinationStay[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const city = str(r.city).trim();
    const nights = num(r.nights, 0);
    const hotelName = str(r.hotelName).trim();
    if (!city && nights <= 0 && !hotelName) continue;
    out.push({
      city,
      nights: Math.min(365, Math.max(0, nights)),
      ...(hotelName ? { hotelName } : {}),
    });
  }
  return out;
}

export function formatDestinationStaysLine(stays?: DestinationStay[] | null): string {
  if (!stays?.length) return "";
  return stays
    .filter((s) => s.city.trim())
    .map((s) => {
      const n = Number(s.nights) || 0;
      const nightLabel = n === 1 ? "1 night" : `${n} nights`;
      const hotel = s.hotelName?.trim();
      return hotel
        ? `${s.city.trim()} (${nightLabel}, ${hotel})`
        : `${s.city.trim()} (${nightLabel})`;
    })
    .join(" → ");
}

export function totalDestinationNights(stays?: DestinationStay[] | null): number {
  if (!stays?.length) return 0;
  return stays.reduce((sum, s) => sum + (Number(s.nights) || 0), 0);
}

/** Keep free-text field in sync for emails / older readers. */
export function importantDestinationsFromStays(stays?: DestinationStay[] | null): string {
  if (!stays?.length) return "";
  return stays
    .map((s) => s.city.trim())
    .filter(Boolean)
    .join(", ");
}

export function emptyIntakeData(): ItineraryIntakeData {
  return {
    advisorName: "",
    agencyName: "",
    clientFullName: "",
    clientEmail: "",
    totalTravelers: 2,
    adults: 2,
    children: 0,
    infants: 0,
    primaryDestination: "Japan",
    importantDestinations: "",
    destinationStays: [],
    openToRecommendations: "",
    additionalDestinations: [],
    travelerTypes: [],
    estimatedBudget: "",
    travelStyles: [],
    tripPace: "",
    activityLevel: "",
    japanExperiences: [],
    thailandExperiences: [],
    vietnamExperiences: [],
    cambodiaExperiences: [],
    southKoreaExperiences: [],
    chinaExperiences: [],
    taiwanExperiences: [],
    tourStyles: [],
    transportationPreferences: [],
    experiencesToAvoid: [],
    topPriorities: [],
    mustHaveExperiences: "",
    additionalNotes: "",
  };
}

export function parseIntakeData(raw: unknown): ItineraryIntakeData {
  if (!raw || typeof raw !== "object") return emptyIntakeData();
  const o = raw as Record<string, unknown>;
  const empty = emptyIntakeData();

  const travelStyles = strArr(o.travelStyles);
  const legacyStyle = str(o.travelStyle);
  if (!travelStyles.length && legacyStyle) travelStyles.push(legacyStyle);

  return {
    ...empty,
    advisorName: str(o.advisorName),
    agencyName: str(o.agencyName),
    clientFullName: str(o.clientFullName),
    clientEmail: str(o.clientEmail),
    totalTravelers: num(o.totalTravelers, num(o.adults, 2) + num(o.children, 0) + num(o.infants, 0)),
    adults: num(o.adults, 2),
    children: num(o.children, 0),
    infants: num(o.infants, 0),
    primaryDestination: str(o.primaryDestination),
    importantDestinations: str(o.importantDestinations),
    destinationStays: parseDestinationStays(o.destinationStays),
    openToRecommendations: str(o.openToRecommendations),
    additionalDestinations: strArr(o.additionalDestinations),
    travelerTypes: strArr(o.travelerTypes),
    estimatedBudget: str(o.estimatedBudget),
    travelStyles,
    tripPace: str(o.tripPace),
    activityLevel: str(o.activityLevel),
    japanExperiences: strArr(o.japanExperiences),
    thailandExperiences: strArr(o.thailandExperiences),
    vietnamExperiences: strArr(o.vietnamExperiences),
    cambodiaExperiences: strArr(o.cambodiaExperiences),
    southKoreaExperiences: strArr(o.southKoreaExperiences),
    chinaExperiences: strArr(o.chinaExperiences),
    taiwanExperiences: strArr(o.taiwanExperiences),
    tourStyles: strArr(o.tourStyles),
    transportationPreferences: strArr(o.transportationPreferences),
    experiencesToAvoid: strArr(o.experiencesToAvoid),
    topPriorities: strArr(o.topPriorities),
    mustHaveExperiences: str(o.mustHaveExperiences),
    additionalNotes: str(o.additionalNotes),
    travelStyle: legacyStyle,
    activityTypes: strArr(o.activityTypes),
    specialInterests: strArr(o.specialInterests),
    mobilityRequirements: str(o.mobilityRequirements),
    dietaryRequirements: str(o.dietaryRequirements),
  };
}

export function normalizeBuildMode(v: unknown): ItineraryBuildMode {
  return v === "pagoda_build" ? "pagoda_build" : "self";
}

export function selectedDestinations(intake: ItineraryIntakeData): string[] {
  const list = [
    intake.primaryDestination,
    ...(intake.additionalDestinations ?? []),
  ].filter((d): d is string => Boolean(d?.trim()));
  return [...new Set(list)];
}

export function destinationSelected(intake: ItineraryIntakeData, name: string): boolean {
  return selectedDestinations(intake).includes(name);
}

export function toggleListValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Ranked priorities: click to add or remove. Order = priority rank. */
export function togglePriority(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function validateIntakeForPagodaBuild(intake: ItineraryIntakeData): string | null {
  if (!intake.advisorName?.trim()) return "Please enter the travel advisor name.";
  if (!intake.clientFullName?.trim()) return "Please enter the client full name.";
  const hasCityStay = (intake.destinationStays ?? []).some((s) => s.city?.trim());
  if (!hasCityStay && !intake.primaryDestination?.trim()) {
    return "Please add at least one city destination.";
  }
  if (!intake.estimatedBudget?.trim()) {
    return "Please select an estimated budget per person.";
  }
  if (!(intake.travelStyles ?? []).length && !intake.travelStyle?.trim()) {
    return "Please select at least one special interest.";
  }
  const adults = intake.adults ?? 0;
  const children = intake.children ?? 0;
  const infants = intake.infants ?? 0;
  if (adults + children + infants < 1) return "Please enter the number of travelers.";
  return null;
}

function cleanArr(arr?: string[]): string[] | undefined {
  return arr?.length ? arr : undefined;
}

export function intakeDataForApi(intake: ItineraryIntakeData): ItineraryIntakeData {
  const travelStyles = intake.travelStyles?.length
    ? intake.travelStyles
    : intake.travelStyle?.trim()
      ? [intake.travelStyle.trim()]
      : undefined;

  return {
    advisorName: intake.advisorName?.trim() || undefined,
    agencyName: intake.agencyName?.trim() || undefined,
    clientFullName: intake.clientFullName?.trim() || undefined,
    clientEmail: intake.clientEmail?.trim() || undefined,
    totalTravelers: intake.totalTravelers,
    adults: intake.adults,
    children: intake.children,
    infants: intake.infants,
    primaryDestination: intake.primaryDestination?.trim() || undefined,
    importantDestinations:
      intake.importantDestinations?.trim() ||
      importantDestinationsFromStays(intake.destinationStays) ||
      undefined,
    destinationStays: (() => {
      const cleaned = (intake.destinationStays ?? [])
        .map((s) => {
          const hotelName = (s.hotelName || "").trim();
          return {
            city: (s.city || "").trim(),
            nights: Math.min(365, Math.max(0, Number(s.nights) || 0)),
            ...(hotelName ? { hotelName } : {}),
          };
        })
        .filter((s) => s.city.length > 0);
      return cleaned.length ? cleaned : undefined;
    })(),
    openToRecommendations: intake.openToRecommendations?.trim() || undefined,
    additionalDestinations: cleanArr(intake.additionalDestinations),
    travelerTypes: cleanArr(intake.travelerTypes),
    estimatedBudget: intake.estimatedBudget?.trim() || undefined,
    travelStyles,
    tripPace: intake.tripPace?.trim() || undefined,
    activityLevel: intake.activityLevel?.trim() || undefined,
    japanExperiences: cleanArr(intake.japanExperiences),
    thailandExperiences: cleanArr(intake.thailandExperiences),
    vietnamExperiences: cleanArr(intake.vietnamExperiences),
    cambodiaExperiences: cleanArr(intake.cambodiaExperiences),
    southKoreaExperiences: cleanArr(intake.southKoreaExperiences),
    chinaExperiences: cleanArr(intake.chinaExperiences),
    taiwanExperiences: cleanArr(intake.taiwanExperiences),
    tourStyles: cleanArr(intake.tourStyles),
    transportationPreferences: cleanArr(intake.transportationPreferences),
    experiencesToAvoid: cleanArr(intake.experiencesToAvoid),
    topPriorities: cleanArr(intake.topPriorities),
    mustHaveExperiences: intake.mustHaveExperiences?.trim() || undefined,
    additionalNotes: intake.additionalNotes?.trim() || undefined,
  };
}
