import type { NextResponse } from 'next/server';
import { createSignedSessionToken } from '@/lib/auth-session-token';

type CookieSetOptions = NonNullable<Parameters<NextResponse['cookies']['set']>[2]>;

/**
 * Long-lived auth cookies for advisors/guides (not browser "session" cookies).
 * Chrome caps lifetime ~400 days; users stay signed in until logout or cookies are cleared.
 */
export const AUTH_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Shorter admin sessions — privileged accounts should not stay signed in for months. */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export function sessionMaxAgeForRole(role: string): number {
  return role === 'admin' ? ADMIN_SESSION_MAX_AGE_SECONDS : AUTH_SESSION_MAX_AGE_SECONDS;
}

export function getAuthSessionCookieOptions(
  isProduction: boolean,
  maxAgeSeconds: number = AUTH_SESSION_MAX_AGE_SECONDS
): CookieSetOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Expire auth cookies; use same `secure` as when they were set so removal works in production. */
export function getAuthCookieClearOptions(isProduction: boolean): CookieSetOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: new Date(0),
  };
}

export async function applyAuthSessionCookies(
  res: NextResponse,
  opts: {
    userId: string;
    role: string;
    isProduction: boolean;
  }
): Promise<void> {
  const maxAge = sessionMaxAgeForRole(opts.role);
  const token = await createSignedSessionToken({
    userId: opts.userId,
    role: opts.role,
    maxAgeSeconds: maxAge,
  });
  const cookieOpts = getAuthSessionCookieOptions(opts.isProduction, maxAge);
  res.cookies.set('session', token, cookieOpts);
  res.cookies.set('role', opts.role, cookieOpts);
  res.cookies.set('userId', opts.userId, cookieOpts);
}
