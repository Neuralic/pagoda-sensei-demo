import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  isTransferzJourneyCanceledStatus,
  isTransferzWarpDriveConfigured,
  journeyIdFromTransferzPayloadValue,
  pickJourneyFromBookingBody,
  transferzGatewayWarpMismatchMessage,
  transferzPartnerGet,
  transferzReadErrorMessage,
} from "@/lib/transferz";
import { assertItineraryOwnedBySession } from "@/lib/itinerary-access";
import { pruneItineraryPdfFieldsAfterActivityRemoved } from "@/lib/prune-itinerary-pdf-on-activity-remove";
import { isTransferzBookingRemovedFromItinerary, markTransferzBookingRemovedFromItinerary } from "@/lib/transferz/booking-row";
import { transferLog } from "@/lib/ops-log";

export const runtime = "nodejs";

/** Live journey slice from the provider (for modify form defaults). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; bookingId: string }> }
) {
  try {
    const { id: itineraryId, bookingId } = await context.params;
    if (!itineraryId || !bookingId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const gate = await assertItineraryOwnedBySession(supabase, itineraryId);
    if (!gate.ok) return gate.response;

    const { data: row, error: rowErr } = await supabase
      .from("itinerary_transferz_bookings")
      .select("id, payload")
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId)
      .maybeSingle();

    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const rawPayload = row.payload;
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : {};

    if (isTransferzBookingRemovedFromItinerary(payload)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const providerBookingId = payload.bookingId;
    const journeyId = journeyIdFromTransferzPayloadValue(payload.journeyId);
    const bookingIdStr =
      typeof providerBookingId === "number" && Number.isFinite(providerBookingId)
        ? String(Math.trunc(providerBookingId))
        : typeof providerBookingId === "string" && providerBookingId.trim()
          ? providerBookingId.trim()
          : null;

    if (!isTransferzWarpDriveConfigured() || !bookingIdStr || journeyId == null) {
      return NextResponse.json({ ok: true, journey: null });
    }

    const requestId =
      req.headers.get("x-request-id") ||
      req.headers.get("X-Request-ID") ||
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    const getRes = await transferzPartnerGet(`/partners/bookings/${encodeURIComponent(bookingIdStr)}`, {
      requestId,
    });
    if (!getRes.ok) {
      const msg = (await transferzReadErrorMessage(getRes)) || `HTTP ${getRes.status}`;
      return NextResponse.json(
        { ok: false, error: msg || "Could not load booking from the transfer provider." },
        { status: 502 }
      );
    }

    const body = (await getRes.json().catch(() => null)) as unknown;
    const journey = pickJourneyFromBookingBody(body, journeyId);
    return NextResponse.json({ ok: true, journey: journey ?? null });
  } catch (e: unknown) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; bookingId: string }> }
) {
  try {
    const { id: itineraryId, bookingId } = await context.params;
    if (!itineraryId || !bookingId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const gate = await assertItineraryOwnedBySession(supabase, itineraryId);
    if (!gate.ok) return gate.response;

    const { data: row, error: rowErr } = await supabase
      .from("itinerary_transferz_bookings")
      .select("id, payload, title, activity_date")
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId)
      .maybeSingle();

    if (rowErr) {
      return NextResponse.json({ ok: false, error: rowErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
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
      return NextResponse.json(
        {
          ok: false,
          error:
            "This transfer row is missing provider booking or journey identifiers. Remove it only after the provider booking is resolved, or contact support.",
          code: "MISSING_PROVIDER_IDS",
        },
        { status: 409 }
      );
    }

    if (isTransferzWarpDriveConfigured()) {
      const getRes = await transferzPartnerGet(
        `/partners/bookings/${encodeURIComponent(bookingIdStr)}`
      );
      if (!getRes.ok) {
        const msg = (await transferzReadErrorMessage(getRes)) || `HTTP ${getRes.status}`;
        return NextResponse.json(
          {
            ok: false,
            error: `Could not verify cancellation with the transfer provider: ${msg}`,
            code: "PROVIDER_VERIFY_FAILED",
          },
          { status: 502 }
        );
      }
      const body = (await getRes.json().catch(() => null)) as unknown;
      const j = pickJourneyFromBookingBody(body, journeyId);
      const st = j && typeof j.status === "string" ? j.status : null;
      if (!isTransferzJourneyCanceledStatus(st)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "This transfer is still active at the provider. Cancel it first (Cancel reservation), wait for confirmation, then remove it from the itinerary.",
            code: "PROVIDER_NOT_CANCELED",
          },
          { status: 409 }
        );
      }
    } else if (!isTransferzJourneyCanceledStatus(typeof payload.journeyStatus === "string" ? payload.journeyStatus : null)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Transfer provider is not configured; cannot confirm cancellation. Cancel the transfer in the provider portal, or configure the server, then try again.",
          code: "CANNOT_VERIFY_CANCEL",
        },
        { status: 503 }
      );
    }

    const nextPayload = markTransferzBookingRemovedFromItinerary(payload);

    const { error } = await supabase
      .from("itinerary_transferz_bookings")
      .update({ payload: nextPayload })
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    try {
      await pruneItineraryPdfFieldsAfterActivityRemoved(supabase, {
        itineraryId,
        title: (row as { title?: string | null }).title,
        activityDate: (row as { activity_date?: string | null }).activity_date,
      });
    } catch (pruneErr) {
      transferLog.error("booking.soft_remove_pdf_prune_failed", pruneErr, { itineraryId, bookingId });
    }

    transferLog.info("booking.soft_removed", {
      itineraryId,
      bookingId,
      providerBookingId: bookingIdStr,
      journeyId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const mismatch = transferzGatewayWarpMismatchMessage(e);
    if (mismatch) {
      return NextResponse.json({ ok: false, error: mismatch }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
