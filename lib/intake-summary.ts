import type { ItineraryIntakeData } from "@/lib/itinerary-intake";
import { formatDestinationStaysLine } from "@/lib/itinerary-intake";

export type IntakeSummaryRow = {
  label: string;
  value: string;
};

function joinList(arr?: string[]): string {
  return arr?.length ? arr.join(", ") : "";
}

function travelersLine(i: ItineraryIntakeData): string {
  return [
    `${i.adults ?? 0} adult(s)`,
    (i.children ?? 0) > 0 ? `${i.children} child(ren)` : null,
    (i.infants ?? 0) > 0 ? `${i.infants} infant(s)` : null,
    i.totalTravelers != null ? `total ${i.totalTravelers}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function destinationsLine(i: ItineraryIntakeData, fallbackLocation?: string): string {
  const stayLine = formatDestinationStaysLine(i.destinationStays);
  if (stayLine) return stayLine;
  return (
    [i.primaryDestination, ...(i.additionalDestinations ?? [])]
      .filter(Boolean)
      .join(", ") ||
    fallbackLocation ||
    ""
  );
}

function travelStylesLine(i: ItineraryIntakeData): string {
  return joinList(i.travelStyles) || i.travelStyle || "";
}

function prioritiesLine(i: ItineraryIntakeData): string {
  return (i.topPriorities ?? []).map((p, idx) => `${idx + 1}. ${p}`).join("; ");
}

/** Full Asia Luxury intake rows for admin email + UI (skips empty values). */
export function buildIntakeSummaryRows(
  intake: ItineraryIntakeData,
  opts?: { fallbackLocation?: string }
): IntakeSummaryRow[] {
  const i = intake ?? {};
  const rows: IntakeSummaryRow[] = [
    { label: "Advisor name (form)", value: i.advisorName || "" },
    { label: "Agency", value: i.agencyName || "" },
    { label: "Client name", value: i.clientFullName || "" },
    { label: "Client email", value: i.clientEmail || "" },
    { label: "In country destinations", value: destinationsLine(i, opts?.fallbackLocation) },
    {
      label: "Important destinations",
      value: formatDestinationStaysLine(i.destinationStays)
        ? ""
        : i.importantDestinations || "",
    },
    { label: "Travelers", value: travelersLine(i) },
    { label: "Traveler types", value: joinList(i.travelerTypes) },
    { label: "Budget per person", value: i.estimatedBudget || "" },
    { label: "Special interests", value: travelStylesLine(i) },
    { label: "Japan experiences", value: joinList(i.japanExperiences) },
    { label: "Thailand experiences", value: joinList(i.thailandExperiences) },
    { label: "Vietnam experiences", value: joinList(i.vietnamExperiences) },
    { label: "Cambodia experiences", value: joinList(i.cambodiaExperiences) },
    { label: "South Korea experiences", value: joinList(i.southKoreaExperiences) },
    { label: "China experiences", value: joinList(i.chinaExperiences) },
    { label: "Taiwan experiences", value: joinList(i.taiwanExperiences) },
    { label: "Tour styles", value: joinList(i.tourStyles) },
    { label: "Transportation", value: joinList(i.transportationPreferences) },
    { label: "Experiences to avoid", value: joinList(i.experiencesToAvoid) },
    { label: "Top priorities", value: prioritiesLine(i) },
    { label: "Must-have experiences", value: i.mustHaveExperiences || "" },
    { label: "Additional notes", value: i.additionalNotes || "" },
    { label: "Activity types (legacy)", value: joinList(i.activityTypes) },
    { label: "Special interests (legacy)", value: joinList(i.specialInterests) },
    { label: "Mobility (legacy)", value: i.mobilityRequirements || "" },
    { label: "Dietary (legacy)", value: i.dietaryRequirements || "" },
  ];

  return rows.filter((r) => Boolean(r.value?.trim()));
}

export function intakeSummaryHasContent(intake: ItineraryIntakeData | null | undefined): boolean {
  if (!intake) return false;
  return buildIntakeSummaryRows(intake).length > 0;
}
