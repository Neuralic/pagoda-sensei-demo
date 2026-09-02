/**
 * An itinerary line created from a Tour Library tour copies the tour's name and description.
 * Nothing re-read the tour afterwards, so correcting a tour left every itinerary already using
 * it showing the old words — the advisor's only fix was to delete the line and add it back, and
 * meanwhile two clients could be reading two different descriptions of the same tour.
 *
 * Reading the tour unconditionally would be the opposite bug: it would silently overwrite an
 * advisor who had reworded the line for their own client.
 *
 * So `jobs.tour_field_snapshot` records what was copied. A field still equal to its snapshot has
 * not been touched and is read live from the tour; a field that differs was edited and stays as
 * the advisor left it. Per field, so rewording the description does not freeze the title.
 */

/** Fields kept in step with the tour. Images are excluded: the copy signs storage paths, so the
 *  job's value and the tour's are not comparable strings. */
const SYNCED_FIELDS = ["name", "description"] as const;
type SyncedField = (typeof SYNCED_FIELDS)[number];

export type TourFieldSnapshot = Partial<Record<SyncedField, string | null>>;

type JobLike = {
  tour_id?: string | number | null;
  name?: string | null;
  description?: string | null;
  tour_field_snapshot?: unknown;
};

/** The joined `tour:tour_id(...)` row. `name` here is the tour's own title. */
type TourLike = {
  name?: string | null;
  description?: string | null;
} | null | undefined;

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function readSnapshot(raw: unknown): TourFieldSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as TourFieldSnapshot;
}

/**
 * What to store when a line is created from a tour, so later edits can be told apart from the
 * original copy.
 */
export function buildTourFieldSnapshot(fields: {
  name?: string | null;
  description?: string | null;
}): TourFieldSnapshot {
  return { name: fields.name ?? null, description: fields.description ?? null };
}

/**
 * Resolve the fields to display for one line. Returns the job's own values untouched when the
 * line is not from a tour, when the tour could not be loaded, or when there is no snapshot —
 * an unmigrated database therefore behaves exactly as it does today.
 */
export function resolveTourLinkedFields(
  job: JobLike,
  tour: TourLike
): { name: string | null; description: string | null; followsTour: SyncedField[] } {
  const own = { name: job.name ?? null, description: job.description ?? null };
  if (!job.tour_id || !tour) return { ...own, followsTour: [] };

  const snapshot = readSnapshot(job.tour_field_snapshot);
  if (!snapshot) return { ...own, followsTour: [] };

  const resolved = { ...own };
  const followsTour: SyncedField[] = [];

  for (const field of SYNCED_FIELDS) {
    // The field was never snapshotted (older row, or a field added later) — leave it alone
    // rather than guess that an unrecorded value was a copy.
    if (!(field in snapshot)) continue;
    if (normalize(job[field]) !== normalize(snapshot[field])) continue; // advisor edited it

    const live = tour[field];
    if (live == null) continue; // the tour has nothing to offer; keep what we have

    resolved[field] = live;
    followsTour.push(field);
  }

  return { ...resolved, followsTour };
}

/** Apply live tour wording onto a job row returned from the database. */
export function withResolvedTourLinkedFields<
  T extends JobLike & { tour?: TourLike },
>(job: T): T & { follows_tour_fields: SyncedField[] } {
  const tourText = resolveTourLinkedFields(job, job.tour);
  return {
    ...job,
    name: tourText.name,
    description: tourText.description,
    follows_tour_fields: tourText.followsTour,
  };
}

/**
 * When an advisor saves a tour-linked line, decide what to persist.
 *
 * The form shows live catalogue text (via resolveTourLinkedFields). Saving another field
 * must not accidentally freeze that text as an advisor rewrite — compare against the live
 * tour, not the stale jobs row.
 */
export function tourLinkedFieldUpdatesForSave(opts: {
  tourId: string | null | undefined;
  existingSnapshot: unknown;
  existingName: string | null | undefined;
  existingDescription: string | null | undefined;
  submittedName?: string | null;
  submittedDescription?: string | null;
  tour: TourLike;
}): {
  name?: string | null;
  description?: string | null;
  tour_field_snapshot?: TourFieldSnapshot | null;
} {
  const out: {
    name?: string | null;
    description?: string | null;
    tour_field_snapshot?: TourFieldSnapshot | null;
  } = {};

  if (!opts.tourId || !opts.tour) return out;

  const snapshot =
    readSnapshot(opts.existingSnapshot) ??
    buildTourFieldSnapshot({
      name: opts.existingName ?? null,
      description: opts.existingDescription ?? null,
    });
  let nextSnapshot: TourFieldSnapshot = { ...snapshot };

  for (const field of SYNCED_FIELDS) {
    const submitted =
      field === "name" ? opts.submittedName : opts.submittedDescription;
    if (submitted === undefined) continue;

    const live = opts.tour[field];
    const submittedNorm = normalize(submitted);
    const liveNorm = normalize(live);
    const snapshotNorm = normalize(snapshot[field]);

    if (live != null && submittedNorm === liveNorm) {
      // Still following the catalogue (including after the guide edits it).
      out[field] = live;
      nextSnapshot[field] = live ?? null;
      continue;
    }

    if (submittedNorm === snapshotNorm) {
      // Unchanged from the copied baseline — leave the row alone so resolve keeps working.
      continue;
    }

    // Advisor's own wording for this field.
    out[field] = typeof submitted === "string" ? submitted.trim() || null : null;
  }

  if (Object.keys(nextSnapshot).length > 0) {
    out.tour_field_snapshot = nextSnapshot;
  }

  return out;
}
