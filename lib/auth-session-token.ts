/**
 * Signed session cookie (HMAC-SHA256).
 * Binds userId + role so cookies cannot be swapped independently.
 */

export type SessionRole = "agent" | "guide" | "admin" | "agency";

export type VerifiedSession = {
  userId: string;
  role: string;
  sid: string;
  iat: number;
  exp: number;
};

const TOKEN_PREFIX = "v1.";

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

function encoder() {
  return new TextEncoder();
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function getSessionSigningSecret(): string | null {
  const secret =
    process.env.AUTH_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  return secret || null;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSignedSessionToken(opts: {
  userId: string;
  role: string;
  maxAgeSeconds: number;
}): Promise<string> {
  const secret = getSessionSigningSecret();
  if (!secret) {
    throw new Error("Session signing secret is not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    u: opts.userId,
    r: opts.role,
    s: crypto.randomUUID(),
    i: now,
    e: now + opts.maxAgeSeconds,
  };
  const body = toBase64Url(encoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256Base64Url(secret, body);
  return `${TOKEN_PREFIX}${body}.${sig}`;
}

export async function verifySignedSessionToken(
  token: string | undefined | null
): Promise<VerifiedSession | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const secret = getSessionSigningSecret();
  if (!secret) return null;

  const raw = token.slice(TOKEN_PREFIX.length);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = await hmacSha256Base64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;

  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  let parsed: { v?: number; u?: string; r?: string; s?: string; i?: number; e?: number };
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (parsed.v !== 1) return null;
  if (!parsed.u || !parsed.r || !parsed.s) return null;
  if (typeof parsed.e !== "number" || parsed.e * 1000 < Date.now()) return null;

  return {
    userId: parsed.u,
    role: parsed.r,
    sid: parsed.s,
    iat: typeof parsed.i === "number" ? parsed.i : 0,
    exp: parsed.e,
  };
}

/** Require a signed session whose payload matches the userId + role cookies. */
export async function readVerifiedSessionCookies(
  jar: CookieReader
): Promise<VerifiedSession | null> {
  const token = jar.get("session")?.value;
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (!token || !userId || !role) return null;
  const verified = await verifySignedSessionToken(token);
  if (!verified) return null;
  if (verified.userId !== userId || verified.role !== role) return null;
  return verified;
}

export function hasAnyAuthCookie(jar: CookieReader): boolean {
  return Boolean(jar.get("session")?.value || jar.get("userId")?.value || jar.get("role")?.value);
}
