/**
 * Request-body parsing at the edge.
 *
 * Route handlers hand-rolled these checks in ~40 different shapes, which is how
 * `job_id: undefined` reached a query and how an empty client name became a "new" chat
 * thread. Each helper narrows the type and returns a message the caller can send straight
 * back to the user.
 *
 * Pure — no Next.js or Supabase imports, so `scripts/` can exercise it directly.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parsedOk<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

function parsedFail<T>(error: string): Parsed<T> {
  return { ok: false, error };
}

/** Non-empty trimmed string. */
export function requireString(raw: unknown, field: string): Parsed<string> {
  if (typeof raw !== "string") {
    return parsedFail(`${field} is required`);
  }
  const value = raw.trim();
  if (!value) {
    return parsedFail(`${field} is required`);
  }
  return parsedOk(value);
}

/** Trimmed string, or null when absent/empty. Never returns an empty string. */
export function optionalString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID check. Postgres rejects a malformed uuid with `22P02`, which surfaces as a 500 —
 * catching it here turns that into a 400 the client can explain.
 */
export function requireUuid(raw: unknown, field: string): Parsed<string> {
  const str = requireString(raw, field);
  if (!str.ok) return str;
  if (!UUID_RE.test(str.value)) {
    return parsedFail(`${field} is not a valid id`);
  }
  return parsedOk(str.value);
}

/** Case-insensitive membership in a fixed set, normalised to the allowed spelling. */
export function parseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string,
  fallback?: T
): Parsed<T> {
  if (raw == null || raw === "") {
    if (fallback !== undefined) return parsedOk(fallback);
    return parsedFail(`${field} is required`);
  }
  const needle = String(raw).trim().toLowerCase();
  const match = allowed.find((a) => a.toLowerCase() === needle);
  if (!match) {
    return parsedFail(`Unsupported ${field}`);
  }
  return parsedOk(match);
}

/** Whole number within an inclusive range. */
export function requireInt(
  raw: unknown,
  field: string,
  opts: { min?: number; max?: number } = {}
): Parsed<number> {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return parsedFail(`${field} must be a whole number`);
  }
  if (opts.min != null && n < opts.min) {
    return parsedFail(`${field} must be at least ${opts.min}`);
  }
  if (opts.max != null && n > opts.max) {
    return parsedFail(`${field} must be at most ${opts.max}`);
  }
  return parsedOk(n);
}

/**
 * JSON body as a plain object. A malformed body is a 400, not a crash — matches the
 * `await req.json().catch(() => ({}))` idiom already used across `app/api`, but keeps the
 * distinction between "sent nothing" and "sent garbage".
 */
export async function parseJsonObject(
  req: { json: () => Promise<unknown> }
): Promise<Parsed<Record<string, unknown>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return parsedFail("Invalid JSON body");
  }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return parsedFail("Invalid JSON body");
  }
  return parsedOk(raw as Record<string, unknown>);
}
