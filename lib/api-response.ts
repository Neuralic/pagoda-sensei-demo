/**
 * Uniform API route responses.
 *
 * Every handler answers `{ ok: true, ... }` or `{ ok: false, error }` — clients across all
 * five portals branch on `json.ok`, so a route that invents its own shape breaks them
 * silently. Raw database text never reaches an end user: log it, return something a travel
 * advisor can act on.
 */

import { NextResponse } from "next/server";

export type ApiOk<T> = { ok: true } & T;
export type ApiFail = { ok: false; error: string };

/** 200 with `{ ok: true, ...data }`. */
export function ok<T extends Record<string, unknown>>(
  data: T = {} as T,
  init?: ResponseInit
): NextResponse {
  return NextResponse.json({ ok: true, ...data }, init);
}

/**
 * Error response. `extra` carries machine-readable context (e.g. `retryAfterSeconds`)
 * — never put a raw DB message in `error`; pass it to a logger instead.
 */
export function fail(
  status: number,
  error: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function unauthorized(error = "Not authenticated"): NextResponse {
  return fail(401, error);
}

export function forbidden(error = "Forbidden"): NextResponse {
  return fail(403, error);
}

export function notFound(error = "Not found"): NextResponse {
  return fail(404, error);
}

export function badRequest(error: string, extra?: Record<string, unknown>): NextResponse {
  return fail(400, error, extra);
}

/**
 * The schema is behind the deployed code. Names the migration so whoever reads the toast can
 * fix it, instead of retrying a request that can never succeed.
 */
export function migrationRequired(migrationFile: string, what: string): NextResponse {
  return fail(
    409,
    `${what} Run migration ${migrationFile} on the database, then try again.`,
    { migrationRequired: migrationFile }
  );
}

/** Unexpected throw in a handler. The caller logs; the user gets something stable. */
export function serverError(error = "Server error"): NextResponse {
  return fail(500, error);
}

/**
 * True when a Postgres/PostgREST failure means "that column is not there yet" rather than
 * "your data is wrong". PostgREST answers PGRST204 from its cached schema and Postgres
 * answers 42703 directly; a stale cache reports the same thing in prose, so match that too.
 *
 * Used to turn the raw text John once saw in a toast — `column job_applications.x does not
 * exist` — into an instruction naming the migration that fixes it.
 */
export function isMissingColumnError(
  err: { code?: string | null; message?: string | null } | null | undefined,
  column?: string
): boolean {
  if (!err) return false;
  const code = err.code || "";
  const message = err.message || "";
  const shapeMatches =
    code === "PGRST204" ||
    code === "42703" ||
    /does not exist|schema cache/i.test(message);
  if (!shapeMatches) return false;
  return column ? message.includes(column) : true;
}
