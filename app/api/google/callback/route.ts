// Callback route for cookie-based Google OAuth (used by meeting modal)
// This saves tokens to cookies and redirects back to the chat page

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { headers } from 'next/headers'
import { parseGoogleAuthorizationError } from '@/lib/google-oauth-callback'

function escapeHtmlGoogleCookieCallback(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function googleCookieCallbackErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google sign-in</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; line-height: 1.5; }
      .card { max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      .err { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; }
      .muted { margin-top: 16px; font-size: 13px; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Google sign-in</h1>
      <p class="err">${escapeHtmlGoogleCookieCallback(message)}</p>
      <p class="muted">Close this tab and try again from the app.</p>
    </div>
  </body>
</html>`
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // Optional: can contain redirect URL

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_MEET_REDIRECT_URI } = process.env
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' },
        { status: 500 }
      )
    }

    const oauthErr = parseGoogleAuthorizationError(url)
    if (oauthErr.code && oauthErr.userFacingMessage) {
      console.warn('[Google OAuth cookie callback] Authorization error:', oauthErr.code, oauthErr.description)
      return new NextResponse(googleCookieCallbackErrorHtml(oauthErr.userFacingMessage), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    if (!code) {
      return new NextResponse(
        googleCookieCallbackErrorHtml(
          'Google did not return an authorization code. Try signing in again. If you closed the Google window before finishing, start the flow again.'
        ),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    // Auto-detect redirect URI if not set
    let redirectUri = GOOGLE_REDIRECT_URI || GOOGLE_MEET_REDIRECT_URI
    if (!redirectUri) {
      const headersList = await headers()
      const host = headersList.get('host') || 'localhost:3000'
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
      redirectUri = `${protocol}://${host}/api/google/callback`
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    )

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const accessToken = tokens.access_token || ''
    const refreshToken = tokens.refresh_token || ''

    
    // Create redirect response to success page with cookies set
    // Cookies set in redirect response should be accessible to parent window
    const successUrl = new URL('/google-oauth-success', req.url)
    const response = NextResponse.redirect(successUrl)
    
    // Set cookies in the redirect response
    // These cookies will be set when the redirect happens
    if (accessToken) {
      response.cookies.set('google_access', accessToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
    }
    
    if (refreshToken) {
      response.cookies.set('google_refresh', refreshToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      })
    }

    return response
  } catch (err) {
    return NextResponse.json(
      { error: 'OAuth callback failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
