"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTransferzFreeCancellationSummary } from "@/lib/transferz/journey";
import { transferzCustomerDisplayAmount } from "@/lib/transferz/commission";
import {
  TRANSFERZ_REQUEST_CHANGES_THROUGH_AGENT,
  TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY,
} from "@/lib/transfer-booking-display";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function row(label: string, value: string | null | undefined) {
  if (!value || !String(value).trim()) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 text-sm border-b border-border/60 py-2 last:border-0">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );
}

export type TransferBookingPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  activityType?: string | null;
  /** Short label shown in forms (e.g. Japan). */
  locationLabel?: string | null;
  /** Full address for preview if stored on payload. */
  fullAddress?: string | null;
  description?: string | null;
  payload: Record<string, unknown> | null;
  /** When set, show a control to open the in-app modify journey flow (partner API). */
  onRequestModify?: () => void;
};

export function TransferBookingPreviewModal({
  open,
  onOpenChange,
  title,
  activityType,
  locationLabel,
  fullAddress,
  description,
  payload,
  onRequestModify,
}: TransferBookingPreviewModalProps) {
  const p = payload && isRecord(payload) ? payload : {};
  const payment = isRecord(p.payment) ? p.payment : null;
  const cancelSummary = formatTransferzFreeCancellationSummary(p.cancellationDetails);

  const cust = transferzCustomerDisplayAmount(p);
  const cur = p.currency != null ? String(p.currency) : "";
  const price = cust != null && cur ? `${cust} ${cur}` : null;
  const bookingRef =
    p.bookingCode != null || p.journeyCode != null
      ? `${p.bookingCode ?? "—"} / ${p.journeyCode ?? "—"}`
      : null;
  const travellerUrl =
    typeof p.travellerAppUrl === "string" && p.travellerAppUrl.trim()
      ? p.travellerAppUrl.trim()
      : null;
  const internalNotes =
    typeof p.internalNotes === "string" && p.internalNotes.trim()
      ? p.internalNotes.trim()
      : null;

  const pickup =
    typeof p.pickupWallDate === "string" && p.pickupWallDate
      ? `${p.pickupWallDate} ${typeof p.pickupStartLocalHHMM === "string" ? p.pickupStartLocalHHMM : ""}`.trim()
      : null;

  const pax =
    [p.adults, p.children, p.infants].some((n) => typeof n === "number")
      ? `Adults ${p.adults ?? "—"} · Children ${p.children ?? "—"} · Infants ${p.infants ?? "—"}`
      : null;

  const luggage =
    typeof p.checkedLuggage === "number" || typeof p.carryOnLuggage === "number"
      ? `Checked ${p.checkedLuggage ?? "—"} · Carry-on ${p.carryOnLuggage ?? "—"}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer booking</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal">
            {title}
            {activityType ? ` · ${activityType}` : ""}
          </p>
        </DialogHeader>

        <div className="space-y-1 pt-2">
          {row("Location", locationLabel || null)}
          {row("Full address", fullAddress || null)}
          {row("Pickup", pickup)}
          {row("Passengers", pax)}
          {row("Luggage", luggage)}
          {row("Amount", price)}
          {row("Invoice", payment ? `${String(payment.method ?? "invoice")} (${String(payment.cadence ?? "monthly")})` : null)}
          {row("Invoice status", payment?.status != null ? String(payment.status) : null)}
          {row(
            "Provider status",
            typeof p.journeyStatus === "string" && p.journeyStatus.trim()
              ? p.journeyStatus.trim()
              : null
          )}
          {row("Cancellation policy", cancelSummary)}
          {row("Request changes", TRANSFERZ_REQUEST_CHANGES_THROUGH_AGENT)}
          {row("Provider ref", bookingRef)}
          {travellerUrl ? (
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 text-sm border-b border-border/60 py-2 last:border-0">
              <span className="text-muted-foreground font-medium">Traveller page</span>
              <div className="space-y-1.5 min-w-0">
                <a
                  href={travellerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D4AA25] underline underline-offset-2 break-all block"
                >
                  {travellerUrl}
                </a>
                <p className="text-xs text-muted-foreground leading-snug">{TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY}</p>
              </div>
            </div>
          ) : null}
          {internalNotes ? row("Internal notes", internalNotes) : null}
        </div>

        {description?.trim() ? (
          <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Itinerary description</p>
            <p className="text-sm whitespace-pre-line text-foreground">{description.trim()}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-4">
          {onRequestModify ? (
            <Button type="button" variant="default" className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white" onClick={onRequestModify}>
              Modify with provider
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
