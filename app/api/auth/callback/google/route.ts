// Redirect NextAuth-style callback URL to our Google OAuth callback
// This handles cases where Google or other services redirect to /api/auth/callback/google
// instead of /api/auth/google/callback

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  
  // Preserve all query parameters (especially the 'code' parameter from Google)
  const searchParams = url.searchParams.toString()
  const redirectUrl = `/api/auth/google/callback${searchParams ? `?${searchParams}` : ''}`
  
  // Redirect to the correct callback route
  return NextResponse.redirect(new URL(redirectUrl, req.url))
}

