/**
 * Run: npm run test:pricing
 *
 * The Tour Library and the itinerary line must quote the same advisor the same number for the
 * same tour. They did not: the library derived prices from each guide's
 * `guide_commission_settings`, the itinerary used a hardcoded 20% Pagoda markup, and raising a
 * partner's commission in admin moved one and not the other — every booking through that line
 * was invoiced at the old margin.
 *
 * These checks pin the arithmetic identity the fix depends on, then verify the app actually
 * routes through it. `lib/pagoda-pricing.ts` uses `@/` imports, which node cannot resolve when
 * stripping types, so the numeric half re-derives the formula from the dependency-free
 * primitives it is built on (same precedent as scripts/verify-recent-fixes.ts).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getAgentDisplayTotalRounded,
  parseCommissionSettings,
} from "../lib/tour-price.ts";

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

/** Mirrors priceLineForCommission: compound exactly, round once. */
function itineraryLinePrice(net: number, marketplacePct: number, agentPct: number): number {
  const baseExact = net + (net * marketplacePct) / 100;
  return agentPct <= 0
    ? Math.round(baseExact)
    : Math.round(baseExact * (1 + agentPct / 100));
}

console.log("\n=== library price === itinerary line price ===\n");

// An advisor who has set no markup override must see the tour's "From" price unchanged when
// that tour lands on an itinerary. This only holds because the markup falls back to the
// guide's own commissionAgentPct rather than a hardcoded 15.
const cases: Array<{ net: number; marketplace: number; agent: number }> = [
  { net: 100_000, marketplace: 25, agent: 15 },
  { net: 100_000, marketplace: 40, agent: 15 }, // John raises a good partner's commission
  { net: 33_333, marketplace: 25, agent: 15 }, // rounding stress
  { net: 7_777, marketplace: 12.5, agent: 7.5 }, // fractional percentages
  { net: 0, marketplace: 25, agent: 15 }, // free service — guide price 0 is allowed
  { net: 250_000, marketplace: 25, agent: 0 }, // advisor takes no margin
];

for (const c of cases) {
  const commission = parseCommissionSettings({
    commission_marketplace_pct: c.marketplace,
    commission_agent_pct: c.agent,
  });
  const library = getAgentDisplayTotalRounded(
    c.net,
    commission.commissionMarketplacePct,
    commission.commissionAgentPct,
    commission.vatRatePct
  );
  const line = itineraryLinePrice(
    c.net,
    commission.commissionMarketplacePct,
    commission.commissionAgentPct
  );
  assertEqual(
    `net ¥${c.net.toLocaleString()} @ ${c.marketplace}%/${c.agent}% → library ¥${library.toLocaleString()}`,
    line,
    library
  );
}

console.log("\n=== raising a commission raises the price ===\n");

const low = parseCommissionSettings({ commission_marketplace_pct: 25, commission_agent_pct: 15 });
const high = parseCommissionSettings({ commission_marketplace_pct: 40, commission_agent_pct: 15 });
const netForPartner = 100_000;
const atLow = itineraryLinePrice(netForPartner, low.commissionMarketplacePct, low.commissionAgentPct);
const atHigh = itineraryLinePrice(netForPartner, high.commissionMarketplacePct, high.commissionAgentPct);
assert("40% marketplace prices above 25%", atHigh > atLow);
assertEqual("25% of ¥100,000 net → ¥143,750 client", atLow, 143_750);
assertEqual("40% of ¥100,000 net → ¥161,000 client", atHigh, 161_000);

console.log("\n=== one tour, one sales price ===\n");

/** Mirrors advisorCommissionPctForLine: the commission settings decide, nothing else. */
function salesPrice(net: number, marketplacePct: number, agentPct: number): number {
  return Math.round(net * (1 + marketplacePct / 100) * (1 + agentPct / 100));
}

// Confirmed with the client 30 Aug 2026: the sales price is guide net + marketplace% +
// agent%, and the agent commission is Pagoda's commission to the advisor (split with the host
// agency outside the platform), not a margin the advisor sets. Two reports came from advisors
// moving it: a tour quoted ¥14,375 reaching the client at ¥14,910, and a ¥43,120 tour showing
// ¥51,744 because a markup of 0 had removed the commission entirely.
assertEqual("¥10,000 @ 25%/15% → ¥14,375", salesPrice(10_000, 25, 15), 14_375);
assertEqual("¥43,120 @ 20%/15% → ¥59,506", salesPrice(43_120, 20, 15), 59_506);

const pricingModule = read("lib/pagoda-pricing.ts");
assert(
  "the advisor commission comes from the commission settings alone",
  /export function advisorCommissionPctForLine\(commission: CommissionSettings\): number \{\s*return commission\.commissionAgentPct;/.test(
    pricingModule
  )
);
assert(
  "no markup field can reach the price calculation",
  !/parseMarkupPct\(opts\.(lineMarkupPct|itineraryMarkupPct|accountDefaultMarkupPct|previewItineraryMarkupPct)\)/.test(
    pricingModule
  )
);
assert(
  "changing a guide's commission still moves the price",
  salesPrice(10_000, 40, 15) > salesPrice(10_000, 25, 15)
);

console.log("\n=== costs paid on the client's behalf carry no commission ===\n");

/** Mirrors priceLineForCommission with a pass-through amount. */
function withPassThrough(net: number, marketplacePct: number, agentPct: number, carried: number) {
  const baseExact = net * (1 + marketplacePct / 100);
  const base = Math.round(baseExact) + carried;
  const client = Math.round(baseExact * (1 + agentPct / 100)) + carried;
  return { base, client, commission: client - base };
}

// Eriko's case: her price is the booking fee, the tickets are bought for the client. Charging
// commission on the fare would add ¥19,145 to a ¥76,580 ticket and put the client well above
// the price printed on it.
{
  const fee = 3_000;
  const tickets = 76_580;
  const r = withPassThrough(fee, 25, 15, tickets);
  assertEqual("¥3,000 fee + ¥76,580 tickets → client ¥80,893", r.client, 80_893);
  assertEqual("Pagoda price to advisor ¥80,330", r.base, 80_330);
  assertEqual("advisor commission is 15% of the fee only (¥563)", r.commission, 563);

  const naive = salesPrice(fee + tickets, 25, 15);
  assert(
    `folding tickets into the fee would have charged ¥${(naive - r.client).toLocaleString()} more`,
    naive - r.client === 33_503
  );
  assert("the client never pays less than the ticket cost", r.client > tickets);
}

// No pass-through: unchanged from before.
assertEqual(
  "a line with no carried cost prices exactly as before",
  withPassThrough(10_000, 25, 15, 0).client,
  14_375
);

const pricingSrc2 = read("lib/pagoda-pricing.ts");
assert(
  "the carried cost is added after the commission, not inside it",
  /Math\.round\(baseExact \* \(1 \+ markupPct \/ 100\)\) \+ carried/.test(pricingSrc2)
);
assert(
  "it never enters the commission base",
  !/pagodaPriceToAdvisorExact\([^)]*passThrough/.test(pricingSrc2)
);

console.log("\n=== the guide can enter a carried cost, and it stays separate ===\n");

const modal = read("components/itineraries/confirm-booking-price-modal.tsx");
assert("the modal has a separate field for tickets and fees", modal.includes("pass_through_cost"));
assert(
  // JSX wraps prose across lines, so match on collapsed whitespace.
  "it tells the guide no commission is taken on them",
  /no commission on these/.test(modal.replace(/\s+/g, " "))
);
assert(
  "it shows the total she will invoice",
  modal.includes("You will invoice Pagoda")
);

const confirmRoute2 = read("app/api/jobs/confirm-booking-price/route.ts");
assert("the route accepts and validates it", confirmRoute2.includes("pass_through_cost"));
assert(
  "it is stored on the application, not folded into guide_price",
  /guide_price: confirmedPrice,[\s\S]{0,200}pass_through_cost: passThroughCost/.test(confirmRoute2)
);

const notify = read("lib/booking-confirmed-notifications.ts");
assert(
  "Pagoda's commission is measured on the service only",
  notify.includes("pagodaToAdvisor - confirmedPrice - (priced.passThroughCost || 0)")
);
assert(
  "the guide invoices her fee plus what she laid out",
  notify.includes("const guideInvoiceTotal = confirmedPrice + carried;")
);

assert(
  "a missing pass_through column blocks the booking instead of dropping the amount",
  /isMissingColumnError\([\s\S]{0,400}?migrationRequired\([\s\S]{0,80}?"20260831_job_application_pass_through_cost\.sql"/.test(
    confirmRoute2
  )
);
assert(
  "the raw database message is never returned to the guide",
  !/error: finalized\.error/.test(confirmRoute2)
);
assert(
  // job_applications(*) — so an unmigrated database simply has no such field.
  "the itinerary read path degrades when the column is absent",
  read("app/api/jobs/route.ts").includes("job_applications(*)")
);

console.log("\n=== adding a tour does not change its price ===\n");

// Reported 28 Aug 2026: a transfer quoted at ¥13,800 in the add-to-itinerary panel appeared
// on the itinerary "a few hundred more". The panel prices from the tour (assigned guide, else
// owner); the line had started pricing from the booked guide, so committing a guide on
// different commission terms moved a number the advisor had already been quoted.
{
  const net = 10_000;
  const tourOwner = parseCommissionSettings({
    commission_marketplace_pct: 20,
    commission_agent_pct: 15,
  });
  const bookedGuide = parseCommissionSettings({
    commission_marketplace_pct: 25,
    commission_agent_pct: 15,
  });
  const catalogPrice = getAgentDisplayTotalRounded(
    net,
    tourOwner.commissionMarketplacePct,
    tourOwner.commissionAgentPct,
    tourOwner.vatRatePct
  );
  assertEqual("catalog quotes ¥13,800", catalogPrice, 13_800);
  assertEqual(
    "the itinerary line quotes the same, whoever is booked",
    itineraryLinePrice(net, tourOwner.commissionMarketplacePct, tourOwner.commissionAgentPct),
    catalogPrice
  );
  assert(
    "pricing from the booked guide instead would have moved it",
    itineraryLinePrice(
      net,
      bookedGuide.commissionMarketplacePct,
      bookedGuide.commissionAgentPct
    ) !== catalogPrice
  );
}

console.log("\n=== the hardcoded markup is gone from priced paths ===\n");

const priced: Array<[string, string]> = [
  ["app/api/jobs/route.ts", "itinerary line prices"],
  ["lib/booking-confirmed-notifications.ts", "confirmation email prices"],
];

for (const [relPath, what] of priced) {
  const src = read(relPath);
  assert(`${relPath}: ${what} come from lib/pagoda-pricing`, src.includes("@/lib/pagoda-pricing"));
  assert(
    `${relPath}: no hardcoded DEFAULT_PAGODA_MARKUP_PCT`,
    !src.includes("DEFAULT_PAGODA_MARKUP_PCT")
  );
}

console.log("\n=== commissions are read live, per guide ===\n");

const pricing = read("lib/pagoda-pricing.ts");
assert(
  "the sales price reads the guide's agent commission",
  pricing.includes("commission.commissionAgentPct")
);
assert(
  "commission settings are batch-loaded, not fetched per line",
  pricing.includes("loadJobCommissionLookup") &&
    pricing.includes("loadGuideCommissionSettingsByUserIds")
);
assert(
  "a tour-linked line prices from the tour, so it matches the catalog quote",
  /if \(tourId \|\| tourOwner\) \{[\s\S]{0,200}resolveCommissionUserIdForTour/.test(pricing)
);
assert(
  "the booked guide's commission is used only when there is no tour to quote from",
  pricing.indexOf("resolveCommissionUserIdForTour(tourId, tourOwner") <
    pricing.indexOf("return bookedGuide || null")
);

const advisorMarkup = read("lib/advisor-markup.ts");
assert(
  "DEFAULT_PAGODA_MARKUP_PCT is documented as a fallback, not a rule",
  /fallback/i.test(
    advisorMarkup.slice(
      Math.max(0, advisorMarkup.indexOf("DEFAULT_PAGODA_MARKUP_PCT") - 400),
      advisorMarkup.indexOf("DEFAULT_PAGODA_MARKUP_PCT") + 120
    )
  )
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll checks passed\n");
