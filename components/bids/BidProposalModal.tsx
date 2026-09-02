"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AgentBidPricingPayload } from "@/lib/tour-price";
import { Users, ReceiptJapaneseYen, AlertTriangle } from "lucide-react";

interface BidProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  applicantId: string;
  /** Optional initial display while loading */
  applicantName?: string;
  proposalText?: string;
}

interface FetchedProposal {
  application: {
    first_name?: string | null;
    last_name?: string | null;
    why?: string | null;
    languages: string[];
    submitted_at?: string | null;
  };
  agentPricing: AgentBidPricingPayload | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function pricingModelLabel(model: AgentBidPricingPayload["pricingModel"]): string {
  switch (model) {
    case "group_rate":
      return "Group rate";
    case "per_person":
      return "Per person";
    default:
      return "Quoted total";
  }
}

export function BidProposalModal({
  isOpen,
  onClose,
  jobId,
  applicantId,
  applicantName: initialName,
  proposalText: initialProposal,
}: BidProposalModalProps) {
  const [data, setData] = useState<FetchedProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !jobId || !applicantId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ jobId, applicantId });
    fetch(`/api/bids/proposal?${params.toString()}`, { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) {
          setError(json.error || "Failed to load proposal");
          setData(null);
          return;
        }
        setData({
          application: json.application,
          agentPricing: json.agentPricing ?? null,
        });
      })
      .catch(() => {
        setError("Failed to load proposal");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [isOpen, jobId, applicantId]);

  const name =
    data?.application?.first_name != null || data?.application?.last_name != null
      ? [data.application.first_name, data.application.last_name]
          .filter(Boolean)
          .join(" ")
      : initialName ?? "Applicant";
  const proposal =
    (data?.application?.why != null ? data.application.why : null) ??
    initialProposal ??
    "";

  const p = data?.agentPricing;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="p-6 pb-2">
          <h2 className="text-xl font-semibold tracking-tight">Bid & proposal</h2>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground px-6 py-6">Loading…</p>
        )}
        {error && !loading && (
          <p className="text-sm text-destructive px-6 py-4">{error}</p>
        )}

        {data && !loading && (
          <div className="px-6 space-y-5 pb-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Guide
              </p>
              <p className="font-medium">{name}</p>
            </div>

            {data.application.languages?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Languages
                </p>
                <p className="text-sm">
                  {data.application.languages.join(", ")}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Proposal
              </p>
              <div className="text-sm text-foreground rounded-lg border bg-muted/30 p-4 whitespace-pre-line">
                {proposal || "No proposal text."}
              </div>
            </div>

            {data.application.submitted_at && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Submitted
                </p>
                <p className="text-sm">
                  {formatDate(data.application.submitted_at)}
                </p>
              </div>
            )}

            {/* Pricing */}
            <div className="rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <ReceiptJapaneseYen className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold text-foreground">
                  Price for your client
                </span>
              </div>

              {p ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-start gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                        Group size (job)
                      </p>
                      <p className="text-foreground">
                        {p.participants.adults} adult{p.participants.adults !== 1 ? "s" : ""}
                        {", "}
                        {p.participants.children} child
                        {p.participants.children !== 1 ? "ren" : ""}
                        {", "}
                        {p.participants.infants} infant
                        {p.participants.infants !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] uppercase tracking-wider font-medium px-2 py-1 rounded-md bg-background border border-border/60 text-muted-foreground">
                      {pricingModelLabel(p.pricingModel)}
                    </span>
                  </div>

                  {p.groupOverMax && (
                    <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Participant count exceeds this tour&apos;s maximum group size. Confirm
                        pricing with the guide before hiring.
                      </span>
                    </div>
                  )}

                  {p.lines && p.lines.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {p.lines.map((line, idx) => (
                        <li
                          key={idx}
                          className="flex justify-between items-start gap-3 border-b border-border/40 last:border-0 pb-2 last:pb-0"
                        >
                          <span className="text-muted-foreground leading-snug">
                            {line.label}
                            {line.count > 1 ? ` × ${line.count}` : ""}
                          </span>
                          <span className="tabular-nums font-medium text-foreground shrink-0">
                            ¥{line.displayAmount.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Detailed line items are shown when the bid matches tour catalog pricing or
                      per-person rates. The total below still reflects the platform formula for this
                      guide.
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/60">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Guide price
                      </p>
                      <p className="text-base font-semibold tabular-nums text-foreground">
                        ¥{p.guideTotal.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        What the guide quoted
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Purchase price
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-foreground">
                        ¥{p.totalInclVat.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        What you are charged
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">
                    No price could be calculated for this bid. The guide may need to update their
                    price, or the job may be missing participant counts.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
