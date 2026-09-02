/** ISO 3166-1 alpha-2 → common English name for itinerary location labels. */
const ALPHA2_NAME: Record<string, string> = {
  JP: "Japan",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  ES: "Spain",
  CN: "China",
  KR: "South Korea",
  TH: "Thailand",
  VN: "Vietnam",
  AU: "Australia",
  NZ: "New Zealand",
  CA: "Canada",
  MX: "Mexico",
  SG: "Singapore",
  MY: "Malaysia",
  ID: "Indonesia",
  PH: "Philippines",
  IN: "India",
  AE: "United Arab Emirates",
  CH: "Switzerland",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  PT: "Portugal",
  GR: "Greece",
  TR: "Turkey",
  TW: "Taiwan",
  HK: "Hong Kong",
};

export function countryNameFromAlpha2(code: string | null | undefined): string {
  if (!code || typeof code !== "string") return "";
  const cc = code.trim().toUpperCase();
  if (cc.length !== 2) return code.trim();
  return ALPHA2_NAME[cc] ?? cc;
}

/**
 * Transferz partner / Warp Drive bookings: the public traveller web app blocks
 * self-service "Change booking" and shows a modal directing users to the agent.
 */
export const TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY =
  'View trip status and details only. "Change booking" in the traveller app is not available for reservations created through this platform.';

/** Shown in agent/agency UI: partner API modify in-app; traveller link remains view-only for self-service. */
export const TRANSFERZ_REQUEST_CHANGES_THROUGH_AGENT =
  "Agents: use “Modify with provider” below to send pickup, flight, or driver-comment updates via API. Travellers still cannot self-serve changes on the web page for these bookings.";

/** Strip billing / provider lines from saved transfer descriptions (legacy + new). */
export function cleanTransferDescriptionForForm(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^(quoted\/payable|amount:)\s*/i.test(t)) return false;
      if (/^payment:/i.test(t)) return false;
      if (/^(status|provider status):/i.test(t)) return false;
      if (/^traveller link:/i.test(t)) return false;
      if (/^provider ref:/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}
