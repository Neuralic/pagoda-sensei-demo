import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { utcTimestampFromActivityDateAndHHMM } from "@/lib/itinerary-activity-timestamps";
import { enrichTransferzPayloadWithCommission } from "@/lib/transferz/commission";
import { getTransferzPlatformCommissionPct } from "@/lib/transferz/platform-commission-settings";
import {
  notifyAgentTransferzByUserId,
  transferzPayloadRefsForAgentEmail,
} from "@/lib/notify-agent-transferz-email";
import { assertItineraryOwnedBySession } from "@/lib/itinerary-access";
import { getActiveAdminEmails } from "@/lib/admin-emails";
import { sendAdminTransferzBookedNotification } from "@/lib/mailer";
import { isTransferzBookingRemovedFromItinerary } from "@/lib/transferz/booking-row";
import { transferLog } from "@/lib/ops-log";

export const runtime = "nodejs";

function finitePrice(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && /^-?\d/.test(x.trim())) {
    const n = Number(x.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Rows saved for agent itinerary + PDF; not guide jobs. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: itineraryId } = await context.params;
    if (!itineraryId) {
      return NextResponse.json({ ok: false, error: "Missing itinerary id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const gate = await assertItineraryOwnedBySession(supabase, itineraryId);
    if (!gate.ok) return gate.response;

    const { data, error } = await supabase
      .from("itinerary_transferz_bookings")
      .select("*")
      .eq("itinerary_id", itineraryId)
      .order("start_time", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Database error", detail: error.message },
        { status: 500 }
      );
    }

    const bookings = (data ?? []).filter(
      (row) => !isTransferzBookingRemovedFromItinerary((row as { payload?: unknown }).payload)
    );

    // A payload without providerPrice or price prices to null, and the itinerary line then
    // renders with no amount. Surface it here — from the browser it looks like a row that
    // simply failed to load, and nobody goes looking for a cause.
    const unpriced = bookings.filter((row) => {
      const payload = (row as { payload?: unknown }).payload;
      if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return true;
      const p = payload as Record<string, unknown>;
      const has = (v: unknown) => v != null && v !== "";
      return !has(p.providerPrice) && !has(p.price);
    });
    if (unpriced.length > 0) {
      transferLog.warn("price.missing_payload_fields", {
        itineraryId,
        bookingRowIds: unpriced.map((row) => (row as { id?: string }).id),
        count: unpriced.length,
      });
    }

    return NextResponse.json({ ok: true, bookings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: itineraryId } = await context.params;
    if (!itineraryId) {
      return NextResponse.json({ ok: false, error: "Missing itinerary id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const activityDateISO =
      typeof body.activityDateISO === "string" ? body.activityDateISO.trim() : null;
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const activityType = typeof body.activityType === "string" ? body.activityType.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const supabase = getSupabaseServer();
    const rawPayload =
      body.payload != null && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};
    const commissionPct = await getTransferzPlatformCommissionPct(supabase);
    const payload =
      rawPayload.source === "transferz"
        ? enrichTransferzPayloadWithCommission(rawPayload, commissionPct)
        : rawPayload;

    if (!title || !activityType || !location) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields (title, activityType, location)" },
        { status: 400 }
      );
    }

    const startTs = utcTimestampFromActivityDateAndHHMM(activityDateISO, startTime);
    const endTs = utcTimestampFromActivityDateAndHHMM(activityDateISO, endTime);
    if (!startTs || !endTs) {
      return NextResponse.json({ ok: false, error: "Invalid start or end time" }, { status: 400 });
    }

    const activityDate =
      activityDateISO && /^\d{4}-\d{2}-\d{2}$/.test(activityDateISO.slice(0, 10))
        ? activityDateISO.slice(0, 10)
        : startTs.slice(0, 10);

    const gate = await assertItineraryOwnedBySession(supabase, itineraryId);
    if (!gate.ok) return gate.response;
    const ownerUserId = gate.ownerUserId;

    const insert = {
      itinerary_id: itineraryId,
      created_by: ownerUserId,
      activity_date: activityDate,
      start_time: startTs,
      end_time: endTs,
      title,
      activity_type: activityType,
      location,
      description: description || null,
      payload,
    };

    const { data, error } = await supabase
      .from("itinerary_transferz_bookings")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[itinerary_transferz_bookings] insert", error);
      if (rawPayload.source === "transferz") {
        const { data: itRow } = await supabase
          .from("itineraries")
          .select("name")
          .eq("id", itineraryId)
          .maybeSingle();
        notifyAgentTransferzByUserId(ownerUserId, {
          scenario: "booking_save_failed",
          itineraryId,
          itineraryName: (itRow as { name?: string } | null)?.name ?? null,
          transferTitle: title,
          errorMessage: error.message || "Insert failed",
        });
      }
      return NextResponse.json(
        { ok: false, error: error.message || "Insert failed" },
        { status: 500 }
      );
    }

    if (payload.source === "transferz") {
      const p = payload as Record<string, unknown>;
      const refs = transferzPayloadRefsForAgentEmail(p);
      transferLog.info("booking.saved", {
        itineraryId,
        bookingRowId: data.id,
        providerBookingId: refs.providerBookingId,
        journeyCode: refs.journeyCode,
        createdBy: ownerUserId,
      });
      const { data: itRow } = await supabase
        .from("itineraries")
        .select("name")
        .eq("id", itineraryId)
        .maybeSingle();
      const itineraryName = (itRow as { name?: string } | null)?.name ?? null;
      notifyAgentTransferzByUserId(ownerUserId, {
        scenario: "booking_saved_to_itinerary",
        itineraryId,
        itineraryName,
        transferTitle: title,
        providerBookingId: refs.providerBookingId,
        journeyCode: refs.journeyCode,
      });

      // Admins need a heads-up to invoice the travel advisor.
      void (async () => {
        try {
          const adminEmails = await getActiveAdminEmails();
          if (adminEmails.length === 0) return;
          const { data: agentUser } = await supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", ownerUserId)
            .maybeSingle();
          const agentName =
            [agentUser?.first_name, agentUser?.last_name].filter(Boolean).join(" ").trim() ||
            "Travel advisor";
          await sendAdminTransferzBookedNotification(adminEmails, {
            transferTitle: title,
            itineraryId,
            itineraryName,
            agentName,
            agentEmail: typeof agentUser?.email === "string" ? agentUser.email : null,
            activityDate,
            location,
            providerBookingId: refs.providerBookingId,
            journeyCode: refs.journeyCode,
            customerPrice: finitePrice(p.price),
            currency: typeof p.currency === "string" ? p.currency : null,
          });
        } catch (e) {
          console.error("[itinerary_transferz_bookings] admin invoice email failed", e);
        }
      })();
    }

    return NextResponse.json({ ok: true, booking: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
