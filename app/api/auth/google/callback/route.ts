import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import { parseGoogleAuthorizationError } from '@/lib/google-oauth-callback'

function escapeHtmlGoogleCallback(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const oauthCallbackHtmlHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Embedder-Policy': 'unsafe-none',
} as const

/** Popup flow: notify opener and show message (avoid raw JSON when Google returns ?error=…). */
function googleAuthPopupFailureResponse(userMessage: string, oauthErrorCode?: string | null) {
  const safeMsg = JSON.stringify(userMessage)
  const safeCode = JSON.stringify(oauthErrorCode ?? null)
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google sign-in</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; line-height: 1.5; }
      .card { max-width: 760px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      .err { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; }
      .footer { margin-top: 16px; font-size: 12px; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Google sign-in</h1>
      <p class="err">${escapeHtmlGoogleCallback(userMessage)}</p>
      <div class="footer">You can close this window and try again from the app.</div>
      <script>
        (function() {
          var msg = ${safeMsg};
          var code = ${safeCode};
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_ERROR',
                error: msg,
                oauthError: code
              }, window.location.origin);
            } catch (e) {
              console.error('Failed to notify opener:', e);
            }
          }
          setTimeout(function() { try { window.close(); } catch (e) {} }, 2000);
        })();
      </script>
    </div>
  </body>
</html>`
  return new NextResponse(html, { status: 200, headers: { ...oauthCallbackHtmlHeaders } })
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')

    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { ok: false, error: 'Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' },
        { status: 500 }
      )
    }

    const oauthErr = parseGoogleAuthorizationError(url)
    if (oauthErr.code && oauthErr.userFacingMessage) {
      console.warn('[Google OAuth] Authorization error from Google:', oauthErr.code, oauthErr.description)
      return googleAuthPopupFailureResponse(oauthErr.userFacingMessage, oauthErr.code)
    }

    if (!code) {
      return googleAuthPopupFailureResponse(
        'Google did not return an authorization code. Try signing in again from the app. If you closed the Google window before finishing, open the Meet flow again and complete sign-in.',
        'missing_code'
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

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    // Optionally set credentials if using client afterwards
    oauth2Client.setCredentials(tokens)

    const refreshToken = tokens.refresh_token || null

    
    if (!refreshToken) {
      console.warn('[Google OAuth] No refresh_token in response. This usually means:')
      console.warn('1. User has already authorized this app (Google only returns refresh_token on first authorization)')
      console.warn('2. Solution: User needs to revoke access at https://myaccount.google.com/permissions')
      console.warn('3. Or ensure prompt=consent is set in the auth URL')
    }

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google OAuth Callback</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 24px; line-height: 1.5; }
      .card { max-width: 760px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      .ok { color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px 12px; border-radius: 8px; display: inline-block; }
      .warn { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 8px; display: inline-block; }
      textarea { width: 100%; min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 14px; padding: 12px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      .muted { color: #6b7280; }
      .footer { margin-top: 16px; font-size: 12px; color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Google OAuth Callback</h1>
      <p class="ok">✅ Authorization successful! You can close this window.</p>
      ${refreshToken ? `
        <p>Your refresh token has been saved. Closing window...</p>
        <script>
          (function() {
            // Store token in localStorage first
            try {
              localStorage.setItem('google_refresh_token', ${JSON.stringify(refreshToken)});
            } catch (e) {
              console.error('Failed to store token:', e);
            }
            
            // Send message to opener with retry logic
            function sendMessage(retries = 3) {
              if (!window.opener || window.opener.closed) {
                console.warn('Opener window not available');
                return;
              }
              
              try {
                window.opener.postMessage({
                  type: 'GOOGLE_AUTH_SUCCESS',
                  refreshToken: ${JSON.stringify(refreshToken)}
                }, window.location.origin);
              } catch (e) {
                console.error('Failed to send message:', e);
                if (retries > 0) {
                  setTimeout(() => sendMessage(retries - 1), 100);
                }
              }
            }
            
            // Send message immediately and also after a short delay
            sendMessage();
            setTimeout(() => sendMessage(), 100);
            
            // Auto-close after 1 second (reduced from 2 seconds)
            setTimeout(() => {
              window.close();
            }, 1000);
          })();
        </script>
      ` : `
        <p class="warn">⚠️ No refresh token was returned.</p>
        <p>To obtain a refresh token, ensure you requested <code>access_type=offline</code> and <code>prompt=consent</code>, and that this Google account hasn't already granted access to this OAuth Client ID. You may need to revoke the app's access in your Google Account permissions and try again.</p>
        <script>
          (function() {
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage({
                  type: 'GOOGLE_AUTH_ERROR',
                  error: 'No refresh token received. Please revoke app access in Google Account settings and try again.'
                }, window.location.origin);
              } catch (e) {
                console.error('Failed to send error message:', e);
              }
            }
          })();
        </script>
      `}

      <h2>Tokens (JSON)</h2>
      <textarea readonly>${JSON.stringify(tokens, null, 2)}</textarea>

      <div class="footer">This window will close automatically.</div>
    </div>
  </body>
</html>`

    // Set headers to allow popup communication
    const response = new NextResponse(html, {
      status: 200,
      headers: { ...oauthCallbackHtmlHeaders },
    })
    
    return response
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err)
    return NextResponse.json(
      { ok: false, error: 'OAuth callback failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

