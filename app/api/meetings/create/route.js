import { NextResponse } from 'next/server'
import { google } from 'googleapis'

// Helper to safely build ISO strings
function toIso(d) {
  try { return new Date(d).toISOString() } catch { return new Date().toISOString() }
}

// Extract Meet link from an inserted event response
function extractMeetLink(event) {
  if (!event) return null
  if (event.hangoutLink) return event.hangoutLink
  const entryPoints = event?.conferenceData?.entryPoints
  if (Array.isArray(entryPoints)) {
    const meet = entryPoints.find((e) => e?.entryPointType === 'video')
    if (meet?.uri) return meet.uri
  }
  return null
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      tourGuideName,
      tourGuideEmail,
      userName,
      userEmail,
      duration,
      refreshToken,
    } = body || {}

    // Basic validation
    if (!tourGuideName || !tourGuideEmail || !userName || !userEmail) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: tourGuideName, tourGuideEmail, userName, userEmail',
      }, { status: 400 })
    }

    if (!refreshToken) {
      return NextResponse.json({
        success: false,
        error: 'Missing refreshToken. Please authenticate with Google first.',
      }, { status: 400 })
    }

    const minutes = Number.isFinite(Number(duration)) ? Math.max(5, parseInt(duration, 10)) : 30

    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
    } = process.env

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: 'Missing Google OAuth configuration. Please contact support.'
      }, { status: 500 })
    }

    // Create OAuth2 client (redirect URI not needed for refresh token flow)
    const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    oauth2.setCredentials({ refresh_token: refreshToken })

    // Optionally prefetch an access token to catch invalid_grant early
    try {
      await oauth2.getAccessToken()
    } catch (tokenErr) {
      const errorData = tokenErr?.response?.data || {}
      const errorMessage = errorData.error || tokenErr?.message || String(tokenErr)
      const errorDescription = errorData.error_description || ''
      
      console.error('[Google OAuth] Token refresh failed:', {
        error: errorMessage,
        description: errorDescription,
        clientId: GOOGLE_CLIENT_ID ? 'Set' : 'Missing',
        hasRefreshToken: !!refreshToken,
      })

      // Provide more specific error messages
      let userMessage = 'Failed to obtain access token. The refresh token may be invalid or expired.'
      if (errorMessage === 'invalid_grant') {
        userMessage = 'The refresh token is invalid or expired. Please re-authenticate with Google.'
      } else if (errorMessage === 'invalid_client') {
        userMessage = 'Google OAuth configuration error. Please check environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).'
      }

      return NextResponse.json({
        success: false,
        error: userMessage,
        detail: errorDescription || errorMessage,
        code: errorMessage,
        requiresReauth: errorMessage === 'invalid_grant',
      }, { status: 401 })
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2 })

    const now = new Date()
    const start = now
    const end = new Date(start.getTime() + minutes * 60 * 1000)

    const requestId = `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Build event
    const event = {
      summary: `Meeting: ${tourGuideName} ↔ ${userName}`,
      description: `Auto-generated meeting between ${tourGuideName} (${tourGuideEmail}) and ${userName} (${userEmail}).`,
      start: { dateTime: toIso(start) },
      end: { dateTime: toIso(end) },
      attendees: [
        { email: tourGuideEmail, displayName: tourGuideName },
        { email: userEmail, displayName: userName },
      ],
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true,
    }

    let insertRes
    try {
      insertRes = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        conferenceDataVersion: 1,
        sendUpdates: 'none', // do not send emails
        supportsAttachments: false,
      })
    } catch (apiErr) {
      // Catch Google API errors
      const status = apiErr?.code || apiErr?.response?.status || 500
      const data = apiErr?.errors || apiErr?.response?.data || { message: apiErr?.message }
      return NextResponse.json({
        success: false,
        error: 'Failed to create calendar event',
        detail: data,
        status,
      }, { status })
    }

    const created = insertRes?.data || null
    const meetLink = extractMeetLink(created)

    return NextResponse.json({
      success: true,
      meetLink,
      eventId: created?.id || null,
      startTime: created?.start?.dateTime || toIso(start),
      endTime: created?.end?.dateTime || toIso(end),
    })
  } catch (err) {
    // Fallback error handler
    console.error('[Meetings] create error:', err)
    return NextResponse.json({
      success: false,
      error: 'Unexpected server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
