// API endpoint to verify if Google OAuth cookies are set
// Used by the meeting modal to check if cookies are available after OAuth popup

import { NextRequest, NextResponse } from 'next/server'
import { requireSessionActor } from "@/lib/itinerary-access";

export async function GET(req: NextRequest) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  const accessToken = req.cookies.get('google_access')?.value
  const refreshToken = req.cookies.get('google_refresh')?.value

  return NextResponse.json({
    authenticated: !!(accessToken && refreshToken),
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
  })
}

