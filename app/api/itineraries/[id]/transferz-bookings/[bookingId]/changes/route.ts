import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { utcTimestampFromActivityDateAndHHMM } from "@/lib/itinerary-activity-timestamps";
import {
  addMinutesHHMM,
  isTransferzWarpDriveConfigured,
  journeyIdFromTransferzPayloadValue,
  mergeTransferzPayloadFromJourney,
  pickJourneyFromBookingBody,
  sanitizeTransferzJourneyChangeBody,
  transferzGatewayWarpMismatchMessage,
  transferzPartnerGet,
  transferzPartnerPostJson,
  transferzPartnerPostNoBody,
  transferzReadErrorMessage,
  wallDateAndHHMMFromPickupDateIso,
  isTransferzJourneyCanceledStatus,
  transferzPastFreeCancellationDeadline,
} from "@/lib/transferz";
import {
  notifyAgentTransferzByUserId,
  transferzPayloadRefsForAgentEmail,
} from "@/lib/notify-agent-transferz-email";
import { getTransferzPlatformCommissionPct } from "@/lib/transferz/platform-commission-settings";
import { assertItineraryOwnedBySession } from "@/lib/itinerary-access";

export const runtime = "nodejs";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Modify a Transferz journey (Warp Drive), then pay change on invoice if required,
 * refresh GET booking, and update the itinerary transfer row.
 *
 * @see https://developers.transferz.com/reference/createjourneychange
 * @see https://developers.transferz.com/reference/payforjourneychangeoninvoice
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; bookingId: string }> }) {
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
        scenario: "transfer_modify_failed",
        itineraryId,
        errorMessage: "Transfer provider is not configured on the server.",
      });
      return NextResponse.json(
        { ok: false, error: "Transfer provider is not configured on the server." },
        { status: 503 }
      );
    }

    const bodyRaw = (await req.json().catch(() => null)) as unknown;
    const sanitized = sanitizeTransferzJourneyChangeBody(bodyRaw);
    if (!sanitized) {
      return NextResponse.json(
        { ok: false, error: "Provide at least one allowed field to modify (pickupDate, travellerInfo, driverComments, travelAddons)." },
        { status: 400 }
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
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        errorMessage: "This transfer is missing provider booking or journey identifiers.",
      });
      return NextResponse.json(
        {
          ok: false,
          error: "This transfer is missing provider booking or journey identifiers.",
        },
        { status: 409 }
      );
    }

    const requestId =
      req.headers.get("x-request-id") ||
      req.headers.get("X-Request-ID") ||
      (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    const getBooking = async (): Promise<{ ok: true; body: unknown } | { ok: false; msg: string }> => {
      const getRes = await transferzPartnerGet(`/partners/bookings/${encodeURIComponent(bookingIdStr)}`, {
        requestId,
      });
      if (!getRes.ok) {
        const msg = (await transferzReadErrorMessage(getRes)) || `HTTP ${getRes.status}`;
        return { ok: false, msg };
      }
      const b = (await getRes.json().catch(() => null)) as unknown;
      return { ok: true, body: b };
    };

    const before = await getBooking();
    if (!before.ok) {
      const err = before.msg || "Could not load booking from the transfer provider.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
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

    const jBefore = pickJourneyFromBookingBody(before.body, journeyId);
    const statusBefore = jBefore && typeof jBefore.status === "string" ? jBefore.status : null;
    if (isTransferzJourneyCanceledStatus(statusBefore)) {
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(payload),
        errorMessage: "This journey is canceled at the provider and cannot be modified.",
      });
      return NextResponse.json(
        { ok: false, error: "This journey is canceled at the provider and cannot be modified." },
        { status: 409 }
      );
    }

    const cdBefore = jBefore?.cancellationDetails;
    const pastFreeCancel = transferzPastFreeCancellationDeadline(cdBefore);
    if (pastFreeCancel) {
      if (typeof sanitized.pickupDate === "string") {
        const err =
          "Pickup date or time cannot be changed after the free cancellation period. You can still update flight number, traveller contact details, or driver comments.";
        notifyAgentTransferzByUserId(ownerUserId, {
          scenario: "transfer_modify_failed",
          itineraryId,
          itineraryName,
          transferTitle: typeof row.title === "string" ? row.title : null,
          ...transferzPayloadRefsForAgentEmail(payload),
          errorMessage: err,
        });
        return NextResponse.json(
          {
            ok: false,
            error: err,
            code: "PICKUP_LOCKED_AFTER_FREE_CANCELLATION",
          },
          { status: 422 }
        );
      }
      if ("travelAddons" in sanitized) {
        const err =
          "Travel add-ons cannot be changed after the free cancellation period. You can still update flight number, traveller contact details, or driver comments.";
        notifyAgentTransferzByUserId(ownerUserId, {
          scenario: "transfer_modify_failed",
          itineraryId,
          itineraryName,
          transferTitle: typeof row.title === "string" ? row.title : null,
          ...transferzPayloadRefsForAgentEmail(payload),
          errorMessage: err,
        });
        return NextResponse.json(
          {
            ok: false,
            error: err,
            code: "ADDONS_LOCKED_AFTER_FREE_CANCELLATION",
          },
          { status: 422 }
        );
      }
    }

    const jid = encodeURIComponent(String(journeyId));
    const modifyRes = await transferzPartnerPostJson(`/partners/journeys/${jid}/changes`, sanitized, {
      requestId,
    });

    if (!modifyRes.ok) {
      const msg = (await transferzReadErrorMessage(modifyRes)) || `HTTP ${modifyRes.status}`;
      const err = msg || "Modify journey failed.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(payload),
        errorMessage: err,
      });
      return NextResponse.json(
        { ok: false, error: err },
        { status: modifyRes.status >= 400 && modifyRes.status < 600 ? modifyRes.status : 502 }
      );
    }

    const changeJson = (await modifyRes.json().catch(() => null)) as unknown;
    if (!isRecord(changeJson)) {
      const err = "Provider returned an unexpected response for journey change.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
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

    const changeId = changeJson.changeId;
    const changeIdStr =
      typeof changeId === "number" && Number.isFinite(changeId)
        ? String(Math.trunc(changeId))
        : typeof changeId === "string" && changeId.trim()
          ? changeId.trim()
          : null;

    if (!changeIdStr) {
      const err = "Provider did not return a change id.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
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

    const additionalPaymentRequired = changeJson.additionalPaymentRequired === true;
    if (additionalPaymentRequired) {
      /** @see https://developers.transferz.com/reference/payforjourneychangeoninvoice */
      const payRes = await transferzPartnerPostNoBody(
        `/partners/journeys/${jid}/changes/${encodeURIComponent(changeIdStr)}/pay-by-invoice`,
        { requestId }
      );
      if (!payRes.ok) {
        const msg = (await transferzReadErrorMessage(payRes)) || `HTTP ${payRes.status}`;
        const err = msg || "Journey change requires payment; pay-by-invoice failed.";
        notifyAgentTransferzByUserId(ownerUserId, {
          scenario: "transfer_modify_failed",
          itineraryId,
          itineraryName,
          transferTitle: typeof row.title === "string" ? row.title : null,
          ...transferzPayloadRefsForAgentEmail(payload),
          errorMessage: err,
          extraNote: "Additional payment was required for this change but invoicing failed.",
        });
        return NextResponse.json(
          {
            ok: false,
            error: err,
            changeId: changeIdStr,
            additionalPaymentRequired: true,
            previousPrice: changeJson.previousPrice,
            newPrice: changeJson.newPrice,
          },
          { status: payRes.status >= 400 && payRes.status < 600 ? payRes.status : 502 }
        );
      }
      await payRes.json().catch(() => null);
    }

    const after = await getBooking();
    if (!after.ok) {
      const err = after.msg || "Change submitted but could not reload the booking from the provider.";
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(payload),
        errorMessage: err,
        extraNote: additionalPaymentRequired
          ? "The provider may have applied the change; check Transferz or contact support."
          : null,
      });
      return NextResponse.json(
        {
          ok: false,
          error: err,
          change: changeJson,
        },
        { status: 502 }
      );
    }

    const jFinal = pickJourneyFromBookingBody(after.body, journeyId);
    const commissionPct = await getTransferzPlatformCommissionPct(supabase);
    let merged = mergeTransferzPayloadFromJourney(payload, jFinal, commissionPct);

    if (typeof sanitized.pickupDate === "string") {
      const wall = wallDateAndHHMMFromPickupDateIso(sanitized.pickupDate);
      if (wall) {
        merged = {
          ...merged,
          pickupWallDate: wall.date,
          pickupStartLocalHHMM: wall.hhmm,
          pickupEndLocalHHMM: addMinutesHHMM(wall.hhmm, 120),
        };
      }
    }

    const ti = isRecord(sanitized.travellerInfo) ? sanitized.travellerInfo : null;
    if (ti) {
      const fn = typeof ti.flightNumber === "string" ? ti.flightNumber.trim() : "";
      if (fn) merged = { ...merged, travellerFlightNumber: fn };
      const tFirst = typeof ti.firstName === "string" ? ti.firstName.trim() : "";
      if (tFirst) merged = { ...merged, travellerFirst: tFirst };
      const tLast = typeof ti.lastName === "string" ? ti.lastName.trim() : "";
      if (tLast) merged = { ...merged, travellerLast: tLast };
      const tEmail = typeof ti.email === "string" ? ti.email.trim() : "";
      if (tEmail) merged = { ...merged, travellerEmail: tEmail };
      const tPhone = typeof ti.phone === "string" ? ti.phone.trim() : "";
      if (tPhone) merged = { ...merged, travellerPhone: tPhone };
    }

    if ("driverComments" in sanitized && typeof sanitized.driverComments === "string") {
      merged = { ...merged, driverCommentsLastChange: sanitized.driverComments.trim() };
    }

    const updateRow: Record<string, unknown> = { payload: merged };
    if (typeof sanitized.pickupDate === "string") {
      const wall = wallDateAndHHMMFromPickupDateIso(sanitized.pickupDate);
      if (wall) {
        const startTs = utcTimestampFromActivityDateAndHHMM(wall.date, wall.hhmm);
        const endH = addMinutesHHMM(wall.hhmm, 120);
        const endTs = utcTimestampFromActivityDateAndHHMM(wall.date, endH);
        if (startTs && endTs) {
          updateRow.activity_date = wall.date;
          updateRow.start_time = startTs;
          updateRow.end_time = endTs;
        }
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from("itinerary_transferz_bookings")
      .update(updateRow)
      .eq("id", bookingId)
      .eq("itinerary_id", itineraryId)
      .select("*")
      .single();

    if (upErr) {
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "transfer_modify_failed",
        itineraryId,
        itineraryName,
        transferTitle: typeof row.title === "string" ? row.title : null,
        ...transferzPayloadRefsForAgentEmail(merged),
        errorMessage: upErr.message || "Could not update itinerary after a successful provider change.",
        extraNote:
          "The transfer provider may have applied your changes; verify in Transferz and refresh the itinerary.",
      });
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const updatedPayload =
      updated.payload && typeof updated.payload === "object" && !Array.isArray(updated.payload)
        ? (updated.payload as Record<string, unknown>)
        : merged;
    notifyAgentTransferzByUserId(ownerUserId, {
      scenario: "transfer_modified",
      itineraryId,
      itineraryName,
      transferTitle: typeof updated.title === "string" ? updated.title : null,
      ...transferzPayloadRefsForAgentEmail(updatedPayload),
      extraNote: additionalPaymentRequired
        ? "An additional charge was invoiced for this change."
        : null,
    });

    return NextResponse.json({
      ok: true,
      change: changeJson,
      booking: updated,
      /** True when the modify response required extra payment and we successfully called pay-by-invoice. */
      additionalPaymentInvoiced: additionalPaymentRequired,
    });
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
            scenario: "transfer_modify_failed",
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
    console.error("[transferz-bookings/changes]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
