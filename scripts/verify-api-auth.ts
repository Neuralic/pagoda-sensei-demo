/**
 * Run: npm run test:api-auth
 *
 * Every API route must either be on the public allow-list or prove who is calling it.
 *
 * This was not true. Middleware looked like it protected the API but only rejected callers
 * whose cookies failed verification — a request with no cookies at all fell through to the
 * handler. Four routes had never written their own guard, and one of them served the user
 * table including bcrypt password hashes to anyone who asked.
 *
 * Middleware now fails closed, but this guard exists because that is one line in one file and
 * a route with no guard of its own is one edit away from being exposed again.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = join(repoRoot, "app", "api");

let failed = 0;

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error(`  ✗ ${name}`);
    failed += 1;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** URL path for a route file, with dynamic segments left as written. */
function urlPathFor(file: string): string {
  const rel = relative(join(repoRoot, "app"), dirname(file));
  return "/" + rel.split(sep).join("/");
}

/** Anything that establishes who is calling, or verifies a non-session credential. */
const GUARD_PATTERNS = [
  "requireSessionActor",
  "requireAdmin",
  "getSessionActor",
  "requireOperatorAccount",
  "requireTransferzAgent",
  "requireTransferzAdmin",
  "assertItineraryOwnedBySession",
  "assertCronRequest",
  "assertUserCanAccessChat",
  // Legacy cookie reads — weaker, but they do identify the caller.
  "cookies()",
];

/**
 * Routes that answer without a session, mirrored from isPublicApiPath in
 * lib/security-headers.ts. Adding a path here makes it reachable by anyone; it belongs here
 * only if it is genuinely public or carries its own credential.
 */
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/webhooks/",
  "/api/google/callback",
  "/api/public/",
  "/api/health",
  "/api/admin", // exact match only, handled below — admin sign-in
];

function isPublicRoute(urlPath: string): boolean {
  if (urlPath === "/api/admin") return true; // admin login
  if (urlPath === "/api/auth/me") return false;
  return PUBLIC_PREFIXES.some((p) => p !== "/api/admin" && urlPath.startsWith(p));
}

console.log("\n=== every API route identifies its caller ===\n");

const files = routeFiles(apiRoot);
const unguarded: string[] = [];

for (const file of files) {
  const urlPath = urlPathFor(file);
  if (isPublicRoute(urlPath)) continue;
  const src = readFileSync(file, "utf8");
  if (!GUARD_PATTERNS.some((p) => src.includes(p))) {
    unguarded.push(urlPath);
  }
}

assert(
  `all ${files.length} routes guarded or explicitly public` +
    (unguarded.length ? ` — unguarded: ${unguarded.join(", ")}` : ""),
  unguarded.length === 0
);

console.log("\n=== middleware fails closed ===\n");

const middleware = readFileSync(join(repoRoot, "middleware.ts"), "utf8");
/** Comments quote the old condition to explain the fix; only the code should be checked. */
const middlewareCode = middleware
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
assert(
  "a request with no session is rejected, not just one with bad cookies",
  middlewareCode.includes("!isPublicApiPath(pathname, method) && !sessionValid")
);
// Scoped to the API branch. The page branch legitimately uses the same condition to clear
// stale cookies before redirecting to login, which is correct there.
const apiBranch = middlewareCode.slice(
  middlewareCode.indexOf("pathname.startsWith('/api')"),
  middlewareCode.indexOf("PUBLIC ROUTES") === -1
    ? middlewareCode.indexOf("const publicRoutes")
    : middlewareCode.indexOf("const publicRoutes")
);
assert(
  "the API branch no longer gates on cookies being present",
  apiBranch.length > 0 && !apiBranch.includes("hasAuthCookies && !sessionValid")
);

console.log("\n=== scheduled jobs fail closed without a secret ===\n");

const vercelCronPaths: string[] = (
  JSON.parse(readFileSync(join(repoRoot, "vercel.json"), "utf8")).crons || []
).map((c: { path: string }) => c.path);
assert("vercel.json actually schedules something", vercelCronPaths.length > 0);

// The broadcast emails every guide on the platform, so one missing stamp is a mass send.
const releaseSrc = readFileSync(
  join(apiRoot, "jobs", "release-notifications", "route.ts"),
  "utf8"
);
assert(
  "the guide broadcast only picks up tours it has not already sent",
  releaseSrc.includes('.is("guides_notified_at", null)')
);
assert(
  "it stamps the tour after sending, so it cannot repeat every tick",
  releaseSrc.includes("guides_notified_at: new Date().toISOString()")
);
assert(
  "the 24-hour window is bounded at 24 hours, not 5 minutes",
  releaseSrc.includes('.lte("released_at", twentyFourHoursAgo.toISOString())')
);
assert(
  "a tour nobody could be emailed about is retried, not stamped",
  /if \(sent === 0\)[\s\S]{0,600}continue;/.test(releaseSrc)
);
assert(
  "guide email addresses are never written to the log",
  !/console\.(error|log|warn)/.test(releaseSrc) && !releaseSrc.includes("${guide.email}")
);

const cronAuth = readFileSync(join(repoRoot, "lib", "cron-auth.ts"), "utf8");
assert("missing CRON_SECRET refuses the request", cronAuth.includes("if (!secret)"));
assert("secret compared without early exit", cronAuth.includes("timingSafeEqual"));
for (const job of [
  "release-notifications",
  "no-applicant-alerts",
  "sync-board-visibility",
]) {
  const src = readFileSync(join(apiRoot, "jobs", job, "route.ts"), "utf8");
  assert(`${job} calls assertCronRequest`, src.includes("assertCronRequest"));
  assert(
    `${job} no longer skips the check when the secret is unset`,
    !src.includes("cronSecret && authHeader")
  );
  // Vercel Cron issues GET; a POST-only handler is simply never invoked.
  assert(
    `${job} answers the GET that the scheduler actually sends`,
    /export async function GET/.test(src)
  );
  assert(`${job} is scheduled in vercel.json`, vercelCronPaths.includes(`/api/jobs/${job}`));
}

console.log("\n=== credentials never leave the server ===\n");

const adminUsers = readFileSync(join(apiRoot, "admin", "user", "route.ts"), "utf8");
assert("admin user list strips credential fields", adminUsers.includes("stripCredentialFields"));
assert(
  "stripping happens where both query paths converge",
  adminUsers.includes("const safeUsers = users ? users.map")
);

console.log("\n=== storage signing is bounded ===\n");

const sign = readFileSync(join(apiRoot, "storage", "sign", "route.ts"), "utf8");
assert("requires a session", sign.includes("requireSessionActor"));
assert("restricts buckets", sign.includes("SIGNABLE_BUCKETS"));
assert("expiry is server-set", sign.includes("SIGNED_URL_TTL_SECONDS"));
assert("caller-supplied expiresIn is ignored", !sign.includes("it.expiresIn === \"number\""));
assert("rejects traversal paths", sign.includes("isSafeObjectPath"));

console.log("\n=== .env.example documents every variable the code reads ===\n");

const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const documented = new Set(
  [...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1])
);

function envNamesIn(dir: string): Set<string> {
  const names = new Set<string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        for (const m of readFileSync(full, "utf8").matchAll(/(?:process\.env|\benv)\.([A-Z0-9_]+)/g)) {
          names.add(m[1]);
        }
      }
    }
  };
  walk(dir);
  return names;
}

const read = new Set<string>();
for (const dir of ["app", "lib", "components", "hooks"]) {
  for (const name of envNamesIn(join(repoRoot, dir))) read.add(name);
}
read.delete("NODE_ENV"); // set by the runtime, not configured

const undocumented = [...read].filter((n) => !documented.has(n)).sort();
assert(
  `.env.example covers every variable the code reads${
    undocumented.length ? " — missing: " + undocumented.join(", ") : ""
  }`,
  undocumented.length === 0
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll checks passed\n");
