# Pagoda Travel — engineering guide

B2B travel marketplace connecting travel advisors/agencies with Japanese tour guides and
operators. Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase.

---

## The rule that matters most

**A fallback that returns a different result than the caller asked for is a bug, not
resilience.** If the system cannot do what was requested, it returns an error the user can
read. Every production incident in this repo so far has been this shape:

| Incident | The silent lie |
|---|---|
| `+` returned the old chat thread | `ensure-pair` fell back to `rows[0]` and reported `ok: true` |
| Confirmed bookings vanished from dashboards | `job_hiring_history` insert failed `23502`, was logged, booking still reported success |
| "Reminder sent to the guide" when it wasn't | `void sendEmail(...)` then `return { emailQueued: true }` |
| Advisor's message emailed the admin | impersonated session was treated as the advisor, never checked `impersonator_id` |

Before writing a fallback, ask: *does the caller find out?* If not, it is not a fallback.

Corollaries:

- `void somePromise()` is only for genuinely optional side effects, and the caller must
  **never report success on its behalf**. If the user is told it happened, `await` it.
- A destructured Supabase `error` that is never read is a review failure.
- Never widen a `catch` to hide a failure you have not diagnosed.

---

## Layout

```
app/{admin,agent,agency,guide}/…   five portals, each with its own login
app/api/…                          route handlers — thin
lib/…                              business logic, ~120 flat modules
components/…                       UI, grouped by feature
migrations/…                       dated .sql, run by hand on Supabase
scripts/…                          verification guards (node --experimental-strip-types)
docs/…                             product + incident docs
```

Routes stay thin: parse → authorize → delegate to `lib/` → respond. Logic that could be
tested without a request belongs in `lib/`.

**Before adding a helper, grep `lib/`.** There are ~120 modules and the one you need probably
exists. Known duplication to *not* widen: `app/agent/edit-itinerary/page.tsx` and
`app/agency/edit-itinerary/page.tsx` are near-identical and drift constantly — when you touch
one, check the other.

---

## Auth

```ts
import { requireSessionActor } from "@/lib/itinerary-access";

const session = await requireSessionActor();
if (!session.ok) return session.response;
const { userId, role, isAdmin } = session.actor;
```

- Never read the `userId` / `role` cookies directly in a new route — `requireSessionActor()`
  verifies the signed session and that the account is still active.
- **Impersonation** (admin overall-access) is read through `readImpersonation()` in
  `lib/admin-impersonation.ts`, never by hand. During impersonation the `role` cookie says
  `agent`/`guide` and only `impersonator_id` reveals the real actor — any code that decides
  *who did this* or *who to notify* must check it.
- Itinerary/job access: `assertItineraryAccess()` / `assertJobItineraryAccess()`.
- Chat access: `assertUserCanAccessChat()` in `lib/chat-access.ts`.

---

## Responses

Use `lib/api-response.ts` — do not hand-roll `NextResponse.json({ ok: false, … })`.

```ts
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/api-response";

return ok({ bookings });
return fail(409, "A thread for this client already exists.");
```

Most routes still hand-roll `NextResponse.json` — they predate this module. Migrate the ones
you touch; do not sweep files you have no other reason to open, since a mechanical rewrite of
a working route is risk with no user-visible benefit.

Shape is always `{ ok: true, ... }` or `{ ok: false, error }`. Never leak raw database text to
an end user — log it, and return something a travel advisor can act on. When the schema is
behind the code, say so explicitly, naming the migration:

```ts
return fail(500, "…If you are an admin, run migration 20260811_chat_messages_sender_allow_admin.sql.");
```

---

## Validation

Parse at the edge. Every route validates and narrows its body before use.

```ts
import { requireString, requireUuid, parseEnum } from "@/lib/validate";

const jobId = requireString(body.job_id, "job_id");
if (!jobId.ok) return fail(400, jobId.error);
```

- Money → `parseMoney` (`lib/advisor-markup.ts`)
- Percentages → `parseMarkupPct` (`lib/advisor-markup.ts`)
- Activity types → `canonicalizeActivityTypeLabel` (`lib/tour-activity-types.ts`)
- No `as any` on a request body. Ever.

---

## Logging

`lib/ops-log.ts` only — no bare `console.log` in new code.

```ts
import { bookingLog } from "@/lib/ops-log";

bookingLog.info("email.sent", { jobId, guideId, messageId });
bookingLog.error("finalize.hiring_history_insert_failed", err, { jobId });
```

- Tags: `PagodaBooking` · `PagodaChat` · `PagodaMail` · `PagodaTransfer` · `PagodaAuth`
- Step names are `noun.verb`: `message.stored`, `email.skip_cooldown`, `booking.saved`
- Structured data object, never string interpolation — these are grepped in Vercel logs during
  incidents.
- **Never log** full email addresses where an id will do, phone numbers, tokens, or session
  cookies.

---

## Pricing

One formula, one module: `lib/pagoda-pricing.ts`.

```
guide net (or advisor supplier price)
  → + commissionMarketplacePct   per-guide, admin-editable
  → + commissionAgentPct         per-guide, admin-editable
  = Pagoda price to advisor
  → + advisor markup %           line → itinerary → account → 15%
  = client display price
```

Commission percentages live in `guide_commission_settings` and are set at
`/admin/commission-settings`. They are read **live** on every price computation — changing a
guide's commission must move the Tour Library, itinerary lines, booking confirmation emails
and PDF together. Never hardcode a markup percentage; `DEFAULT_PAGODA_MARKUP_PCT` is a
last-resort fallback for guides with no settings row, not a business rule.

---

## Migrations

Hand-run against Supabase (see `migrations/README.md`). Therefore:

- Idempotent — `IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, guarded backfills.
- Dated filename: `YYYYMMDD_short_description.sql`.
- A header comment explaining **why**, including the failure it repairs.
  `20260827_backfill_job_hiring_history.sql` is the model.
- `COMMENT ON COLUMN` for anything non-obvious.
- Code that depends on a new column must degrade with a clear error, not a crash — production
  may not have run the migration yet.

---

## Verification

No test framework. Behaviour that cannot be unit-tested gets a **guard script** in `scripts/`,
wired into `package.json`:

```
npm run test:booking-confirm          confirm-booking flow invariants
npm run test:itinerary-support-chat   support chat routing
npm run test:chat-routing             thread creation + sender identity
npm run test:pricing                  Tour Library == itinerary line
```

Diagnostics (read-only, hit the database in `.env` — check which one that is first):

```
npm run report:stuck-bookings              requests whose guide was never emailed
npm run diagnose:transfer -- <itineraryId> why a transfer line renders blank
```

A guard asserts an invariant that has already broken once in production. Add one every time
you fix a silent failure. Before any deploy: `npx tsc --noEmit` && `npm run lint` && all guards.

---

## Style

- 2-space indent. Match the surrounding file for quotes and semicolons — `lib/` is double
  quotes + semicolons; some older `app/api/` routes are single quotes without.
- Named exports; no default exports outside Next.js pages/routes.
- `type` over `interface` for data shapes.
- Comments explain **why**, not what. A comment describing a workaround must name the
  condition that makes it necessary.
- Keep `app/api` handlers under ~200 lines; push the rest into `lib/`.
