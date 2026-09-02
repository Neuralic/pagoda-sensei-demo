/**
 * Report booking requests the guide was never actually emailed.
 *
 * Requests made while the guide email was failing sit at `price_confirmation_status =
 * 'requested'` forever: the advisor sees "Awaiting guide", the guide never heard anything.
 * Before the notify-tracking migration there was no way to tell those apart from a request
 * that was delivered and simply not answered yet.
 *
 *   npm run report:stuck-bookings
 *
 * Read-only. Recovery is a "Resend" tap per row in the itinerary — that path carries the
 * advisor's own session, so it keeps the itinerary access checks in lib/itinerary-access.ts.
 * This script exists to tell you exactly which rows need that tap.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env).
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key);

type StuckRow = {
  id: string;
  job_id: string;
  applicant_id: string | null;
  price_confirmation_requested_at: string | null;
  price_confirmation_last_notified_at: string | null;
  price_confirmation_notify_error: string | null;
};

function daysAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const days = Math.floor(ms / 86_400_000);
  return days === 0 ? "today" : `${days}d ago`;
}

async function main() {
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, job_id, applicant_id, price_confirmation_requested_at, price_confirmation_last_notified_at, price_confirmation_notify_error"
    )
    .eq("price_confirmation_status", "requested")
    .is("price_confirmation_last_notified_at", null)
    .order("price_confirmation_requested_at", { ascending: true });

  if (error) {
    // The column only exists after 20260828_booking_price_confirmation_notify_tracking.sql.
    if (/price_confirmation_last_notified_at|column .* does not exist|schema cache/i.test(error.message)) {
      console.error(
        "Run migration 20260828_booking_price_confirmation_notify_tracking.sql first — " +
          "without it there is no record of which guides were actually emailed."
      );
      process.exit(1);
    }
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const stuck = (data ?? []) as StuckRow[];
  if (stuck.length === 0) {
    console.log("No stuck booking requests — every pending request has a delivered email.");
    return;
  }

  const jobIds = [...new Set(stuck.map((r) => r.job_id).filter(Boolean))];
  const guideIds = [...new Set(stuck.map((r) => r.applicant_id).filter((x): x is string => !!x))];

  const [{ data: jobs }, { data: guides }] = await Promise.all([
    supabase.from("jobs").select("id, name, itinerary_id, created_by").in("id", jobIds),
    supabase.from("users").select("id, first_name, last_name, email").in("id", guideIds),
  ]);

  const jobById = new Map((jobs ?? []).map((j) => [String(j.id), j]));
  const guideById = new Map((guides ?? []).map((g) => [String(g.id), g]));

  console.log(
    `\n${stuck.length} booking request(s) where the guide was never emailed:\n`
  );
  for (const row of stuck) {
    const job = jobById.get(String(row.job_id));
    const guide = row.applicant_id ? guideById.get(row.applicant_id) : null;
    const guideName =
      [guide?.first_name, guide?.last_name].filter(Boolean).join(" ").trim() || "(unknown guide)";
    const reason = row.price_confirmation_notify_error
      ? ` — last error: ${row.price_confirmation_notify_error}`
      : "";
    console.log(
      `  • ${job?.name ?? row.job_id}\n` +
        `    guide: ${guideName} <${guide?.email ?? "NO EMAIL ON FILE"}>\n` +
        `    requested: ${daysAgo(row.price_confirmation_requested_at)}${reason}\n` +
        `    itinerary: ${job?.itinerary_id ?? "—"}`
    );
  }

  const noEmail = stuck.filter((r) => !guideById.get(String(r.applicant_id))?.email);
  if (noEmail.length) {
    console.log(
      `\n${noEmail.length} of these have no email address on file — those guides must be ` +
        `reached in chat; re-sending will not help them.`
    );
  }

  const itineraries = [
    ...new Set(
      stuck
        .map((r) => jobById.get(String(r.job_id))?.itinerary_id)
        .filter((x): x is string => !!x)
    ),
  ];

  console.log(
    `\nTo recover: open each itinerary and tap "Resend" beside "Awaiting guide".\n` +
      itineraries.map((id) => `  ${APP_URL}/agent/edit-itinerary?id=${id}`).join("\n")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
