"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmBookingPriceModal } from "@/components/itineraries/confirm-booking-price-modal";

type Context = {
  jobId: string;
  jobName: string;
  itineraryName: string | null;
  itineraryStatus: string | null;
  priceConfirmationStatus: string | null;
  quotedPrice: number | null;
  quotedPriceLabel: string;
  currentGuidePrice: number | null;
  canConfirm: boolean;
  alreadyConfirmed: boolean;
};

function GuideConfirmBookingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsGuideLogin, setNeedsGuideLogin] = useState(false);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setError("Missing tour reference. Use the link from your booking confirmation email.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNeedsGuideLogin(false);
      try {
        const res = await fetch(
          `/api/jobs/confirm-booking-context?jobId=${encodeURIComponent(jobId)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (res.status === 401) {
          router.replace(
            `/guide/login?redirect=${encodeURIComponent(`/guide/confirm-booking?jobId=${jobId}`)}`
          );
          return;
        }

        if (!res.ok || !data?.ok) {
          if (data?.needsGuideLogin) {
            setNeedsGuideLogin(true);
            setError(
              data?.error ||
                "Sign in with your guide account to confirm this tour’s price."
            );
          } else {
            setError(data?.error || "Could not load this booking request.");
          }
          return;
        }

        const context: Context = {
          jobId: data.jobId,
          jobName: data.jobName,
          itineraryName: data.itineraryName ?? null,
          itineraryStatus: data.itineraryStatus ?? null,
          priceConfirmationStatus: data.priceConfirmationStatus ?? null,
          quotedPrice: data.quotedPrice ?? null,
          quotedPriceLabel: data.quotedPriceLabel ?? "—",
          currentGuidePrice: data.currentGuidePrice ?? null,
          canConfirm: Boolean(data.canConfirm),
          alreadyConfirmed: Boolean(data.alreadyConfirmed),
        };
        setCtx(context);
        setConfirmed(context.alreadyConfirmed);
        if (context.canConfirm) {
          setModalOpen(true);
        }
      } catch {
        if (!cancelled) setError("Could not load this booking request.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, router]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AA25]" />
        <p className="text-sm">Loading booking confirmation…</p>
      </div>
    );
  }

  if (needsGuideLogin) {
    return (
      <div className="max-w-lg mx-auto py-16 px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-4">
          <h1 className="text-xl font-semibold text-amber-950">Guide sign-in required</h1>
          <p className="text-sm text-amber-900">{error}</p>
          <p className="text-sm text-amber-800">
            If you opened this link while logged in as a travel advisor, sign out or use a private
            window, then sign in as the <strong>guide</strong> who received the email.
          </p>
          <Button
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-black"
            asChild
          >
            <Link
              href={`/guide/login?redirect=${encodeURIComponent(`/guide/confirm-booking?jobId=${jobId}`)}`}
            >
              Sign in as guide
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (error && !ctx) {
    return (
      <div className="max-w-lg mx-auto py-16 px-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
          <h1 className="text-xl font-semibold text-red-900">Cannot open confirmation</h1>
          <p className="text-sm text-red-800">{error}</p>
          <Button variant="outline" asChild>
            <Link href="/guide/landing">Go to guide home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!ctx) return null;

  const waiting =
    !confirmed &&
    !ctx.canConfirm &&
    ctx.priceConfirmationStatus !== "confirmed";

  return (
    <div className="max-w-lg mx-auto py-10 px-6 space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Confirm tour price</h1>
        {ctx.itineraryName ? (
          <p className="text-sm text-muted-foreground">
            Itinerary: <strong className="text-foreground">{ctx.itineraryName}</strong>
            {ctx.itineraryStatus === "draft" ? (
              <span className="ml-2 text-xs uppercase tracking-wide text-amber-700">
                (draft — you can still confirm here)
              </span>
            ) : null}
          </p>
        ) : null}
        <p className="text-base">
          Tour: <strong>{ctx.jobName}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Quoted price from the Tour Library or bid:{" "}
          <strong className="text-foreground">{ctx.quotedPriceLabel}</strong>
        </p>

        {confirmed || ctx.alreadyConfirmed ? (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">
            <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium">Booking confirmed</p>
              <p>
                This tour is officially booked. Please send Pagoda an invoice for the confirmed
                amount.
              </p>
            </div>
          </div>
        ) : ctx.canConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm the live price (or enter a new amount if it changed). This completes the
              booking and tells you to invoice Pagoda.
            </p>
            <Button
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-black w-full sm:w-auto"
              onClick={() => setModalOpen(true)}
            >
              Confirm price &amp; booking
            </Button>
          </div>
        ) : waiting ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
            The advisor has not requested booking confirmation for this tour yet. Ask them to click
            <strong> Confirm booking </strong> on the itinerary line first.
          </p>
        ) : null}

        <div className="pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/guide/landing">Back to guide home</Link>
          </Button>
        </div>
      </div>

      <ConfirmBookingPriceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        jobId={ctx.jobId}
        quotedPrice={ctx.quotedPrice}
        currentPrice={ctx.currentGuidePrice}
        onConfirmed={() => {
          setConfirmed(true);
          setModalOpen(false);
        }}
      />
    </div>
  );
}

export default function GuideConfirmBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <GuideConfirmBookingInner />
    </Suspense>
  );
}
