import { NextResponse } from "next/server";
import {
  isTransferzWarpDriveConfigured,
  requireTransferzAgent,
  transferzGatewayWarpMismatchMessage,
  transferzPartnerGet,
  transferzPartnerPost,
  transferzPartnerPostNoBody,
  transferzReadErrorMessage,
} from "@/lib/transferz";
import { notifyAgentTransferzByUserId } from "@/lib/notify-agent-transferz-email";

export const runtime = "nodejs";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export async function POST(req: Request) {
  const session = await requireTransferzAgent();
  if (!session.ok) return session.response;
  const agentUserId = session.userId;

  const notifyProviderFailure = (errorMessage: string) => {
    notifyAgentTransferzByUserId(agentUserId, {
      scenario: "booking_failed_at_provider",
      errorMessage,
    });
  };

  try {
    if (!isTransferzWarpDriveConfigured()) {
      notifyProviderFailure("Transfer provider is not configured on the server.");
      return NextResponse.json(
        {
          ok: false,
          error:
            "Transfer provider is not configured on the server.",
        },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      notifyProviderFailure("Invalid JSON body");
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const res = await transferzPartnerPost("/partners/bookings", body);
    if (!res.ok) {
      const msg = await transferzReadErrorMessage(res);
      const err = msg || "Booking failed";
      notifyProviderFailure(err);
      return NextResponse.json(
        { ok: false, error: err },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const created = (await res.json()) as unknown;
    const createdRec = isRecord(created) ? created : null;
    const bookingIdRaw = createdRec?.id;
    const bookingId =
      typeof bookingIdRaw === "number" && Number.isFinite(bookingIdRaw)
        ? String(Math.trunc(bookingIdRaw))
        : typeof bookingIdRaw === "string" && bookingIdRaw.trim()
          ? bookingIdRaw.trim()
          : null;

    if (!bookingId) {
      notifyProviderFailure("Booking created but provider returned no booking id");
      return NextResponse.json(
        { ok: false, error: "Booking created but provider returned no booking id" },
        { status: 502 }
      );
    }

    // Pay by invoice is required to confirm the booking (journeys move out of NOT_PAID).
    const payRes = await transferzPartnerPostNoBody(
      `/partners/bookings/${encodeURIComponent(bookingId)}/pay-by-invoice`
    );
    if (!payRes.ok) {
      const msg = await transferzReadErrorMessage(payRes);
      const err = msg || "Pay-by-invoice failed";
      notifyProviderFailure(err);
      return NextResponse.json(
        { ok: false, error: err },
        { status: payRes.status >= 400 && payRes.status < 600 ? payRes.status : 502 }
      );
    }

    await payRes.json().catch(() => null);

    // Return the canonical booking after payment (journey status e.g. PENDING, not NOT_PAID from create-only payload).
    const requestId =
      req.headers.get("x-request-id") ||
      req.headers.get("X-Request-ID") ||
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const firstJourneyStatus = (body: unknown): string | null => {
      if (!isRecord(body)) return null;
      const journeys = body.journeys;
      if (!Array.isArray(journeys) || journeys.length === 0) return null;
      const j0 = journeys[0];
      if (!isRecord(j0)) return null;
      return typeof j0.status === "string" ? j0.status : null;
    };

    let lastGetErr: string | null = null;
    let lastBody: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await sleep(400);
      const getRes = await transferzPartnerGet(`/partners/bookings/${encodeURIComponent(bookingId)}`, {
        requestId,
      });
      if (!getRes.ok) {
        lastGetErr = (await transferzReadErrorMessage(getRes)) || `HTTP ${getRes.status}`;
        continue;
      }
      const body = (await getRes.json()) as unknown;
      lastBody = body;
      const st = firstJourneyStatus(body);
      // Anything other than explicit NOT_PAID is treated as post-payment (missing status → assume GET is authoritative).
      if (st !== "NOT_PAID") {
        return NextResponse.json({ ok: true, data: body });
      }
    }

    if (!lastBody || !isRecord(lastBody)) {
      const err =
        lastGetErr ||
        "Pay-by-invoice succeeded but could not load the booking from the provider (GET /partners/bookings/{id}).";
      notifyProviderFailure(err);
      return NextResponse.json(
        {
          ok: false,
          error: err,
        },
        { status: 502 }
      );
    }

    const notPaidErr =
      lastGetErr ||
      "Transferz journey is still NOT_PAID after pay-by-invoice. Wait a moment and retry, or contact Transferz support.";
    notifyProviderFailure(notPaidErr);
    return NextResponse.json(
      {
        ok: false,
        error: notPaidErr,
      },
      { status: 502 }
    );
  } catch (e) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      notifyProviderFailure(mismatch);
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Unexpected error";
    if (msg === "TRANSFERZ_NOT_CONFIGURED") {
      notifyProviderFailure("Transfer provider is not configured.");
      return NextResponse.json(
        { ok: false, error: "Transfer provider is not configured." },
        { status: 503 }
      );
    }
    console.error("[transferz/bookings]", e);
    notifyProviderFailure(msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
