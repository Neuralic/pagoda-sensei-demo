import { NextResponse } from "next/server";
import {
  getTransferzPartnerId,
  getTransferzQuoteCurrency,
  isTransferzWarpDriveConfigured,
  normalizePartnerQuotesBody,
  requireTransferzAgent,
  transferzGatewayWarpMismatchMessage,
  transferzPartnerPost,
  transferzReadErrorMessage,
} from "@/lib/transferz";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireTransferzAgent();
    if (!session.ok) return session.response;

    if (!isTransferzWarpDriveConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Transfer provider is not configured on the server.",
        },
        { status: 503 }
      );
    }

    const raw = (await req.json().catch(() => null)) as unknown;
    const normalized = normalizePartnerQuotesBody(raw);
    if (!normalized.ok) {
      return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
    }

    const partnerId = getTransferzPartnerId();
    if (partnerId && !("partnerId" in normalized.body)) {
      normalized.body.partnerId = partnerId;
    }

    if (!("currencyCode" in normalized.body)) {
      normalized.body.currencyCode = getTransferzQuoteCurrency();
    }

    const requestId =
      req.headers.get("x-request-id") ||
      req.headers.get("X-Request-ID") ||
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    const res = await transferzPartnerPost("/partners/quotes", normalized.body, {
      requestId,
    });
    if (!res.ok) {
      const msg = await transferzReadErrorMessage(res);
      return NextResponse.json(
        { ok: false, error: msg || "Quote request failed" },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const data = (await res.json()) as unknown;
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Unexpected error";
    if (msg === "TRANSFERZ_NOT_CONFIGURED") {
      return NextResponse.json(
        { ok: false, error: "Transfer provider is not configured." },
        { status: 503 }
      );
    }
    console.error("[transferz/quotes]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
