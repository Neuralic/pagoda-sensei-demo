/**
 * Why does an airport-transfer line show no image and no price?
 *
 *   node --experimental-strip-types scripts/diagnose-transfer-line.ts <itineraryId>
 *   node --experimental-strip-types scripts/diagnose-transfer-line.ts --recent
 *
 * Transfer lines reach the itinerary through two unrelated renderers: rows in
 * `itinerary_transferz_bookings` (provider API, priced from the payload) and ordinary `jobs`
 * with an airport-transfer activity type (priced from a guide/supplier). They fail blank in
 * different ways, so the first question is always which one you are looking at.
 *
 * Read-only.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key);

const arg = process.argv[2];
if (!arg) {
  console.error(
    "Usage: diagnose-transfer-line.ts <itineraryId>\n" +
      "       diagnose-transfer-line.ts --recent   (scan the newest transfer bookings)"
  );
  process.exit(1);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Same fields lib/transferz/commission.ts needs to produce a price. */
function priceFields(payload: unknown): {
  ok: boolean;
  detail: string;
} {
  if (!isRecord(payload)) return { ok: false, detail: "payload is not an object" };
  const provider = payload.providerPrice;
  const price = payload.price;
  const commission = payload.platformCommissionAmount;
  const pct = payload.platformCommissionPct;
  const has = (v: unknown) => v != null && v !== "";

  if (!has(provider) && !has(price)) {
    return {
      ok: false,
      detail:
        "neither providerPrice nor price is set — transferzCommissionBreakdownFromPayload " +
        "returns null and the line renders with no amount at all",
    };
  }
  return {
    ok: true,
    detail:
      `providerPrice=${String(provider ?? "—")} price=${String(price ?? "—")} ` +
      `commission=${String(commission ?? "—")} pct=${String(pct ?? "—")}`,
  };
}

async function reportBookings(itineraryId: string | null) {
  let q = supabase
    .from("itinerary_transferz_bookings")
    .select("id, itinerary_id, title, activity_type, activity_date, payload")
    .order("created_at", { ascending: false });
  q = itineraryId ? q.eq("itinerary_id", itineraryId) : q.limit(10);

  const { data, error } = await q;
  if (error) {
    console.error("transferz booking query failed:", error.message);
    return;
  }
  const rows = data ?? [];
  console.log(`\n── Transferz bookings (${rows.length}) ──`);
  if (rows.length === 0) {
    console.log("  none — any transfer line on this itinerary is a plain job (see below)");
    return;
  }
  for (const row of rows) {
    const payload = row.payload;
    const price = priceFields(payload);
    const removed =
      isRecord(payload) && typeof payload.removedFromItineraryAt === "string";
    console.log(
      `\n  ${row.title}  [${row.activity_type}]  ${row.activity_date}\n` +
        `    id:        transferz-${row.id}\n` +
        `    itinerary: ${row.itinerary_id}\n` +
        `    image:     /assets/icons/airport_transfer.svg (constant — never from the payload)\n` +
        `    price:     ${price.ok ? "OK  " + price.detail : "MISSING — " + price.detail}` +
        (removed ? "\n    note:      soft-removed from the itinerary (admin invoicing only)" : "")
    );
  }
}

async function reportJobs(itineraryId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, name, activity_type, images, tour_id, supplier_price, min_price")
    .eq("itinerary_id", itineraryId);

  if (error) {
    console.error("jobs query failed:", error.message);
    return;
  }
  const transferJobs = (data ?? []).filter((j) =>
    /transfer/i.test(String(j.activity_type || ""))
  );
  console.log(`\n── Transfer-type jobs (${transferJobs.length}) ──`);
  if (transferJobs.length === 0) {
    console.log("  none");
    return;
  }
  for (const job of transferJobs) {
    const images = Array.isArray(job.images) ? job.images : [];
    console.log(
      `\n  ${job.name}  [${job.activity_type}]\n` +
        `    id:        ${job.id}\n` +
        `    images:    ${images.length ? images.join(", ") : "NONE — resolveActivityListImage returns \"\" and the row falls back to placeholder.svg"}\n` +
        `    tour_id:   ${job.tour_id ?? "— (no library tour, so no guide net)"}\n` +
        `    supplier:  ${job.supplier_price ?? "—"}   min_price: ${job.min_price ?? "—"}`
    );
  }
}

async function main() {
  if (arg === "--recent") {
    await reportBookings(null);
    return;
  }
  console.log(`\nItinerary ${arg}`);
  await reportBookings(arg);
  await reportJobs(arg);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
