/**
 * OAuth 2.0 authorization errors on the redirect to our callback (RFC 6749 §4.1.2.1).
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1
 */
export function parseGoogleAuthorizationError(url: URL): {
  code: string | null;
  description: string | null;
  userFacingMessage: string | null;
} {
  const err = url.searchParams.get("error");
  if (!err) {
    return { code: null, description: null, userFacingMessage: null };
  }
  const rawDesc = url.searchParams.get("error_description");
  const description = rawDesc
    ? decodeURIComponent(rawDesc.replace(/\+/g, " "))
    : null;

  let userFacingMessage: string;
  switch (err) {
    case "access_denied":
      userFacingMessage =
        "Google access was denied or canceled. To create a Meet, sign in and choose Allow when Google asks for Calendar access. If you clicked Cancel, try again. Organization accounts may block third-party apps until an admin approves this app in Google Cloud or Google Workspace.";
      break;
    case "invalid_request":
      userFacingMessage =
        description ||
        "Google rejected the sign-in request (invalid_request). Check that the OAuth redirect URI in Google Cloud Console exactly matches this app’s callback URL.";
      break;
    case "unauthorized_client":
      userFacingMessage =
        description ||
        "This app is not allowed to use Google sign-in (unauthorized_client). Verify OAuth client type and redirect URIs in Google Cloud Console.";
      break;
    case "unsupported_response_type":
    case "invalid_scope":
      userFacingMessage =
        description || `Google sign-in error (${err}). Contact support if this continues.`;
      break;
    case "server_error":
    case "temporarily_unavailable":
      userFacingMessage =
        description ||
        "Google’s servers had a problem. Wait a moment and try again.";
      break;
    default:
      userFacingMessage = description
        ? `${err}: ${description}`
        : `Google sign-in error (${err}). Try again or contact support.`;
  }

  return { code: err, description, userFacingMessage };
}
