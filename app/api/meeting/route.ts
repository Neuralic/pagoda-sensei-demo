import { NextRequest, NextResponse } from "next/server";
import { requireSessionActor } from "@/lib/itinerary-access";
import { google } from "googleapis";
import { sendGoogleMeetEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const { start, end, summary, email, senderName, refreshToken } = await req.json();

    if (!start || !end || !email || !senderName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Support both refreshToken in body (preferred) and cookies (backward compatibility)
    let token = refreshToken;
    
    // Fallback to cookies if refreshToken not in body
    if (!token) {
      const cookieRefreshToken = req.cookies.get("google_refresh")?.value;
      if (cookieRefreshToken) {
        token = cookieRefreshToken;
      }
    }

    if (!token) {
      // Not authenticated → frontend will handle redirect
      return NextResponse.json(
        { error: "Not authenticated with Google. Please provide refreshToken in request body or authenticate first." },
        { status: 401 }
      );
    }

    // Create OAuth2 client (redirect URI not needed for refresh token flow)
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );

    oauth2Client.setCredentials({ refresh_token: token });

    // Verify token is valid by getting access token
    try {
      await oauth2Client.getAccessToken();
    } catch (tokenErr: any) {
      const errorMessage = tokenErr?.response?.data?.error || tokenErr?.message || String(tokenErr);
      const errorDescription = tokenErr?.response?.data?.error_description || '';
      
      console.error('[Google OAuth] Token refresh failed:', {
        error: errorMessage,
        description: errorDescription,
        clientId: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing',
        hasRefreshToken: !!token,
      });

      // Provide more specific error messages
      let userMessage = "Failed to obtain access token. The refresh token may be invalid or expired.";
      if (errorMessage === 'invalid_grant') {
        userMessage = "The refresh token is invalid or expired. Please re-authenticate with Google.";
      } else if (errorMessage === 'invalid_client') {
        userMessage = "Google OAuth configuration error. Please check environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).";
      }

      return NextResponse.json(
        { 
          error: userMessage,
          detail: errorDescription || errorMessage,
          code: errorMessage,
          requiresReauth: errorMessage === 'invalid_grant'
        },
        { status: 401 }
      );
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary: summary || "Google Meet Meeting",
      description: "Auto-created meeting via Next.js",
      start: { dateTime: start, timeZone: "Asia/Dhaka" },
      end: { dateTime: end, timeZone: "Asia/Dhaka" },
      attendees: [{ email }],
      reminders: { useDefault: true },
      conferenceData: {
        createRequest: {
          requestId: "meet-" + Date.now(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    const created = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const meetLink = created.data.hangoutLink || created.data.conferenceData?.entryPoints?.[0]?.uri || "";

    if (email && meetLink) {
      await sendGoogleMeetEmail(email, senderName, meetLink, start, end, summary);
    }

    return NextResponse.json({ message: "Meeting created", meetLink, eventId: created.data.id });
  } catch (error) {
    console.error("Google Meet Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
