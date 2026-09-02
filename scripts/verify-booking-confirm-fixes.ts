/**
 * Guards for the confirm-booking flow.
 * Run: node --experimental-strip-types scripts/verify-booking-confirm-fixes.ts
 *
 * `job_hiring_history.application_id` is NOT NULL. Omitting it fails the insert at
 * runtime only, and the booking still reports success, so the loss is silent —
 * that shipped to production once already (23502 on every guide confirmation).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

/** Every `.from("job_hiring_history").insert({...})` literal in a file. */
function hiringHistoryInserts(source: string): string[] {
  const out: string[] = [];
  const marker = '.from("job_hiring_history").insert({';
  let idx = source.indexOf(marker);
  while (idx !== -1) {
    const start = idx + marker.length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    out.push(source.slice(start, i - 1));
    idx = source.indexOf(marker, i);
  }
  return out;
}

console.log("\n=== job_hiring_history required columns ===\n");

for (const relPath of ["lib/finalize-official-booking.ts", "app/api/hire/route.ts"]) {
  const inserts = hiringHistoryInserts(read(relPath));
  assert(`${relPath}: has a hiring history insert`, inserts.length > 0);
  inserts.forEach((body, n) => {
    assert(`${relPath}: insert #${n + 1} sets application_id`, /\bapplication_id\b/.test(body));
    assert(`${relPath}: insert #${n + 1} sets job_id`, /\bjob_id\b/.test(body));
    assert(`${relPath}: insert #${n + 1} sets guide_id`, /\bguide_id\b/.test(body));
    assert(`${relPath}: insert #${n + 1} sets agent_id`, /\bagent_id\b/.test(body));
    assert(`${relPath}: insert #${n + 1} sets final_price`, /\bfinal_price\b/.test(body));
  });
}

console.log("\n=== confirm-booking actions ===\n");

const confirmRoute = read("app/api/jobs/confirm-booking/route.ts");

for (const action of ["request", "resend", "cancel", "mark_booked"]) {
  assert(`route accepts "${action}"`, confirmRoute.includes(`"${action}"`));
}
assert(
  "resend is rate limited",
  confirmRoute.includes("RESEND_COOLDOWN_MS") && confirmRoute.includes("retryAfterSeconds")
);
assert(
  "mark_booked is admin only",
  /action === "mark_booked" && !isAdmin/.test(confirmRoute)
);
assert(
  "cancel clears the pending request",
  /price_confirmation_status: null/.test(confirmRoute)
);

console.log("\n=== awaiting-guide state is actionable ===\n");

const button = read("components/itineraries/confirm-booking-button.tsx");
assert("waiting state renders a menu trigger", button.includes("DropdownMenuTrigger"));
assert("waiting state offers resend", button.includes("Resend request"));
assert("waiting state offers cancel", button.includes("Cancel request"));
assert("admin override is gated on isAdmin", /\{isAdmin && \(/.test(button));

console.log("\n=== guide confirm email (DEAR PARTNER) ===\n");

const mailer = read("lib/mailer.ts");
assert("email uses DEAR PARTNER greeting", mailer.includes("DEAR PARTNER"));
assert("email lists travel advisor name", mailer.includes("Name Travel Advisor:"));
assert("email lists itinerary name", mailer.includes("Name Itinerary:"));
assert("email lists marketplace price", mailer.includes("Price as uploaded by you in the marketplace:"));
assert("email mentions consolidated invoice", mailer.includes("consolidated invoice"));
assert(
  "email button uses guide login deep link",
  mailer.includes("getGuideConfirmBookingLoginDeepLinkUrl")
);

const deepLink = read("lib/booking-deep-link.ts");
assert("deep link routes through guide login", deepLink.includes("/guide/login?redirect="));

console.log("\n=== re-notifying a pending request ===\n");

// A repeat "Confirm booking" used to return ok:true and send nothing, so advisors concluded
// the only way to reach a guide was to delete the tour and re-add it from the library.
assert(
  "a pending request re-sends instead of silently returning",
  /action === "resend" \|\| currentStatus === "requested"/.test(confirmRoute)
);
assert(
  "the old silent already_pending branch is gone",
  !confirmRoute.includes("advisor.request.already_pending")
);
assert(
  "resend is implemented once, not duplicated",
  (confirmRoute.match(/async function resendPriceConfirmation/g) || []).length === 1
);

// Cooldown must run from delivery, not from the request — otherwise a failed first email
// locks the advisor out of the retry that would fix it.
assert(
  "cooldown reads last_notified_at",
  /lastNotifiedMs[\s\S]{0,200}RESEND_COOLDOWN_MS/.test(confirmRoute)
);
assert(
  "cooldown does not read price_confirmation_requested_at",
  !/requestedAtMs/.test(confirmRoute)
);

console.log("\n=== the guide email is not reported before it is sent ===\n");

assert(
  "guide email is awaited, not fire-and-forget",
  confirmRoute.includes("await sendGuideConfirmBookingPriceEmail")
);
assert(
  "route no longer claims emailQueued",
  !confirmRoute.includes("emailQueued")
);
assert(
  "SMTP fallback does not count as a delivery",
  /"fallback" in result && result\.fallback/.test(confirmRoute)
);
assert(
  "delivery outcome is persisted",
  confirmRoute.includes("recordNotifyOutcome") &&
    confirmRoute.includes("price_confirmation_last_notified_at")
);
assert(
  "response carries the real send outcome",
  /emailSent,\n\s+notifyError,/.test(confirmRoute)
);

assert(
  "button reports a failed send as an error",
  button.includes("reportSendOutcome") && /data\.emailSent === false/.test(button)
);
assert(
  "button shows whether the guide was ever emailed",
  button.includes("notifiedLabel") && button.includes("has not been emailed yet")
);
assert(
  "resend is reachable without opening the dropdown",
  /className="shrink-0 cursor-pointer rounded-full[\s\S]{0,400}Resend/.test(button)
);

console.log("\n=== admin override reaches both advisor portals ===\n");

for (const relPath of [
  "app/agent/edit-itinerary/page.tsx",
  "app/agency/edit-itinerary/page.tsx",
]) {
  const page = read(relPath);
  assert(`${relPath}: resolves viewerIsAdmin`, page.includes("setViewerIsAdmin"));
  assert(`${relPath}: passes viewerIsAdmin to DaySection`, page.includes("viewerIsAdmin={viewerIsAdmin}"));
}

console.log("\n=== notify tracking migration ===\n");

const notifyMigration = read(
  "migrations/20260828_booking_price_confirmation_notify_tracking.sql"
);
assert(
  "adds last_notified_at",
  notifyMigration.includes("price_confirmation_last_notified_at")
);
assert("adds notify_error", notifyMigration.includes("price_confirmation_notify_error"));
assert("is idempotent", notifyMigration.includes("IF NOT EXISTS"));
assert("documents the columns", notifyMigration.includes("COMMENT ON COLUMN"));

const backfill = read("migrations/20260827_backfill_job_hiring_history.sql");
assert(
  "hiring-history backfill restores real confirmation dates",
  backfill.includes("price_confirmed_at") && backfill.includes("created_at")
);
assert("hiring-history backfill sets final_price", backfill.includes("final_price"));
assert(
  "hiring-history backfill requires a guide price",
  backfill.includes("quoted_guide_price_at_request")
);

console.log("\n=== the route survives a schema that is behind the deploy ===\n");

// Adding the notify-tracking columns to the select with no fallback 500'd the whole route
// whenever PostgREST could not see them — including when they exist but its schema cache is
// stale. Seven of those in production on 28 Aug, each one an advisor pressing the green button.
assert(
  "application lookups go through the degrading helper",
  confirmRoute.includes("fetchJobApplications") &&
    (confirmRoute.match(/from\("job_applications"\)\s*\n\s*\.select/g) || []).length <= 2
);
assert(
  "a missing notify-tracking column falls back instead of failing",
  confirmRoute.includes("isMissingNotifyTrackingColumn") &&
    confirmRoute.includes("APPLICATION_COLUMNS_BASE")
);
assert(
  "the fallback names the migration and the cache reload",
  /NOTIFY pgrst, 'reload schema'/.test(confirmRoute)
);
assert(
  "no raw database message is returned to the client",
  !/error: \w+Err\.message/.test(confirmRoute)
);

console.log("\n=== shared plumbing is used, not just present ===\n");

// A helper module nobody imports is dead code plus a rule the codebase visibly ignores,
// which teaches the next reader that the rules are decorative.
const adopters = [
  "app/api/jobs/confirm-booking/route.ts",
  "app/api/chats/ensure-pair/route.ts",
  "app/api/chats/messages/[chatId]/route.ts",
];
assert(
  "lib/api-response is imported by the routes that were touched",
  adopters.some((f) => read(f).includes("@/lib/api-response"))
);
assert(
  "lib/validate is imported where a body is parsed",
  ["app/api/jobs/confirm-booking/route.ts", "app/api/chats/ensure-pair/route.ts"].some((f) =>
    read(f).includes("@/lib/validate")
  )
);
assert(
  "confirm-booking validates its body at the edge",
  confirmRoute.includes("parseJsonObject") &&
    confirmRoute.includes("requireString(body.job_id") &&
    confirmRoute.includes("parseEnum(")
);
assert(
  "the blocked-thread response uses migrationRequired",
  read("app/api/chats/ensure-pair/route.ts").includes("migrationRequired(")
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll checks passed\n");
