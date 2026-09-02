import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  countTransferzJourneysInBooking,
  isTransferzJourneyCanceledStatus,
  isTransferzWarpDriveConfigured,
  journeyIdFromTransferzPayloadValue,
  mergeTransferzPayloadFromJourney,
  pickJourneyFromBookingBody,
  transferzCancelFirstAttemptAcceptCharges,
  transferzGatewayWarpMismatchMessage,
  transferzPartnerCancelBooking,
  transferzPartnerCancelJourney,
  transferzPartnerGet,
  transferzReadErrorMessage,
  type TransferzCancelJourneyReason,
} from "@/lib/transferz";
import {
  notifyAgentTransferzByUserId,
  transferzPayloadRefsForAgentEmail,
} from "@/lib/notify-agent-transferz-email";
import { getTransferzPlatformCommissionPct } from "@/lib/transferz/platform-commission-settings";
import { assertItineraryOwnedBySession } from "@/lib/itinerary-access";
import { transferLog } from "@/lib/ops-log";

export const runtime = "nodejs";

const ALLOWED_CANCEL_REASONS: readonly TransferzCancelJourneyReason[] = [
  "NOT_NEEDED_ANYMORE",
  "OTHER",
  "TECHNICAL_ISSUE",
  "FORCE_MAJEURE",
] as const;

function isAllowedCancelReason(s: string): s is TransferzCancelJourneyReason {
  return (ALLOWED_CANCEL_REASONS as readonly string[]).includes(s);
}

/** Optional JSON body: `{ reason?, acceptCharges? }` — both validated server-side. */
async function parsePartnerCancelBody(req: NextRequest): Promise<{
  reason: TransferzCancelJourneyReason;
  acceptCharges?: boolean;
}> {
  const fallback = { reason: "NOT_NEEDED_ANYMORE" as const satisfies TransferzCancelJourneyReason };
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return fallback;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fallback;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const o = raw as Record<string, unknown>;
  const reason =
    typeof o.reason === "string" && isAllowedCancelReason(o.reason) ? o.reason : fallback.reason;
  if (typeof o.acceptCharges === "boolean") {
    return { reason, acceptCharges: o.acceptCharges };
  }
  return { reason };
}

/**
 * Cancel the Transferz journey for this itinerary row, then refresh `payload` from GET booking.
 * Idempotent: if the provider journey is already canceled, skips POST and still merges payload.
 */
export async function POST(_req: NextRequest, context: { params: Promise<{ id: string; bookingId: string }> }) {
  try {
    const { id: itineraryId, bookingId } = await context.params;
    if (!itineraryId || !bookingId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const gate = await assertItineraryOwnedBySession(supabase, itineraryId);
    if (!gate.ok) return gate.response;
    const ownerUserId = gate.ownerUserId;

    if (!isTransferzWarpDriveConfigured()) {
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_cancel_failed",
        itineraryId,
        errorMessage: "Transfer provider is not configured on the server.",
      });
      return NextResponse.json(
        { ok: false, error: "Transfer provider is not configured on the server." },
        { status: 503 }
      );
    }

    const { data: itMeta } = await supabase
      .from("itineraries")
      .select("name")
      .eq("id", itineraryId)
      .maybeSingle();
    const itineraryName = (itMeta as { name?: string } | null)?.name ?? null;

    const { data: row, error: rowErr } = await supabase
      .from("itinerary_transferz_bookings")
      .select("id, payload, title")
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId)
      .maybeSingle();

    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const rawPayload = row.payload;
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : {};

    const providerBookingId = payload.bookingId;
    const journeyId = journeyIdFromTransferzPayloadValue(payload.journeyId);
    const bookingIdStr =
      typeof providerBookingId === "number" && Number.isFinite(providerBookingId)
        ? String(Math.trunc(providerBookingId))
        : typeof providerBookingId === "string" && providerBookingId.trim()
          ? providerBookingId.trim()
          : null;

    if (!bookingIdStr || journeyId == null) {
      const err =
        "This transfer is missing provider booking or journey identifiers. It cannot be canceled automatically.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_cancel_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        errorMessage: err,
      });
      return NextResponse.json(
        {
          ok: false,
          error: err,
        },
        { status: 409 }
      );
    }

    const requestId =
      _req.headers.get("x-request-id") ||
      _req.headers.get("X-Request-ID") ||
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    const partnerCancel = await parsePartnerCancelBody(_req);

    const getBooking = async (): Promise<{ ok: true; body: unknown } | { ok: false; msg: string }> => {
      const getRes = await transferzPartnerGet(`/partners/bookings/${encodeURIComponent(bookingIdStr)}`, {
        requestId,
      });
      if (!getRes.ok) {
        const msg = (await transferzReadErrorMessage(getRes)) || `HTTP ${getRes.status}`;
        return { ok: false, msg };
      }
      const body = (await getRes.json().catch(() => null)) as unknown;
      return { ok: true, body };
    };

    const before = await getBooking();
    if (!before.ok) {
      const err = before.msg || "Could not load booking from the transfer provider.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_cancel_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(payload),
        errorMessage: err,
      });
      return NextResponse.json(
        { ok: false, error: err },
        { status: 502 }
      );
    }

    const j0 = pickJourneyFromBookingBody(before.body, journeyId);
    const statusNow = j0 && typeof j0.status === "string" ? j0.status : null;

    if (!isTransferzJourneyCanceledStatus(statusNow)) {
      const reason = partnerCancel.reason;
      let firstAccept =
        partnerCancel.acceptCharges !== undefined
          ? partnerCancel.acceptCharges
          : transferzCancelFirstAttemptAcceptCharges(j0?.cancellationDetails);

      const cancelJourney = (acceptCharges: boolean) =>
        transferzPartnerCancelJourney(journeyId, bookingIdStr, {
          requestId,
          body: { reason, acceptCharges },
        });

      let cancelRes = await cancelJourney(firstAccept);
      if (!cancelRes.ok && !firstAccept) {
        cancelRes = await cancelJourney(true);
      }
      if (!cancelRes.ok && countTransferzJourneysInBooking(before.body) === 1) {
        cancelRes = await transferzPartnerCancelBooking(bookingIdStr, {
          requestId,
          body: { reason, acceptCharges: true },
        });
      }
      if (!cancelRes.ok) {
        const msg = (await transferzReadErrorMessage(cancelRes)) || `HTTP ${cancelRes.status}`;
        const err = msg || "Provider refused cancellation.";
        notifyAgentTransferzByUserId(ownerUserId, {
          scenario: "transfer_cancel_failed",
          itineraryId,
          itineraryName,
          transferTitle: typeof row.title === "string" ? row.title : null,
          ...transferzPayloadRefsForAgentEmail(payload),
          errorMessage: err,
        });
        return NextResponse.json(
          { ok: false, error: err },
          { status: cancelRes.status >= 400 && cancelRes.status < 600 ? cancelRes.status : 502 }
        );
      }
      await cancelRes.json().catch(() => null);
    }

    const after = await getBooking();
    if (!after.ok) {
      const err =
        after.msg || "Canceled (or was already canceled) but could not reload the booking.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_cancel_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(payload),
        errorMessage: err,
        extraNote:
          "The provider may have canceled the journey; confirm in Transferz or refresh the itinerary.",
      });
      return NextResponse.json(
        { ok: false, error: err },
        { status: 502 }
      );
    }

    const jFinal = pickJourneyFromBookingBody(after.body, journeyId);
    const commissionPct = await getTransferzPlatformCommissionPct(supabase);
    const merged = mergeTransferzPayloadFromJourney(payload, jFinal, commissionPct);

    const { data: updated, error: upErr } = await supabase
      .from("itinerary_transferz_bookings")
      .update({ payload: merged })
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId)
      .select("*")
      .single();

    if (upErr) {
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_cancel_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(merged),
        errorMessage: upErr.message || "Could not update itinerary after cancellation at the provider.",
        extraNote:
          "The transfer may be canceled at Transferz; verify there and refresh the itinerary.",
      });
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const finalPayload =
      updated.payload && typeof updated.payload === "object" && !Array.isArray(updated.payload)
        ? (updated.payload as Record<string, unknown>)
        : merged;
    notifyAgentTransferzByUserId(ownerUserId, {
      scenario: "transfer_canceled",
      itineraryId,
      itineraryName,
      transferTitle: typeof updated.title === "string" ? updated.title : null,
      ...transferzPayloadRefsForAgentEmail(finalPayload),
    });

    const refs = transferzPayloadRefsForAgentEmail(finalPayload);
    transferLog.info("booking.canceled", {
      itineraryId,
      bookingId,
      providerBookingId: refs.providerBookingId,
      journeyCode: refs.journeyCode,
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (e: unknown) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Unexpected error";
    if (msg === "TRANSFERZ_NOT_CONFIGURED") {
      try {
        const jar = await cookies();
        const uid = jar.get("userId")?.value;
        const { id: itineraryIdCatch } = await context.params;
        if (uid && itineraryIdCatch) {
          notifyAgentTransferzByUserId(uid, {
            scenario: "transfer_cancel_failed",
            itineraryId: itineraryIdCatch,
            errorMessage: "Transfer provider is not configured.",
          });
        }
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { ok: false, error: "Transfer provider is not configured." },
        { status: 503 }
      );
    }
    console.error("[transferz-bookings/cancel]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
