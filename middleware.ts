import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { homePathForRole, isLoginPath } from '@/lib/auth-home';
import {
  isAdvisorRole,
  normalizeConversationPathForRole,
} from '@/lib/conversation-portal';
import { authLog } from '@/lib/ops-log';
import {
  hasAnyAuthCookie,
  readVerifiedSessionCookies,
} from '@/lib/auth-session-token';
import {
  applySecurityHeaders,
  isPublicApiPath,
  jsonUnauthorized,
  loginPathForPage,
  nextWithSecurityHeaders,
  redirectWithClearedAuth,
} from '@/lib/security-headers';

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const { pathname } = url;
  const method = req.method;
  const verified = await readVerifiedSessionCookies(req.cookies);
  const role = verified?.role ?? req.cookies.get('role')?.value;
  const hasAuthCookies = hasAnyAuthCookie(req.cookies);
  const sessionValid = Boolean(verified);

  // ================== API: require a signed session unless the path is public ==================
  // Fails closed. The previous form only rejected callers whose cookies failed verification
  // (`hasAuthCookies && !sessionValid`), so a request with no cookies at all fell through to
  // the handler — which left every route that had not written its own guard reachable by
  // anyone. `hasAuthCookies` now only distinguishes "expired/forged, clear them" from
  // "never signed in".
  if (pathname.startsWith('/api')) {
    if (!isPublicApiPath(pathname, method) && !sessionValid) {
      if (hasAuthCookies) {
        authLog.info('api.session_invalid', { path: pathname, method });
      }
      return jsonUnauthorized();
    }
    return nextWithSecurityHeaders();
  }

  // ================== PUBLIC ROUTES (No authentication required) ==================
  const publicRoutes = [
    '/auth',
    '/terms',
    '/agent/login',
    '/agent/sensei',
    '/guide/login',
    '/admin/login',
    '/g/',
    '/_next',
    '/favicon.ico',
  ];

  if (hasAuthCookies && !sessionValid && !isLoginPath(pathname)) {
    return redirectWithClearedAuth(req, loginPathForPage(pathname));
  }

  // Still signed in → never show a login page (browser Back from dashboard/itinerary)
  if (sessionValid && role && isLoginPath(pathname)) {
    const redirectTarget = url.searchParams.get('redirect');
    const safeRedirect =
      redirectTarget &&
      redirectTarget.startsWith('/') &&
      !redirectTarget.startsWith('//')
        ? redirectTarget
        : null;
    if (safeRedirect) {
      const parsed = new URL(safeRedirect, req.url);
      url.pathname = parsed.pathname;
      url.search = parsed.search;
      authLog.info('login.skip_already_authed', { role, redirect: safeRedirect });
    } else {
      url.pathname = homePathForRole(role);
      url.search = '';
    }
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res.headers);
    return res;
  }

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  if (isPublicRoute) {
    return nextWithSecurityHeaders();
  }

  // ================== LEGACY PROFILE URLS ==================
  // /profile/{id} redirects to /g/{slug}; keep auth required for the redirect handler.
  if (pathname.startsWith('/profile/') && pathname !== '/profile') {
    if (!sessionValid) {
      url.pathname = '/agent/login';
      url.search = '';
      url.searchParams.set('redirect', pathname + (req.nextUrl.search || ''));
      const res = NextResponse.redirect(url);
      applySecurityHeaders(res.headers);
      return res;
    }
    return nextWithSecurityHeaders();
  }

  // ================== AUTHENTICATION CHECK (All other routes) ==================
  if (!sessionValid) {
    const fullPath = pathname + (req.nextUrl.search || '');
    if (pathname.startsWith('/agent') || pathname.startsWith('/agency')) {
      url.pathname = '/agent/login';
      url.search = '';
      url.searchParams.set('redirect', fullPath);
    } else if (pathname.startsWith('/guide')) {
      url.pathname = '/guide/login';
      url.search = '';
      url.searchParams.set('redirect', fullPath);
    } else if (pathname.startsWith('/admin')) {
      url.pathname = '/admin/login';
      url.search = '';
      url.searchParams.set('redirect', fullPath);
    } else {
      url.pathname = '/agent/login';
      url.search = '';
      url.searchParams.set('redirect', fullPath);
    }
    if (fullPath.includes('/conversation')) {
      authLog.info('auth.redirect_login', { path: fullPath, login: url.pathname });
    }
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res.headers);
    return res;
  }

  // Deep-link: open the inbox path that matches the signed-in role (?chatId= preserved).
  const conversationFix = normalizeConversationPathForRole(
    pathname,
    req.nextUrl.search || '',
    role
  );
  if (conversationFix) {
    const target = new URL(conversationFix, req.url);
    authLog.info('auth.conversation_portal_rewrite', {
      from: pathname + (req.nextUrl.search || ''),
      to: conversationFix,
      role,
    });
    const res = NextResponse.redirect(target);
    applySecurityHeaders(res.headers);
    return res;
  }

  // ================== ROLE-BASED ACCESS CONTROL ==================
  
  // Advisor routes (agent + agency accounts)
  if (pathname.startsWith('/agent') || pathname.startsWith('/agency')) {
    if (!isAdvisorRole(role) && role !== 'admin') {
      if (role === 'guide') {
        url.pathname = '/guide/landing';
      } else if (role === 'admin') {
        url.pathname = '/admin/dashboard';
      } else {
        url.pathname = '/agent/login';
      }
      const res = NextResponse.redirect(url);
      applySecurityHeaders(res.headers);
      return res;
    }
  }

  // Public shareable guide profiles (no login)
  if (pathname.startsWith('/g/')) {
    return nextWithSecurityHeaders();
  }

  // Agency account on /agent/* → equivalent /agency/* path (e.g. email links).
  if (role === 'agency' && pathname.startsWith('/agent/')) {
    url.pathname = pathname.replace(/^\/agent/, '/agency');
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res.headers);
    return res;
  }
  if (role === 'agent' && pathname.startsWith('/agency/')) {
    url.pathname = pathname.replace(/^\/agency/, '/agent');
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res.headers);
    return res;
  }

  // Guide-only routes (admins stay on /admin/* — no guide login)
  if (pathname.startsWith('/guide')) {
    if (role !== 'guide') {
      const fullGuidePath = pathname + (req.nextUrl.search || '');
      // Deep link from booking email — send to guide login with return URL preserved
      if (pathname.startsWith('/guide/confirm-booking')) {
        url.pathname = '/guide/login';
        url.search = '';
        url.searchParams.set('redirect', fullGuidePath);
        const res = NextResponse.redirect(url);
        applySecurityHeaders(res.headers);
        return res;
      }
      if (role === 'agent') {
        url.pathname = '/agent/itineraries';
      } else if (role === 'agency') {
        url.pathname = '/agency/itineraries';
      } else if (role === 'admin') {
        url.pathname = '/admin/dashboard';
      } else {
        url.pathname = '/guide/login';
      }
      const res = NextResponse.redirect(url);
      applySecurityHeaders(res.headers);
      return res;
    }
  }

  // Admin-only routes
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      url.pathname = '/admin/login';
      const res = NextResponse.redirect(url);
      applySecurityHeaders(res.headers);
      return res;
    }
  }

  // ================== PROTECTED ROUTES (Require authentication, both roles can access) ==================
  // /profile (no id) redirects to /settings for guides.
  if (pathname === '/settings' || pathname === '/profile') {
    return nextWithSecurityHeaders();
  }

  return nextWithSecurityHeaders();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     *
     * The extension list must cover every image format actually served: .avif was missing,
     * so an AVIF in /public was treated as a page, hit the auth check and 307'd to login.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
