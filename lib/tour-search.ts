/**
 * Client-side tour catalog search: title, location, activity, and guide names.
 */

type GuideLike = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type TourSearchable = {
  title?: string | null;
  name?: string | null;
  location?: string | null;
  activity_type?: string | null;
  description?: string | null;
  country?: string | null;
  assignedGuides?: GuideLike[] | null;
  agent?: {
    name?: string | null;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

function guideNameBlob(g: GuideLike): string {
  const full = String(g.name || "").trim();
  const parts = [g.firstName, g.lastName]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
  return [full, parts].filter(Boolean).join(" ");
}

/** True when the tour matches free-text search (includes guide / operator names). */
export function tourMatchesSearchQuery(
  tour: TourSearchable,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystacks: string[] = [
    tour.title,
    tour.name,
    tour.location,
    tour.activity_type,
    tour.description,
    tour.country,
    tour.agent?.name,
    tour.agent?.user
      ? `${tour.agent.user.firstName || ""} ${tour.agent.user.lastName || ""}`
      : "",
    ...(tour.assignedGuides || []).map(guideNameBlob),
  ]
    .map((s) => String(s || "").toLowerCase().trim())
    .filter(Boolean);

  return haystacks.some((h) => h.includes(q));
}
