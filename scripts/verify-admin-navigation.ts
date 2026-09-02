/**
 * Run: npm run test:admin-nav
 *
 * Every admin page must render AdminLayout, because HeaderWrapper deliberately suppresses the
 * advisor header on /admin/* — the sidebar is the only navigation those pages have.
 *
 * /admin/itineraries/[id]/edit was missing it. Chat notification emails link straight there,
 * so an admin could open a message, reply, and then have no way back to any admin screen.
 * Production logs for 27 Aug 2026 show the page opened from an email at 19:22 and the next
 * admin screen reached only at 20:08, by re-opening the same email.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminRoot = join(repoRoot, "app", "admin");

let failed = 0;
function assert(name: string, cond: boolean) {
  if (!cond) { console.error(`  ✗ ${name}`); failed += 1; }
  else console.log(`  ✓ ${name}`);
}

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/** Login is the one admin screen with no sidebar, by design. */
const EXEMPT = new Set(["login"]);

console.log("\n=== every admin page has navigation ===\n");

const missing: string[] = [];
for (const file of pageFiles(adminRoot)) {
  const route = relative(adminRoot, dirname(file)).split(sep).join("/");
  if (EXEMPT.has(route)) continue;
  if (!readFileSync(file, "utf8").includes("AdminLayout")) missing.push("/admin/" + route);
}
assert(
  `all admin pages render AdminLayout${missing.length ? " — missing: " + missing.join(", ") : ""}`,
  missing.length === 0
);

const wrapper = readFileSync(join(repoRoot, "components", "shared", "HeaderWrapper.tsx"), "utf8");
assert(
  "HeaderWrapper still suppresses the advisor header on /admin (so the sidebar is required)",
  wrapper.includes("isAdminApp")
);

if (failed > 0) { console.error(`\n${failed} check(s) failed\n`); process.exit(1); }
console.log("\nAll checks passed\n");
