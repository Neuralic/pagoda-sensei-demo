import { NextResponse } from "next/server";
import {
  getGatewayBaseUrl,
  hasTransferzEnvPasswordCredentials,
  requireTransferzAdmin,
  transferzGatewayGenerateToken,
  transferzGatewayWarpMismatchMessage,
  transferzLogSecretPreview,
  transferzReadErrorMessage,
} from "@/lib/transferz";

export const runtime = "nodejs";

/**
 * Debug / tooling: short-lived Gateway access token using **server env only**
 * (`TRANSFERZ_EMAIL`, `TRANSFERZ_PASSWORD`). Same partner account used for all agents.
 *
 * **Admin only.** Agents never supply Transferz credentials.
 *
 * POST: empty body `{}` (JSON optional).
 */
export async function POST() {
  try {
    const session = await requireTransferzAdmin();
    if (!session.ok) return session.response;

    if (!hasTransferzEnvPasswordCredentials()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Set TRANSFERZ_EMAIL and TRANSFERZ_PASSWORD in the server environment for the Pagoda transfer provider account.",
        },
        { status: 400 }
      );
    }

    const email = process.env.TRANSFERZ_EMAIL!.trim();
    const password = process.env.TRANSFERZ_PASSWORD!;

    const res = await transferzGatewayGenerateToken(email, password);
    if (!res.ok) {
      const msg = await transferzReadErrorMessage(res);
      return NextResponse.json(
        { ok: false, error: msg || "Authentication failed" },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const data = (await res.json()) as Record<string, unknown>;
    const accessToken =
      (typeof data.accessToken === "string" && data.accessToken) ||
      (typeof data.access_token === "string" && data.access_token) ||
      "";
    const expiresRaw = data.expiresInSeconds ?? data.expires_in_seconds;
    let expiresInSeconds: number | undefined;
    if (typeof expiresRaw === "number" && Number.isFinite(expiresRaw)) {
      expiresInSeconds = expiresRaw;
    } else if (typeof expiresRaw === "string") {
      const n = parseInt(expiresRaw, 10);
      if (Number.isFinite(n)) expiresInSeconds = n;
    }

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Provider returned no access token" },
        { status: 502 }
      );
    }

    console.log("[transferz/auth/generate-token] OK", {
      gatewayBaseUrl: getGatewayBaseUrl(),
      accessTokenPreview: transferzLogSecretPreview(accessToken),
      expiresInSeconds,
    });

    return NextResponse.json({
      ok: true,
      accessToken,
      ...(expiresInSeconds !== undefined ? { expiresInSeconds } : {}),
    });
  } catch (e) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    console.error("[transferz/auth/generate-token]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
