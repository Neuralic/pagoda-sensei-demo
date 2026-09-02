import type { NextResponse } from "next/server";
import {
  applyAuthSessionCookies,
  getAuthCookieClearOptions,
  getAuthSessionCookieOptions,
  sessionMaxAgeForRole,
} from "@/lib/auth-session-cookies";

/** Cookie names for admin → advisor/guide overall access (impersonation). */
export const IMPERSONATOR_ID_COOKIE = "impersonator_id";
export const IMPERSONATOR_SESSION_COOKIE = "impersonator_session";
export const IMPERSONATOR_ROLE_COOKIE = "impersonator_role";

type CookieJar = { get: (name: string) => { value: string } | undefined };

export type ImpersonationState = {
  active: true;
  adminId: string;
  targetUserId: string;
  targetRole: string;
};

export function readImpersonation(jar: CookieJar): ImpersonationState | null {
  const adminId = jar.get(IMPERSONATOR_ID_COOKIE)?.value;
  const targetUserId = jar.get("userId")?.value;
  const targetRole = jar.get("role")?.value;
  if (!adminId || !targetUserId || !targetRole) return null;
  // Must actually be in the target session — leftover impersonator_* cookies
  // while logged in as admin again are stale and must not count as active access.
  if (targetRole !== "agent" && targetRole !== "guide") return null;
  return {
    active: true,
    adminId,
    targetUserId,
    targetRole,
  };
}

/** True only while an admin session was swapped into an advisor/guide account. */
export function isImpersonating(jar: CookieJar): boolean {
  return readImpersonation(jar) != null;
}

export function clearImpersonationCookies(
  res: NextResponse,
  isProduction: boolean
): void {
  const clearOpts = getAuthCookieClearOptions(isProduction);
  res.cookies.set(IMPERSONATOR_ID_COOKIE, "", clearOpts);
  res.cookies.set(IMPERSONATOR_SESSION_COOKIE, "", clearOpts);
  res.cookies.set(IMPERSONATOR_ROLE_COOKIE, "", clearOpts);
}

export function setImpersonationBackupCookies(
  res: NextResponse,
  opts: {
    adminId: string;
    adminSession: string;
    isProduction: boolean;
  }
): void {
  const cookieOpts = getAuthSessionCookieOptions(opts.isProduction);
  res.cookies.set(IMPERSONATOR_ID_COOKIE, opts.adminId, cookieOpts);
  res.cookies.set(IMPERSONATOR_SESSION_COOKIE, opts.adminSession, cookieOpts);
  res.cookies.set(IMPERSONATOR_ROLE_COOKIE, "admin", cookieOpts);
}

export async function applyTargetSessionCookies(
  res: NextResponse,
  opts: {
    userId: string;
    role: "agent" | "guide";
    isProduction: boolean;
  }
): Promise<void> {
  await applyAuthSessionCookies(res, {
    userId: opts.userId,
    role: opts.role,
    isProduction: opts.isProduction,
  });
}

export function restoreAdminSessionCookies(
  res: NextResponse,
  opts: {
    adminId: string;
    adminSession: string;
    isProduction: boolean;
  }
): void {
  const cookieOpts = getAuthSessionCookieOptions(
    opts.isProduction,
    sessionMaxAgeForRole("admin")
  );
  res.cookies.set("session", opts.adminSession, cookieOpts);
  res.cookies.set("role", "admin", cookieOpts);
  res.cookies.set("userId", opts.adminId, cookieOpts);
  clearImpersonationCookies(res, opts.isProduction);
}
