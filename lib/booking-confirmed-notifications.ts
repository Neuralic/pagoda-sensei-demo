import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAdminEmails } from "@/lib/admin-emails";
import {
  sendAdminBookingConfirmedNotification,
  sendAdvisorBookingPriceConfirmedEmail,
  sendGuideSendInvoiceInstructionEmail,
} from "@/lib/mailer";
import { formatYen } from "@/lib/booking-price-confirmation";
import {
  advisorMarkupPctForLine,
  loadCommissionForGuide,
  priceLineForCommission,
} from "@/lib/pagoda-pricing";
import { errorBooking } from "@/lib/booking-flow-log";

export type BookingConfirmedBy = "guide" | "agent" | "admin";

/**
 * Guide/advisor/admin emails after a tour becomes officially booked.
 * Lookups and price math are awaited so the caller can return them; the sends
 * themselves are fire-and-forget so a slow SMTP hop never fails the booking.
 */
export async function sendBookingConfirmedNotifications(
  supabase: SupabaseClient,
  opts: {
    jobId: string;
    jobName: string;
    itineraryId: string | null;
    agentId: string;
    guideId: string;
    confirmedPrice: number;
    quotedAtRequest: number | null;
    confirmedByRole: BookingConfirmedBy;
    /** Tickets or fees the guide paid for the client — carried at cost, no commission. */
    passThroughCost?: number | null;
    passThroughNote?: string | null;
  }
): Promise<{ clientPrice: number; priceChanged: boolean; markupPct: number | null }> {
  const {
    jobId,
    jobName,
    itineraryId,
    agentId,
    guideId,
    confirmedPrice,
    quotedAtRequest,
    confirmedByRole,
    passThroughCost = null,
    passThroughNote = null,
  } = opts;

  const [{ data: agentUser }, { data: guideUser }, { data: itinerary }, { data: job }] =
    await Promise.all([
    supabase
      .from("users")
      .select("first_name, last_name, email, default_markup_pct")
      .eq("id", agentId)
      .maybeSingle(),
    supabase.from("users").select("first_name, last_name, email").eq("id", guideId).maybeSingle(),
    itineraryId
      ? supabase.from("itineraries").select("name, markup_pct").eq("id", itineraryId).maybeSingle()
      : Promise.resolve({ data: null }),
    // The guide's invoice has to say which day it is for, or Pagoda cannot match it to a
    // booking without going and looking.
    supabase.from("jobs").select("start_time").eq("id", jobId).maybeSingle(),
  ]);

  const agentName =
    [agentUser?.first_name, agentUser?.last_name].filter(Boolean).join(" ").trim() ||
    "Travel advisor";
  const guideName =
    [guideUser?.first_name, guideUser?.last_name].filter(Boolean).join(" ").trim() || "Guide";
  const itineraryName = (itinerary as { name?: string } | null)?.name ?? null;

  const startTime = (job as { start_time?: string | null } | null)?.start_time ?? null;
  const tourDateLabel = startTime
    ? new Date(startTime).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Tokyo",
      })
    : null;

  // Price the confirmed booking with this guide's live commission — the same numbers the
  // advisor saw on the itinerary line. A hardcoded markup here meant the figure Pagoda
  // invoiced against could differ from the figure the advisor quoted their client.
  const commission = await loadCommissionForGuide(supabase, guideId);
  const markupPct = advisorMarkupPctForLine({
    itineraryMarkupPct: (itinerary as { markup_pct?: number | null } | null)?.markup_pct,
    accountDefaultMarkupPct: (agentUser as { default_markup_pct?: number | null } | null)
      ?.default_markup_pct,
    commission,
  });
  const priced = priceLineForCommission({
    net: confirmedPrice,
    commission,
    markupPct,
    passThroughCost,
  });
  const pagodaToAdvisor = priced.baseDisplayPrice ?? 0;
  const clientPrice = priced.displayPrice ?? 0;
  const priceChanged = quotedAtRequest != null && quotedAtRequest !== confirmedPrice;

  // The two commission amounts, so the invoice can be raised from the email alone rather
  // than recomputing percentages by hand.
  const pagodaCommission = pagodaToAdvisor - confirmedPrice - (priced.passThroughCost || 0);
  const advisorCommission = priced.advisorProfit ?? clientPrice - pagodaToAdvisor;

  const carried = priced.passThroughCost || 0;
  const guideInvoiceTotal = confirmedPrice + carried;

  const quotedLabel = formatYen(quotedAtRequest);
  const confirmedLabel = formatYen(confirmedPrice);
  const clientLabel = formatYen(clientPrice);
  const carriedLabel = carried > 0 ? formatYen(carried) : null;
  const guideInvoiceLabel = formatYen(guideInvoiceTotal);

  void (async () => {
    try {
      const guideEmail = (guideUser as { email?: string } | null)?.email;
      if (guideEmail) {
        await sendGuideSendInvoiceInstructionEmail({
          toEmail: guideEmail,
          guideName,
          agentName,
          jobName,
          itineraryName,
          confirmedPriceLabel: guideInvoiceLabel,
          tourDateLabel,
          servicePriceLabel: carriedLabel ? confirmedLabel : null,
          passThroughLabel: carriedLabel,
          passThroughNote,
        });
      }
    } catch (e) {
      errorBooking("confirmed.guide_invoice_email_failed", e, { jobId, guideId });
    }
  })();

  void (async () => {
    try {
      const agentEmail = (agentUser as { email?: string } | null)?.email;
      if (agentEmail) {
        await sendAdvisorBookingPriceConfirmedEmail({
          toEmail: agentEmail,
          agentName,
          guideName,
          jobName,
          itineraryName,
          clientPriceLabel: clientLabel,
          priceChanged,
        });
      }
    } catch (e) {
      errorBooking("confirmed.advisor_email_failed", e, { jobId, guideId });
    }
  })();

  void (async () => {
    try {
      const adminEmails = await getActiveAdminEmails();
      if (adminEmails.length > 0) {
        await sendAdminBookingConfirmedNotification(adminEmails, {
          jobName,
          jobId,
          agentName,
          guideName,
          confirmedByRole,
          itineraryName,
          quotedGuidePriceLabel: quotedLabel,
          confirmedGuidePriceLabel: confirmedLabel,
          priceChanged,
          pagodaToAdvisorLabel: formatYen(pagodaToAdvisor),
          clientPriceLabel: clientLabel,
          pagodaMarkupPct: commission.commissionMarketplacePct,
          advisorMarkupPct: markupPct,
          pagodaCommissionLabel: formatYen(pagodaCommission),
          advisorCommissionLabel: formatYen(advisorCommission),
          passThroughLabel: carriedLabel,
          passThroughNote,
        });
      }
    } catch (e) {
      errorBooking("confirmed.admin_email_failed", e, { jobId, guideId });
    }
  })();

  return { clientPrice, priceChanged, markupPct };
}
