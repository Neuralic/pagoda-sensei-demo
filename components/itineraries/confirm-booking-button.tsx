"use client";

import { useState, useEffect } from "react";
import { CheckCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";

type Props = {
  jobId: string;
  role: "agent" | "guide";
  offerStatus?: string | null;
  priceConfirmationStatus?: string | null;
  /** Last time the guide's email actually went out. null = they have never been reached. */
  priceConfirmationLastNotifiedAt?: string | null;
  onRequested?: () => void;
  onConfirmed?: () => void;
  /** Pagoda admin viewing on the advisor's behalf — unlocks "Mark as booked". */
  isAdmin?: boolean;
  className?: string;
  /** Compact chip/button for tour row on edit-itinerary (sidebar keeps full help text). */
  compact?: boolean;
};

type PendingAction = "resend" | "cancel" | "mark_booked";

export function ConfirmBookingButton({
  jobId,
  role,
  priceConfirmationStatus,
  priceConfirmationLastNotifiedAt,
  onRequested,
  onConfirmed,
  isAdmin = false,
  className,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markBookedOpen, setMarkBookedOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(priceConfirmationStatus ?? null);
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | null>(
    priceConfirmationLastNotifiedAt ?? null
  );

  useEffect(() => {
    setStatus(priceConfirmationStatus ?? null);
  }, [priceConfirmationStatus]);

  useEffect(() => {
    setLastNotifiedAt(priceConfirmationLastNotifiedAt ?? null);
  }, [priceConfirmationLastNotifiedAt]);

  const booked = status === "confirmed";
  const waiting = !booked && (status === "requested" || priceConfirmationStatus === "requested");

  /**
   * The advisor's real question is "has the guide actually been told?" — a pending status on
   * its own never answered it, which is how tours sat waiting on an email that never sent.
   */
  const notifiedLabel = lastNotifiedAt
    ? `Guide last emailed ${new Date(lastNotifiedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}.`
    : "The guide has not been emailed yet — send the request again.";

  /** Server tells us whether the email really went out; never claim a send we did not see. */
  const reportSendOutcome = (data: {
    emailSent?: boolean;
    message?: string;
    cooldown?: boolean;
  }) => {
    if (data.cooldown) {
      toast(data.message || "Already sent a moment ago.");
      return;
    }
    if (data.emailSent === false) {
      toast.error(data.message || "The guide could not be emailed.");
      return;
    }
    toast.success(data.message || "Reminder sent to the guide.");
  };

  const postAction = async (action: PendingAction) => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/confirm-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not update this booking request");
      }

      if (action === "cancel") {
        setStatus(null);
        onRequested?.();
        toast.success(data.message || "Request canceled.");
      } else if (action === "mark_booked") {
        setStatus("confirmed");
        onConfirmed?.();
        toast.success(data.message || "Marked as officially booked.");
      } else {
        if (data.emailSent) setLastNotifiedAt(new Date().toISOString());
        if (!data.cooldown) onRequested?.();
        reportSendOutcome(data);
      }
      setMarkBookedOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update this booking request");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/confirm-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not request booking confirmation");
      }
      if (data.alreadyConfirmed) {
        setStatus("confirmed");
        onConfirmed?.();
        toast.success(data.message || "This tour is already officially booked.");
      } else {
        setStatus("requested");
        if (data.emailSent) setLastNotifiedAt(new Date().toISOString());
        if (!data.cooldown) onRequested?.();
        // The server resends when a request is already pending, so this covers both the
        // first ask and a repeat press on a row still waiting on the guide.
        if (data.emailSent === false || data.cooldown) {
          reportSendOutcome(data);
        } else {
          toast.success(
            data.message ||
              "The guide has been asked to confirm this tour’s current price."
          );
        }
      }
      setDialogOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not request booking confirmation";
      const hint =
        message.includes("No guide is linked") || message.includes("Tour Library")
          ? " Import the tour from Agent → Tour Library instead of using a custom activity line."
          : "";
      toast.error(message + hint);
    } finally {
      setLoading(false);
    }
  };

  if (role === "guide") {
    return null;
  }

  if (booked) {
    return (
      <span
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 shrink-0"
            : "inline-flex items-center gap-1 text-sm font-medium text-green-700"
        }
      >
        <CheckCircle className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {compact ? "Booked" : "Officially booked"}
      </span>
    );
  }

  if (waiting) {
    const menu = (
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          <span className={lastNotifiedAt ? undefined : "text-amber-800"}>{notifiedLabel}</span>
          <br />
          They should open the link in that email and sign in as a guide (not advisor).
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            void postAction("resend");
          }}
        >
          Resend request to guide
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            void postAction("cancel");
          }}
        >
          Cancel request
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                setMarkBookedOpen(true);
              }}
            >
              Mark as booked (admin)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    );

    const markBookedDialog = (
      <AlertDialog open={markBookedOpen} onOpenChange={setMarkBookedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this tour as officially booked?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this only when the guide has confirmed outside the platform. The booking becomes
              official at the guide’s current price, and they will be asked to send Pagoda an invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                void postAction("mark_booked");
              }}
            >
              {loading ? "Saving…" : "Mark as booked"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    if (compact) {
      return (
        <>
          <span className="inline-flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 disabled:opacity-60"
                  title={notifiedLabel}
                >
                  {loading ? "Working…" : "Awaiting guide"}
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              {menu}
            </DropdownMenu>
            {/* Kept out of the dropdown on purpose: advisors did not find Resend in there and
                concluded the only way to reach a guide was to re-add the tour. */}
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                void postAction("resend");
              }}
              className="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium text-amber-900 underline underline-offset-2 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 disabled:opacity-60"
              title={notifiedLabel}
            >
              Resend
            </button>
          </span>
          {markBookedDialog}
        </>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center text-sm font-medium text-amber-800">
            Waiting for guide to confirm price
          </span>
          <span
            className={`text-xs max-w-md ${
              lastNotifiedAt ? "text-muted-foreground" : "font-medium text-amber-800"
            }`}
          >
            {notifiedLabel}
          </span>
          <span className="text-xs text-muted-foreground max-w-md">
            The guide should open the link in their email and sign in as a guide (not advisor).
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                void postAction("resend");
              }}
            >
              Resend request
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                void postAction("cancel");
              }}
            >
              Cancel request
            </Button>
            {isAdmin && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  setMarkBookedOpen(true);
                }}
              >
                Mark as booked
              </Button>
            )}
          </div>
        </div>
        {markBookedDialog}
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={compact ? "default" : "outline"}
        className={
          compact
            ? `shrink-0 cursor-pointer border-0 bg-green-600 font-semibold text-white shadow-sm hover:bg-green-700 focus-visible:ring-green-600/40 ${className ?? ""}`
            : className
        }
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
      >
        {loading ? "Sending…" : compact ? (
          <>
            <span className="hidden sm:inline">Confirm booking</span>
            <span className="sm:hidden">Confirm</span>
          </>
        ) : (
          "Confirm booking"
        )}
      </Button>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The guide will be asked to confirm the current price for this tour (it may differ
              from the Tour Library). After they confirm, the booking is official and they will
              be instructed to send Pagoda an invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {loading ? "Sending…" : "Ask guide to confirm price"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
