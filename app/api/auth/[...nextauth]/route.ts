// Social auth via NextAuth is currently disabled in this project.
// This stub prevents build errors by avoiding imports from 'next-auth'.
// IMPORTANT: This catch-all route should only match routes that don't have specific handlers.
// Routes like /api/auth/google and /api/auth/google/callback should be handled by their specific route files.
// In Next.js App Router, more specific routes take precedence over catch-all routes.

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  
  // Handle NextAuth-style callback URLs by redirecting to our Google OAuth callback
  if (pathname === '/api/auth/callback/google') {
    const searchParams = req.nextUrl.searchParams.toString()
    const redirectUrl = `/api/auth/google/callback${searchParams ? `?${searchParams}` : ''}`
    return NextResponse.redirect(new URL(redirectUrl, req.url))
  }
  
  // Log for debugging - this should only be hit for unknown /api/auth/* routes
  console.warn(`[NextAuth] Catch-all route hit for: ${pathname}. This route is disabled.`)
  
  // List of known routes that should have their own handlers
  const knownRoutes = [
    '/api/auth/google',
    '/api/auth/google/callback',
    '/api/auth/callback/google', // NextAuth-style callback (handled above)
    '/api/auth/google-meet',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/agent',
    '/api/auth/register',
    '/api/auth/verify',
    '/api/auth/resend',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-reset-code',
  ]
  
  // If this is a known route, something is wrong with routing
  if (knownRoutes.some(route => pathname.startsWith(route))) {
    console.error(`[NextAuth] Known route ${pathname} hit catch-all. This indicates a routing issue.`)
    return NextResponse.json(
      { 
        error: 'Routing error: This route should be handled by a specific handler',
        pathname,
        hint: 'Check that the specific route file exists and is properly configured'
      }, 
      { status: 500 }
    )
  }

  return NextResponse.json(
    { error: 'NextAuth route disabled', pathname },
    { status: 404 }
  )
}

export async function POST(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  
  // Handle NextAuth-style callback URLs by redirecting to our Google OAuth callback
  if (pathname === '/api/auth/callback/google') {
    const searchParams = req.nextUrl.searchParams.toString()
    const redirectUrl = `/api/auth/google/callback${searchParams ? `?${searchParams}` : ''}`
    return NextResponse.redirect(new URL(redirectUrl, req.url))
  }
  
  // Log for debugging
  console.warn(`[NextAuth] Catch-all POST route hit for: ${pathname}. This route is disabled.`)
  
  // List of known routes that should have their own handlers
  const knownRoutes = [
    '/api/auth/google',
    '/api/auth/google/callback',
    '/api/auth/callback/google', // NextAuth-style callback (handled above)
    '/api/auth/google-meet',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/agent',
    '/api/auth/register',
    '/api/auth/verify',
    '/api/auth/resend',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-reset-code',
  ]
  
  // If this is a known route, something is wrong with routing
  if (knownRoutes.some(route => pathname.startsWith(route))) {
    console.error(`[NextAuth] Known route ${pathname} hit catch-all. This indicates a routing issue.`)
    return NextResponse.json(
      { 
        error: 'Routing error: This route should be handled by a specific handler',
        pathname,
        hint: 'Check that the specific route file exists and is properly configured'
      }, 
      { status: 500 }
    )
  }

  return NextResponse.json(
    { error: 'NextAuth route disabled', pathname },
    { status: 404 }
  )
}
