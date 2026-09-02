# Fixing Google OAuth "Failed to obtain access token" Error in Staging

## Problem
The error "Failed to obtain access token. The refresh token may be invalid or expired" occurs when:
1. The refresh token was issued for a different OAuth client (different `GOOGLE_CLIENT_ID`)
2. The refresh token has expired or been revoked
3. The redirect URI doesn't match what's configured in Google Cloud Console
4. Environment variables are missing or incorrect

## Solution Steps

### 1. Verify Environment Variables in Staging

Ensure these are set correctly in your staging environment:
```bash
GOOGLE_CLIENT_ID=your-staging-client-id
GOOGLE_CLIENT_SECRET=your-staging-client-secret
GOOGLE_REDIRECT_URI=https://your-staging-domain.com/api/auth/google/callback
# OR
GOOGLE_MEET_REDIRECT_URI=https://your-staging-domain.com/api/google/callback
```

### 2. Check Google Cloud Console Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Find your OAuth 2.0 Client ID
5. Verify the **Authorized redirect URIs** include:
   - `https://your-staging-domain.com/api/auth/google/callback`
   - `https://your-staging-domain.com/api/google/callback`

### 3. Re-authenticate Users

Since refresh tokens are tied to the OAuth client that issued them:

**Option A: Clear existing tokens and re-authenticate**
- Users need to clear their `google_refresh_token` from localStorage
- Or clear the `google_refresh` cookie
- Then re-authenticate through the OAuth flow

**Option B: Use separate OAuth clients for staging/production**
- Create separate OAuth 2.0 Client IDs in Google Cloud Console
- Use different credentials for staging vs production
- Users authenticate separately for each environment

### 4. Test the Fix

1. Clear any existing Google tokens (localStorage or cookies)
2. Trigger the Google OAuth flow again
3. Complete authentication
4. Try creating a meeting again

### 5. Common Error Codes

- `invalid_grant`: Refresh token is invalid/expired → User needs to re-authenticate
- `invalid_client`: OAuth credentials are wrong → Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `redirect_uri_mismatch`: Redirect URI doesn't match → Update Google Cloud Console

## Prevention

1. **Use separate OAuth clients** for staging and production
2. **Set proper redirect URIs** in Google Cloud Console for each environment
3. **Monitor token expiration** - Google refresh tokens can expire after 6 months of inactivity
4. **Handle errors gracefully** - The updated code now provides better error messages

## Debugging

Check the server logs for detailed error information:
- The error code (e.g., `invalid_grant`, `invalid_client`)
- Whether environment variables are set
- Whether a refresh token was provided

The API now returns:
- `error`: User-friendly error message
- `detail`: Technical error details
- `code`: Error code from Google
- `requiresReauth`: Boolean indicating if user needs to re-authenticate

