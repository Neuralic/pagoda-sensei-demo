"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { formatYen } from "@/lib/booking-price-confirmation";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  quotedPrice?: number | null;
  currentPrice?: number | null;
  onConfirmed?: () => void;
};

export function ConfirmBookingPriceModal({
  isOpen,
  onClose,
  jobId,
  quotedPrice,
  currentPrice,
  onConfirmed,
}: Props) {
  const suggested =
    currentPrice != null && Number.isFinite(Number(currentPrice))
      ? Math.round(Number(currentPrice))
      : quotedPrice != null && Number.isFinite(Number(quotedPrice))
        ? Math.round(Number(quotedPrice))
        : 0;
  const [price, setPrice] = useState(String(suggested));
  // Tickets and fees the guide buys for the client. Kept separate from their own price so no
  // commission is charged on a train fare Pagoda merely reimburses.
  const [passThrough, setPassThrough] = useState("");
  const [passThroughNote, setPassThroughNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrice(String(suggested));
      setPassThrough("");
      setPassThroughNote("");
    }
  }, [isOpen, suggested]);

  const carried = passThrough.trim() === "" ? 0 : Number(passThrough);
  const carriedValid = Number.isFinite(carried) && carried >= 0;
  const invoiceTotal = Number(price) + (carriedValid ? carried : 0);

  const handleSubmit = async () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid price of 0 or more.");
      return;
    }
    if (!carriedValid) {
      toast.error("Enter a valid ticket or fee amount of 0 or more.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/confirm-booking-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          guide_price: n,
          ...(carried > 0
            ? {
                pass_through_cost: carried,
                pass_through_note: passThroughNote.trim() || null,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not confirm price");
      }
      toast.success(
        data.message ||
          "Price confirmed. Please send Pagoda an invoice for this amount."
      );
      onConfirmed?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm price");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6">
        <h2 className="text-lg font-semibold text-foreground">Confirm this tour’s price</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The advisor is ready to book. Confirm the live price for this tour. If it has changed
          from the Tour Library, enter the amount Pagoda should use (markup and the advisor’s
          commission are applied automatically). Confirming also books the tour and asks you to
          invoice Pagoda.
        </p>
        {(quotedPrice != null || currentPrice != null) && (
          <p className="mt-3 text-sm">
            Quoted / current:{" "}
            <span className="font-medium tabular-nums">
              {formatYen(currentPrice ?? quotedPrice)}
            </span>
          </p>
        )}
        <label className="mt-4 block text-sm font-medium">Your price for this service (¥)</label>
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          className="mt-1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={loading}
        />

        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <label className="block text-sm font-medium text-emerald-900">
            Tickets or fees you pay for the client (¥)
          </label>
          <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
            Train tickets, entrance fees — anything you buy on the client&apos;s behalf. Leave
            blank if there are none. You are reimbursed in full: Pagoda takes no commission on
            these, so keep them out of the price above.
          </p>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            className="mt-2 bg-white"
            placeholder="0"
            value={passThrough}
            onChange={(e) => setPassThrough(e.target.value)}
            disabled={loading}
          />
          {carried > 0 && (
            <>
              <Input
                type="text"
                className="mt-2 bg-white"
                placeholder="What they cover, e.g. 2 x Shinkansen Tokyo–Kyoto reserved"
                value={passThroughNote}
                onChange={(e) => setPassThroughNote(e.target.value)}
                disabled={loading}
                maxLength={300}
              />
              <p className="mt-2 text-sm font-medium text-emerald-900">
                You will invoice Pagoda {formatYen(invoiceTotal)}
              </p>
            </>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90"
            onClick={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? "Confirming…" : "Confirm price & booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
