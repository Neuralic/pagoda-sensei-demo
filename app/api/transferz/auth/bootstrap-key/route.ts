import { NextResponse } from "next/server";
import {
  hasTransferzEnvPasswordCredentials,
  requireTransferzAdmin,
  transferzCreateApiKeyFromPassword,
  transferzGatewayWarpMismatchMessage,
} from "@/lib/transferz";

export const runtime = "nodejs";

/**
 * One-shot: mint a Warp Drive API key from env `TRANSFERZ_EMAIL` + `TRANSFERZ_PASSWORD`
 * so you can copy it into `TRANSFERZ_API_KEY` (recommended for serverless).
 * At runtime, if `TRANSFERZ_API_KEY` is unset, the app can still auto-mint and cache a key
 * in memory from the same env vars — prefer setting `TRANSFERZ_API_KEY` to avoid extra keys.
 *
 * **Admin only.** Avoid calling repeatedly (Transferz limits API keys per user).
 *
 * POST JSON (optional): `{ "description"?: string }`
 */
export async function POST(req: Request) {
  try {
    const session = await requireTransferzAdmin();
    if (!session.ok) return session.response;

    if (!hasTransferzEnvPasswordCredentials()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Set TRANSFERZ_EMAIL and TRANSFERZ_PASSWORD in the server environment, then call again.",
        },
        { status: 400 }
      );
    }

    const email = process.env.TRANSFERZ_EMAIL!.trim();
    const password = process.env.TRANSFERZ_PASSWORD!;

    const body = (await req.json().catch(() => ({}))) as { description?: unknown };
    const description =
      typeof body.description === "string" ? body.description.trim() : undefined;

    const result = await transferzCreateApiKeyFromPassword(
      email,
      password,
      description || `Pagoda Travel bootstrap — ${new Date().toISOString().slice(0, 19)}Z`
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      apiKey: result.key,
      message:
        "Set TRANSFERZ_API_KEY in your deployment environment to this value. It is not stored by the app. All agents use this single partner key.",
      hint:
        "Without TRANSFERZ_API_KEY, the server can still auto-mint from TRANSFERZ_EMAIL/PASSWORD per instance — prefer setting TRANSFERZ_API_KEY in production. Do not commit secrets.",
      meta: {
        prefix: result.apiKeyPayload.prefix,
        suffix: result.apiKeyPayload.suffix,
        expires: result.apiKeyPayload.expires,
      },
    });
  } catch (e) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    console.error("[transferz/auth/bootstrap-key]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
