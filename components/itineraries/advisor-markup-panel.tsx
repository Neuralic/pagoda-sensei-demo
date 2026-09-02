"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ADVISOR_MARKUP_PCT,
  MARGIN_STRATEGIES,
  normalizeMarginStrategy,
  sumAdvisorMarkupTotals,
  type MarginStrategy,
} from "@/lib/advisor-markup";
import toast from "react-hot-toast";

type PriceLine = {
  baseDisplayPrice?: number | null;
  displayPrice?: number | null;
  advisorProfit?: number | null;
};

type Props = {
  itineraryId: string;
  markupPct: number | null | undefined;
  marginStrategy: MarginStrategy | null | undefined;
  accountDefaultMarkupPct?: number | null;
  /** Job lines already resolved with base/display/profit (from /api/jobs). */
  priceLines?: PriceLine[];
  onSaved?: (patch: {
    markup_pct: number | null;
    margin_strategy: MarginStrategy | null;
  }) => void;
};

function formatYen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

export function AdvisorMarkupPanel({
  itineraryId,
  markupPct,
  marginStrategy,
  accountDefaultMarkupPct,
  priceLines = [],
  onSaved,
}: Props) {
  const [draftStrategy, setDraftStrategy] = useState<MarginStrategy | null>(
    normalizeMarginStrategy(marginStrategy)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftStrategy(normalizeMarginStrategy(marginStrategy));
  }, [marginStrategy]);

  const totals = useMemo(
    () =>
      sumAdvisorMarkupTotals(
        priceLines.map((l) => ({
          baseDisplayPrice: l.baseDisplayPrice ?? null,
          displayPrice: l.displayPrice ?? null,
          advisorProfit: l.advisorProfit ?? null,
        }))
      ),
    [priceLines]
  );

  // Read from the lines the server already priced, rather than recomputing from a local
  // draft. The commission is set per guide in admin, so the panel reports it; it does not
  // decide it.
  const previewClient = totals.clientTotal;
  const previewProfit = totals.advisorProfitTotal;
  const previewPct =
    totals.supplierNetTotal > 0
      ? Math.round((previewProfit / totals.supplierNetTotal) * 1000) / 10
      : DEFAULT_ADVISOR_MARKUP_PCT;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginStrategy: draftStrategy }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not save");
      }
      const saved = data.itinerary || {};
      onSaved?.({
        // Echoed back untouched: the stored value no longer affects any price, it is kept so
        // an advisor's own margin target survives.
        markup_pct: saved.markup_pct != null ? Number(saved.markup_pct) : null,
        margin_strategy:
          normalizeMarginStrategy(saved.margin_strategy) || draftStrategy,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="text-lg font-semibold text-foreground">
          Mark-up calculator
        </h3>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm text-foreground">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>
            Pagoda price to you{" "}
            <strong>{formatYen(totals.supplierNetTotal)}</strong>
            <span className="text-muted-foreground ml-1">
              (before your markup)
            </span>
          </span>
        </div>
        <div className="font-semibold text-foreground shrink-0">
          Your clients price{" "}
          <span className="text-base">{formatYen(previewClient)}</span>
        </div>
      </div>

      {/*
        The slider used to set the client price. It no longer does: one tour has one sales
        price, set by the commission Pagoda holds for that guide. An advisor moving this
        control was how a tour quoted at ¥14,375 reached a client at ¥14,910, and how a saved
        `0` removed Pagoda's commission from a line altogether. Showing a control that cannot
        change the number would be worse than showing none, so this states the commission
        instead.
      */}
      <div className="space-y-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
        <div className="text-sm font-medium text-emerald-800">
          Your commission {previewPct}% ({formatYen(previewProfit)})
        </div>
        <p className="text-xs text-emerald-900/80 leading-relaxed">
          Pagoda&apos;s commission to you on this itinerary, already included in the client
          price above. It is set per guide by Pagoda, so the same tour costs your client the
          same whoever sells it.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Margin strategy{" "}
          <span className="font-normal">(suggestion only)</span>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {MARGIN_STRATEGIES.map((opt) => {
            const active = draftStrategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setDraftStrategy((prev) =>
                    prev === opt.value ? null : opt.value
                  )
                }
                className={`rounded-md px-2 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-[#0F766E] px-4 py-3.5 text-white">
        <span className="text-sm font-medium">Your margin on this itinerary</span>
        <span className="text-base font-bold">{formatYen(previewProfit)}</span>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          className="rounded-lg bg-[#D4AA25] hover:bg-[#C49A1F] text-white px-5"
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
