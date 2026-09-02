// lib/google.ts
import { google } from "googleapis";
import { NextResponse } from "next/server";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

// -----------------------------
// CREATE GOOGLE OAUTH CLIENT
// -----------------------------
export function createOAuthClient(redirectUri?: string) {
  const finalRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_MEET_REDIRECT_URI;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    finalRedirectUri
  );
}

// ---------------------------------------------------------
// CREATE A CLIENT WITH ACCESS + REFRESH TOKENS IF AVAILABLE
// ---------------------------------------------------------
export async function authorizeWithTokens(
  accessToken?: string,
  refreshToken?: string
) {
  const client = createOAuthClient();

  if (accessToken || refreshToken) {
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  // Try refreshing access token
  try {
    await client.getAccessToken(); // refreshes automatically if expired
  } catch (err) {
    console.error("Error refreshing token:", err);
  }

  return client;
}

// -------------------------------
// REDIRECT USER TO GOOGLE LOGIN
// -------------------------------
export async function googleAuthRedirect() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_MEET_REDIRECT_URI } =
    process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error:
          "Google OAuth configuration is missing. Please check your environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).",
      },
      { status: 500 }
    );
  }

  try {
    // Auto-detect redirect URI if not set
    // For /api/google route, use /api/google/callback (cookie-based)
    // Support both GOOGLE_REDIRECT_URI and GOOGLE_MEET_REDIRECT_URI for backward compatibility
    let redirectUri = GOOGLE_REDIRECT_URI || GOOGLE_MEET_REDIRECT_URI;
    
    if (!redirectUri) {
      // Import headers dynamically to avoid issues
      const { headers } = await import('next/headers');
      const headersList = await headers();
      const host = headersList.get('host') || 'localhost:3000';
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      // Use /api/google/callback for cookie-based auth (meeting modal)
      redirectUri = `${protocol}://${host}/api/google/callback`;
      console.log('[Google OAuth] Auto-detected redirect URI:', redirectUri);
    }

    const oauth2Client = createOAuthClient(redirectUri);

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error generating Google auth URL:", error);
    return NextResponse.json(
      {
        error:
          "Failed to initialize Google OAuth. Please check your configuration.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------
// HANDLE GOOGLE CALLBACK → SAVE TOKENS IN COOKIES
// -----------------------------------------------------
export async function googleCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  console.log("url", url);

  if (!code) {
    return NextResponse.json(
      { error: "Google Auth Code missing" },
      { status: 400 }
    );
  }

  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);

  const accessToken = tokens.access_token || "";
  const refreshToken = tokens.refresh_token || "";

  // Set cookies
  const redirectUrl = new URL("/agent/conversation", req.url);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("google_access", accessToken, {
    path: "/",
    httpOnly: true,
  });
  response.cookies.set("google_refresh", refreshToken, {
    path: "/",
    httpOnly: true,
  });

  return response;
}
