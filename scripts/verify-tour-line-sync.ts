/**
 * Run: npm run test:tour-sync
 *
 * Correcting a tour in the Tour Library did not reach itineraries that already contained it:
 * adding a tour copied its name and description into the jobs row and nothing read the tour
 * again. The advisor's only recourse was to delete the line from every itinerary and add it
 * back, and until they did, two clients could be reading two different descriptions of the
 * same tour.
 *
 * The fix must not overcorrect. An advisor who rewords a line for their own client has to keep
 * their words when the guide edits the catalogue. `jobs.tour_field_snapshot` records what was
 * copied so the two cases can be told apart, per field.
 *
 * These are the behaviours that must hold. The resolver has no `@/` imports, so it is exercised
 * directly rather than re-derived.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildTourFieldSnapshot,
  resolveTourLinkedFields,
  tourLinkedFieldUpdatesForSave,
} from "../lib/tour-linked-line-fields.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error(`  ✗ ${name}`);
    failed += 1;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  assert(name, ok);
}

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

const ORIGINAL = "One flat fee of ¥36,500 per itinerary.";
const CORRECTED = "One flat fee of ¥36,500 per itinerary, delivered to your hotel.";

const line = (overrides: Record<string, unknown> = {}) => ({
  tour_id: "tour-1",
  name: "Order Your Japan Bullet Train Tickets Here",
  description: ORIGINAL,
  tour_field_snapshot: buildTourFieldSnapshot({
    name: "Order Your Japan Bullet Train Tickets Here",
    description: ORIGINAL,
  }),
  ...overrides,
});

const tourNow = {
  name: "Order Your Japan Bullet Train Tickets Here",
  description: CORRECTED,
};

console.log("\n=== a corrected tour reaches itineraries that already use it ===\n");

const untouched = resolveTourLinkedFields(line(), tourNow);
assertEqual("the line shows the corrected description", untouched.description, CORRECTED);
assert("and reports that it is following the tour", untouched.followsTour.includes("description"));

console.log("\n=== an advisor's own wording is never overwritten ===\n");

const reworded = resolveTourLinkedFields(
  line({ description: "Bullet train tickets, arranged for the Smith family." }),
  tourNow
);
assertEqual(
  "the advisor's description survives the guide editing the catalogue",
  reworded.description,
  "Bullet train tickets, arranged for the Smith family."
);
assert(
  "and it is not reported as following the tour",
  !reworded.followsTour.includes("description")
);
assert(
  "but the untouched title still follows the tour",
  reworded.followsTour.includes("name")
);

console.log("\n=== nothing changes where it should not ===\n");

const noSnapshot = resolveTourLinkedFields(line({ tour_field_snapshot: null }), tourNow);
assertEqual(
  "a row from before the migration keeps its copied text",
  noSnapshot.description,
  ORIGINAL
);

const noTour = resolveTourLinkedFields(line({ tour_id: null }), tourNow);
assertEqual("a line that never came from a tour is untouched", noTour.description, ORIGINAL);

const tourGone = resolveTourLinkedFields(line(), null);
assertEqual("a deleted tour leaves the last known text in place", tourGone.description, ORIGINAL);

const tourBlank = resolveTourLinkedFields(line(), { name: "x", description: null });
assertEqual(
  "a tour with no description does not blank the line",
  tourBlank.description,
  ORIGINAL
);

assertEqual(
  "whitespace-only differences still count as untouched",
  resolveTourLinkedFields(line({ description: `  ${ORIGINAL}  ` }), tourNow).description,
  CORRECTED
);

console.log("\n=== saving another field must not freeze catalogue text ===\n");

const savePriceOnly = tourLinkedFieldUpdatesForSave({
  tourId: "tour-1",
  existingSnapshot: buildTourFieldSnapshot({
    name: "Order Your Japan Bullet Train Tickets Here",
    description: ORIGINAL,
  }),
  existingName: "Order Your Japan Bullet Train Tickets Here",
  existingDescription: ORIGINAL,
  submittedDescription: CORRECTED,
  tour: tourNow,
});
assertEqual(
  "live catalogue text is persisted when the form shows it",
  savePriceOnly.description,
  CORRECTED
);
assert(
  "snapshot moves forward with the catalogue",
  normalize(String(savePriceOnly.tour_field_snapshot?.description)) === normalize(CORRECTED)
);

const saveAdvisorWording = tourLinkedFieldUpdatesForSave({
  tourId: "tour-1",
  existingSnapshot: buildTourFieldSnapshot({
    name: "Order Your Japan Bullet Train Tickets Here",
    description: ORIGINAL,
  }),
  existingName: "Order Your Japan Bullet Train Tickets Here",
  existingDescription: ORIGINAL,
  submittedDescription: "Tickets for the Smith family only.",
  tour: tourNow,
});
assertEqual(
  "advisor rewording is kept",
  saveAdvisorWording.description,
  "Tickets for the Smith family only."
);

console.log("\n=== the app is actually wired to it ===\n");

const jobsRoute = read("app/api/jobs/route.ts");
assert(
  "creating a line from a tour records what was copied",
  jobsRoute.includes("insert.tour_field_snapshot = buildTourFieldSnapshot(")
);
assert(
  "the itinerary read resolves through the helper",
  jobsRoute.includes("withResolvedTourLinkedFields(")
);
assert(
  "the tour's live text is actually selected",
  jobsRoute.includes("tour:tour_id(id, user_id, name, description,")
);
assert(
  "PATCH compares against the live tour before persisting",
  jobsRoute.includes("tourLinkedFieldUpdatesForSave(")
);
assert(
  "single-job reads resolve through the helper",
  jobsRoute.includes("withResolvedTourLinkedFields(")
);

// The 500s in August came from selecting a column production did not have yet.
const fallbackSelect = jobsRoute.slice(jobsRoute.indexOf("job_applications(*), tour:tour_id"));
assert(
  "the degraded select does not ask for the new column",
  !fallbackSelect.slice(0, 400).includes("tour_field_snapshot")
);
assert(
  "an insert against an unmigrated database retries without it",
  jobsRoute.includes("delete insertWithoutTourCols.tour_field_snapshot;")
);

const migration = read("migrations/20260831_jobs_tour_field_snapshot.sql");
assert("the migration is idempotent", migration.includes("ADD COLUMN IF NOT EXISTS"));
assert(
  "it backfills existing lines so they follow their tour",
  /UPDATE jobs[\s\S]*tour_field_snapshot = jsonb_build_object/.test(migration)
);
assert(
  "the backfill only touches tour-linked lines it has not already stamped",
  /WHERE tour_id IS NOT NULL\s*\n\s*AND tour_field_snapshot IS NULL/.test(migration)
);

console.log(
  failed === 0 ? "\nAll checks passed\n" : `\n${failed} check(s) failed\n`
);
process.exit(failed === 0 ? 0 : 1);
