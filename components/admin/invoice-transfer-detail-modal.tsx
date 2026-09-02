"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTransferzFreeCancellationSummary } from "@/lib/transferz/journey";
import { transferzCommissionBreakdownFromPayload } from "@/lib/transferz/commission";
import { DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT } from "@/lib/transferz/platform-commission-settings";
import { TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY } from "@/lib/transfer-booking-display";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function fmtTs(iso: string | null | undefined): string | null {
  if (!iso || !String(iso).trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function kv(label: string, value: string | null | undefined) {
  if (!value || !String(value).trim()) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-1 text-sm border-b border-gray-100 py-2 last:border-0">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 break-words">{value}</span>
    </div>
  );
}

export type InvoiceTransferDetailRow = {
  id: string;
  itinerary_id: string;
  itinerary_title?: string | null;
  created_at: string;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  activity_type?: string | null;
  location?: string | null;
  description?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  paymentStatus: string;
  payment?: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
};

export type InvoiceTransferDetailModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: InvoiceTransferDetailRow | null;
  platformCommissionPct?: number;
};

export function InvoiceTransferDetailModal({
  open,
  onOpenChange,
  row,
  platformCommissionPct = DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT,
}: InvoiceTransferDetailModalProps) {
  if (!row) return null;

  const p = row.payload && isRecord(row.payload) ? row.payload : {};
  const pay = row.payment && isRecord(row.payment) ? row.payment : {};

  const dest =
    typeof p.fullDestinationAddress === "string" && p.fullDestinationAddress.trim()
      ? p.fullDestinationAddress.trim()
      : null;
  const destCc =
    typeof p.destinationCountryCode === "string" && p.destinationCountryCode.trim()
      ? p.destinationCountryCode.trim().toUpperCase()
      : null;

  const pickupLocal =
    typeof p.pickupWallDate === "string" && p.pickupWallDate
      ? `${p.pickupWallDate}${typeof p.pickupStartLocalHHMM === "string" ? ` ${p.pickupStartLocalHHMM}` : ""}`.trim() +
        (typeof p.pickupEndLocalHHMM === "string" && p.pickupEndLocalHHMM
          ? ` – ${p.pickupEndLocalHHMM} (local window)`
          : " (local)")
      : null;

  const pax =
    [p.adults, p.children, p.infants].some((n) => typeof n === "number")
      ? `Adults ${p.adults ?? "—"} · Children ${p.children ?? "—"} · Infants ${p.infants ?? "—"}`
      : null;

  const luggage =
    typeof p.checkedLuggage === "number" || typeof p.carryOnLuggage === "number"
      ? `Checked ${p.checkedLuggage ?? "—"} · Carry-on ${p.carryOnLuggage ?? "—"}`
      : null;

  const bookingRef =
    p.bookingCode != null || p.journeyCode != null
      ? `Booking ${p.bookingCode ?? "—"} · Journey ${p.journeyCode ?? "—"}`
      : null;

  const travellerUrl =
    typeof p.travellerAppUrl === "string" && p.travellerAppUrl.trim() ? p.travellerAppUrl.trim() : null;

  const internalNotes =
    typeof p.internalNotes === "string" && p.internalNotes.trim() ? p.internalNotes.trim() : null;

  const currency = p.currency != null ? String(p.currency) : "";
  const tzBreakdown = transferzCommissionBreakdownFromPayload(p, platformCommissionPct);
  const priceProvider =
    tzBreakdown && currency ? `${tzBreakdown.provider.toLocaleString()} ${currency}` : null;
  const priceCommission =
    tzBreakdown && currency
      ? `${tzBreakdown.commission.toLocaleString()} ${currency} (${tzBreakdown.commissionPct}% of provider)`
      : null;
  const priceCustomer =
    tzBreakdown && currency ? `${tzBreakdown.customer.toLocaleString()} ${currency}` : null;

  const bookedBy =
    [row.created_by_name, row.created_by_email].filter(Boolean).join(" · ").trim() || null;

  const invoiceRef = pay.invoiceRef != null ? String(pay.invoiceRef) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer booking details</DialogTitle>
          <p className="text-sm text-gray-500 font-normal">
            {row.title}
            {row.activity_type ? ` · ${row.activity_type}` : ""}
          </p>
        </DialogHeader>

        <div className="space-y-1 pt-2">
          {kv("Itinerary title", row.itinerary_title?.trim() || null)}
          {kv("Itinerary ID", row.itinerary_id)}
          {kv("Record ID", row.id)}
          {kv("Booked at", fmtTs(row.created_at))}
          {kv("Activity date", row.activity_date || null)}
          {kv("Pickup (stored UTC)", fmtTs(row.start_time ?? null))}
          {kv("End (stored UTC)", fmtTs(row.end_time ?? null))}
          {kv("Pickup (local, from booking)", pickupLocal)}
          {kv("Booked by", bookedBy)}
          {kv("Location (label)", row.location || null)}
          {kv("Destination address", dest)}
          {kv("Destination country", destCc)}
          {kv("Passengers", pax)}
          {kv("Luggage", luggage)}
          {kv("Invoice amount (Transferz provider)", priceProvider)}
          {kv("Pagoda platform fee", priceCommission)}
          {kv("Agent-facing total (incl. fee)", priceCustomer)}
          {kv("Invoice status", row.paymentStatus)}
          {kv("Invoice ref", invoiceRef)}
          {kv("Invoice updated", pay.updatedAt != null ? fmtTs(String(pay.updatedAt)) : null)}
          {kv("Invoiced at", pay.invoicedAt != null ? fmtTs(String(pay.invoicedAt)) : null)}
          {kv("Paid at", pay.paidAt != null ? fmtTs(String(pay.paidAt)) : null)}
          {kv("Provider status", typeof p.journeyStatus === "string" ? p.journeyStatus : null)}
          {kv("Cancellation policy", formatTransferzFreeCancellationSummary(p.cancellationDetails))}
          {kv("Provider ref", bookingRef)}
          {kv("Quote ID", p.quoteId != null ? String(p.quoteId) : null)}
          {kv("Transferz booking ID", p.bookingId != null ? String(p.bookingId) : null)}
          {kv("Transferz journey ID", p.journeyId != null ? String(p.journeyId) : null)}
          {internalNotes ? kv("Internal notes", internalNotes) : null}
        </div>

        {travellerUrl ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-1 text-sm border-b border-gray-100 py-2">
            <span className="text-gray-500 font-medium">Traveller page</span>
            <div className="space-y-1.5 min-w-0">
              <a
                href={travellerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4AA25] underline underline-offset-2 break-all block"
              >
                {travellerUrl}
              </a>
              <p className="text-xs text-gray-500 leading-snug">{TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY}</p>
            </div>
          </div>
        ) : null}

        {row.description?.trim() ? (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-medium text-gray-500 mb-1">Description (itinerary)</p>
            <p className="text-sm whitespace-pre-line text-gray-900">{row.description.trim()}</p>
          </div>
        ) : null}

        <div className="flex justify-end pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
