import { ensureTransferzGatewayWarpPaired, getGatewayBaseUrl, transferzLogSecretPreview } from "./config";
import { transferzReadErrorMessage } from "./errors";

export type TransferzGenerateTokenResponse = {
  accessToken: string;
  expiresInSeconds?: number;
};

export type TransferzCreateApiKeyResponse = {
  userId?: number;
  description?: string;
  key: string;
  expires?: string;
  prefix?: string;
  suffix?: string;
  created?: string;
  updated?: string;
};

export async function transferzGatewayGenerateToken(
  email: string,
  password: string
): Promise<Response> {
  ensureTransferzGatewayWarpPaired();
  const base = getGatewayBaseUrl();
  const tokenUrl = `${base}/auth/auth/generate-token`;
  console.log("[transferz] gateway POST generate-token", {
    gatewayBaseUrl: base,
    url: tokenUrl,
  });
  return fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
}

export async function transferzGatewayCreateUserApiKey(
  accessToken: string,
  options?: { description?: string }
): Promise<Response> {
  const base = getGatewayBaseUrl();
  const keyUrl = `${base}/auth/api-keys/me`;
  console.log("[transferz] gateway POST create user API key", {
    gatewayBaseUrl: base,
    url: keyUrl,
    bearerPreview: transferzLogSecretPreview(accessToken),
  });
  return fetch(keyUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...(options?.description ? { description: options.description } : {}),
    }),
  });
}

function parseAccessToken(data: Record<string, unknown>): string {
  const t =
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    "";
  return t;
}

function parseExpiresInSeconds(data: Record<string, unknown>): number | undefined {
  const raw = data.expiresInSeconds ?? data.expires_in_seconds;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Full onboarding step: email/password → access token → API key (Transferz returns `key` once).
 */
export async function transferzCreateApiKeyFromPassword(
  email: string,
  password: string,
  description?: string
): Promise<
  | { ok: true; key: string; expiresInSeconds?: number; apiKeyPayload: TransferzCreateApiKeyResponse }
  | { ok: false; error: string; status: number }
> {
  const tokenRes = await transferzGatewayGenerateToken(email, password);
  if (!tokenRes.ok) {
    const msg = await transferzReadErrorMessage(tokenRes);
    return {
      ok: false,
      error: msg || "Could not obtain access token",
      status: tokenRes.status >= 400 && tokenRes.status < 600 ? tokenRes.status : 502,
    };
  }

  let tokenJson: Record<string, unknown>;
  try {
    tokenJson = (await tokenRes.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid token response from provider", status: 502 };
  }

  const accessToken = parseAccessToken(tokenJson);
  const expiresInSeconds = parseExpiresInSeconds(tokenJson);
  if (!accessToken) {
    return { ok: false, error: "Provider returned no access token", status: 502 };
  }

  console.log("[transferz] gateway access token received", {
    gatewayBaseUrl: getGatewayBaseUrl(),
    accessTokenPreview: transferzLogSecretPreview(accessToken),
    expiresInSeconds,
  });

  const keyRes = await transferzGatewayCreateUserApiKey(accessToken, {
    description: description?.trim() || `Pagoda Travel — ${new Date().toISOString().slice(0, 10)}`,
  });
  if (!keyRes.ok) {
    const msg = await transferzReadErrorMessage(keyRes);
    return {
      ok: false,
      error: msg || "Could not create API key",
      status: keyRes.status >= 400 && keyRes.status < 600 ? keyRes.status : 502,
    };
  }

  let keyJson: TransferzCreateApiKeyResponse;
  try {
    keyJson = (await keyRes.json()) as TransferzCreateApiKeyResponse;
  } catch {
    return { ok: false, error: "Invalid API key response from provider", status: 502 };
  }

  if (typeof keyJson.key !== "string" || !keyJson.key) {
    return { ok: false, error: "Provider returned no API key", status: 502 };
  }

  console.log("[transferz] gateway Warp Drive API key minted", {
    warpDriveKeyPreview: transferzLogSecretPreview(keyJson.key),
  });

  return {
    ok: true,
    key: keyJson.key,
    expiresInSeconds,
    apiKeyPayload: keyJson,
  };
}
