import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthCookieClearOptions } from "@/lib/auth-session-cookies";

export function applySecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-DNS-Prefetch-Control", "off");
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function nextWithSecurityHeaders(): NextResponse {
  const res = NextResponse.next();
  applySecurityHeaders(res.headers);
  return res;
}

export function jsonUnauthorized(): NextResponse {
  const res = NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  applySecurityHeaders(res.headers);
  clearAuthCookies(res);
  return res;
}

export function redirectWithClearedAuth(req: NextRequest, pathname: string): NextResponse {
  const url = req.nextUrl.clone();
  const fullPath = req.nextUrl.pathname + (req.nextUrl.search || "");
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("redirect", fullPath);
  const res = NextResponse.redirect(url);
  applySecurityHeaders(res.headers);
  clearAuthCookies(res);
  return res;
}

export function clearAuthCookies(res: NextResponse): void {
  const clearOpts = getAuthCookieClearOptions(process.env.NODE_ENV === "production");
  res.cookies.set("session", "", clearOpts);
  res.cookies.set("role", "", clearOpts);
  res.cookies.set("userId", "", clearOpts);
}

/**
 * API paths that may run without a signed session.
 *
 * This is an allow-list and middleware fails closed against it: anything not listed here needs
 * a valid session to reach its handler. It used to be advisory — middleware only rejected
 * callers whose cookies failed verification, so a request with *no* cookies bypassed the check
 * entirely and landed in the route. Any handler that had not written its own guard was then
 * reachable by anyone.
 *
 * Adding a path here makes it publicly reachable. The routes listed must either be genuinely
 * public (login, a shared guide profile) or carry their own credential — the cron routes below
 * require CRON_SECRET.
 */
export function isPublicApiPath(pathname: string, method: string): boolean {
  // Inbound integrations authenticate with a provider signature or their own secret.
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/google/callback")) return true;

  // Admin sign-in.
  if (pathname === "/api/admin" && method === "POST") return true;

  // Scheduled jobs — each verifies CRON_SECRET itself.
  if (pathname.startsWith("/api/jobs/release-notifications")) return true;
  if (pathname.startsWith("/api/jobs/no-applicant-alerts")) return true;
  if (pathname.startsWith("/api/jobs/sync-board-visibility")) return true;

  // Shareable guide profiles at /g/[slug] — intentionally readable logged out.
  if (pathname.startsWith("/api/public/")) return true;

  // Liveness probe; reports presence of config, never values.
  if (pathname.startsWith("/api/health")) return true;

  // Tells the client who it is — must have a session to answer.
  if (pathname === "/api/auth/me") return false;

  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/agent") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/forgot-password") ||
    pathname.startsWith("/api/auth/reset-password") ||
    pathname.startsWith("/api/auth/verify-reset-code") ||
    pathname.startsWith("/api/auth/verify") ||
    pathname.startsWith("/api/auth/resend") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/auth/callback/google") ||
    pathname.startsWith("/api/auth/guide-invite") ||
    pathname.startsWith("/api/auth/logout")
  ) {
    return true;
  }
  return false;
}

/** @deprecated Renamed to `isPublicApiPath` — the old name read as "open to everyone". */
export const isOpenApiPath = isPublicApiPath;

export function loginPathForPage(pathname: string): string {
  if (pathname.startsWith("/guide")) return "/guide/login";
  if (pathname.startsWith("/admin")) return "/admin/login";
  return "/agent/login";
}
