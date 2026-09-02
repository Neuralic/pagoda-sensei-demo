/**
 * Run: npm run test:fx-rate
 *
 * Frankfurter (ECB) USD/JPY + 3% FX buffer for advisor USD estimates beside JPY.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  convertJpyToUsdWithBuffer,
  DEFAULT_FX_PROTECTION_PCT,
  formatUsdAmount,
  parseFrankfurterUsdJpy,
  roundUsd,
} from "../lib/fx-rate.ts";

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
  if (actual !== expected) {
    console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  }
  assert(name, actual === expected);
}

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

console.log("\n=== Frankfurter parse ===\n");

const sample = parseFrankfurterUsdJpy({
  amount: 1,
  base: "USD",
  date: "2026-09-01",
  rates: { JPY: 150 },
});
assert(sample != null, "parses Frankfurter USD/JPY body");
assertEqual("jpy per usd", sample?.jpyPerUsd, 150);
assertEqual("rate date", sample?.rateDate, "2026-09-01");

console.log("\n=== conversion formula (John example) ===\n");

const john = convertJpyToUsdWithBuffer(100_000, 150, 3);
assertEqual("usd base", roundUsd(john.usdBase), 666.67);
assertEqual("usd final with 3%", john.usdFinal, 686.67);

console.log("\n=== display formatting ===\n");

assertEqual("usd format", formatUsdAmount(686.67), "686.67");
assertEqual("default buffer", DEFAULT_FX_PROTECTION_PCT, 3);

console.log("\n=== wiring ===\n");

const fxRoute = read("app/api/fx/usd-jpy/route.ts");
assert("advisor fx route uses Frankfurter helper", fxRoute.includes("fetchFrankfurterUsdJpyQuote"));
assert("advisor fx route uses generic hint", fxRoute.includes("fxRateAdvisorHint"));

const adminRoute = read("app/api/admin/fx-settings/route.ts");
assert("admin can read fx settings", adminRoute.includes("getFxProtectionPct"));
assert("admin can save fx settings", adminRoute.includes("setFxProtectionPct"));

assert(
  "itinerary row shows jpy + usd label",
  read("components/itineraries/activity-list-item.tsx").includes("JpyUsdPriceLabel")
);

const migration = read("migrations/20260902_fx_protection_pct.sql");
assert("migration seeds fx_protection_pct", migration.includes("'fx_protection_pct'"));

console.log(failed === 0 ? "\nAll checks passed\n" : `\n${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
