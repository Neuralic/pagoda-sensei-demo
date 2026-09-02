import { NextResponse } from "next/server";
import {
  requireTransferzAdmin,
  transferzGatewayCreateUserApiKey,
  transferzReadErrorMessage,
} from "@/lib/transferz";

export const runtime = "nodejs";

/**
 * Admin tooling: create a Warp Drive API key from a Bearer access token (e.g. from
 * POST /api/transferz/auth/generate-token). Not used by agents in normal operation.
 *
 * **Admin only.**
 *
 * POST JSON: { "accessToken": string, "description"?: string }
 */
export async function POST(req: Request) {
  try {
    const session = await requireTransferzAdmin();
    if (!session.ok) return session.response;

    const body = (await req.json().catch(() => null)) as {
      accessToken?: unknown;
      description?: unknown;
    } | null;

    const accessToken =
      typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Missing accessToken" },
        { status: 400 }
      );
    }

    const description =
      typeof body?.description === "string" ? body.description.trim() : undefined;

    const res = await transferzGatewayCreateUserApiKey(accessToken, {
      ...(description ? { description } : {}),
    });
    if (!res.ok) {
      const msg = await transferzReadErrorMessage(res);
      return NextResponse.json(
        { ok: false, error: msg || "Could not create API key" },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const data = (await res.json()) as unknown;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[transferz/auth/create-api-key]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
