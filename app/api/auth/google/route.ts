import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { headers } from 'next/headers'

export async function GET() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' },
      { status: 500 }
    )
  }

  // Auto-detect redirect URI for local development if not set
  let redirectUri = GOOGLE_REDIRECT_URI
  if (!redirectUri) {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    redirectUri = `${protocol}://${host}/api/auth/google/callback`
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ]

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  })

  // Note: Headers can't be set on external redirects (to Google's domain)
  // The COOP policy is handled by making the code resilient to access restrictions
  return NextResponse.redirect(authUrl)
}

