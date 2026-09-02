/**
 * Shared guard for scheduled endpoints.
 *
 * These paths are in the public API allow-list so a scheduler can reach them without a user
 * session, which means the secret is the only thing standing in front of them. Two of them
 * previously guarded with `if (cronSecret && authHeader !== ...)` — the check disappeared when
 * CRON_SECRET was unset, which it was, and a third had no check at all while sending email to
 * guides. Missing configuration now closes the door instead of opening it.
 */

import { NextResponse } from "next/server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Returns a response to send back when the caller is not the scheduler, or null to proceed.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export function assertCronRequest(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    console.error(
      "[cron] CRON_SECRET is not configured — refusing to run a scheduled job. " +
        "Set CRON_SECRET in the environment and on the scheduler."
    );
    return NextResponse.json(
      { ok: false, error: "Scheduled jobs are not configured on this server." },
      { status: 503 }
    );
  }

  const header = req.headers.get("authorization") || "";
  if (!timingSafeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
