"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MessageCircle, User2Icon, FileText, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import WarningModal from "../warning_modal/warning-modal"
import { useState, useEffect } from "react"
import Image from "next/image"
import ReactCountryFlag from "react-country-flag"
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map"
interface GuideProfileCardProps {
  name: string
  title: string
  applicant_id: string
  rating?: number
  reviews?: number
  tours?: number
  guide_avatar: string
  languages: string[]
  status?: string
  submitted?: Date | string | null
  onViewProfile?: () => void
  onMessage?: () => void
  guide_price?: number
  hire_id?: string
  offer_status?: string
  userRole?: string
  is_candidate?: boolean
  /** When true, show "Final candidate" (for itinerary PDF); otherwise "Candidate" */
  is_finalist?: boolean
  jobId?: string
  onCandidateChange?: () => void
  /** Agent view: platform total price (guide + commissions + VAT) */
  total_price?: number | null
  /** Agent view: short proposal preview */
  proposalSnippet?: string | null
  /** Agent view: open full bid proposal modal */
  onViewProposal?: () => void
  /** Agent view: open modal to request guide to update price (sends email) */
  onRequestPriceUpdate?: () => void
}

export function GuideProfileCard({
  name,
  title,
  guide_avatar,
  languages,
  onViewProfile,
  applicant_id,
  onMessage,
  guide_price,
  hire_id,
  offer_status,
  userRole,
  is_candidate,
  is_finalist,
  jobId: propJobId,
  onCandidateChange,
  total_price,
  proposalSnippet,
  onViewProposal,
  onRequestPriceUpdate,
}: GuideProfileCardProps) {

  const [warningModal, setWarningModal] = useState<boolean>(false);
  const [localHireId, setLocalHireId] = useState<string | undefined>(hire_id);
  const [localOfferStatus, setLocalOfferStatus] = useState<string | undefined>(offer_status);
  const [localIsCandidate, setLocalIsCandidate] = useState<boolean | undefined>(is_candidate);
  const params = useSearchParams();
  const jobId = propJobId || params.get("jobId");

  // Sync from props when parent refetches (e.g. after selecting finalist on another page)
  useEffect(() => {
    setLocalHireId(hire_id);
    setLocalOfferStatus(offer_status);
    setLocalIsCandidate(is_candidate);
  }, [hire_id, offer_status, is_candidate]);

  const sendOffer = async () => {
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, applicant_id }),
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error || "Failed to send offer");
    }
    setLocalOfferStatus("offered");
    setWarningModal(false);
    toast.success("🎉 Offer sent successfully!", {
      duration: 2000,
    });
  };

  const hireUser = async () => {
    const res = await fetch("/api/hire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, applicant_id }),
    });

    const data = await res.json();

    if (!res.ok) {
      return alert(data.error);
    }
    setLocalHireId(applicant_id);
    setLocalOfferStatus("completed");
    setWarningModal(false)
    toast.success("🎉 Guide hired successfully!", {
      duration: 2000,
    });
    if (onCandidateChange) {
      onCandidateChange();
    }
  };

  const selectCandidate = async () => {
    if (!jobId) {
      toast.error("Job ID is required");
      return;
    }

    const res = await fetch("/api/jobs/candidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, applicant_id }),
    });

    const data = await res.json();

    if (!res.ok) {
      return toast.error(data.error || "Failed to select candidate");
    }

    setLocalIsCandidate(true);
    setLocalOfferStatus("candidate");
    toast.success("✅ Candidate selected successfully!", {
      duration: 2000,
    });
    if (onCandidateChange) {
      onCandidateChange();
    }
  };

  const removeCandidate = async () => {
    if (!jobId) {
      toast.error("Job ID is required");
      return;
    }

    const res = await fetch(`/api/jobs/candidate?jobId=${jobId}&applicantId=${applicant_id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      return toast.error(data.error || "Failed to remove candidate");
    }

    setLocalIsCandidate(false);
    setLocalOfferStatus("pending");
    toast.success("Candidate removed successfully", {
      duration: 2000,
    });
    if (onCandidateChange) {
      onCandidateChange();
    }
  };

  const getCountryCode = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    return LANGUAGE_FLAG_MAP[key];
  };


  return (
    <Card className="w-full max-w-sm h-full border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow min-h-0">
      {(userRole === "agent" || userRole === "agency") &&
        (total_price != null || guide_price != null || onViewProposal) && (
        <div className="bg-primary/5 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-end gap-4 min-w-0">
              {guide_price != null && guide_price > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Guide price
                  </p>
                  <p className="text-base font-semibold tabular-nums text-foreground">
                    ¥{guide_price.toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Purchase price
                </p>
                {total_price != null && total_price > 0 ? (
                  <p className="text-xl font-bold tabular-nums text-foreground">
                    ¥{total_price.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not set</p>
                )}
              </div>
            </div>
            {onViewProposal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewProposal}
                className="shrink-0 cursor-pointer gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
              >
                <FileText className="h-4 w-4 shrink-0" />
                View bid & proposal
              </Button>
            )}
          </div>
          {proposalSnippet && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
              {proposalSnippet}
            </p>
          )}
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
      {/* Profile header: avatar, name, status, View Profile */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="h-20 w-20 shrink-0 rounded-full border-2 border-border overflow-hidden relative bg-muted flex items-center justify-center">
            {guide_avatar ? <Image src={guide_avatar} alt={name} fill className="object-cover" /> : <User2Icon className="h-10 w-10 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
              {(localOfferStatus === "hired" || localOfferStatus === "completed" || localHireId) ? (
                <Badge variant="default" className="bg-amber-500 text-white text-xs shrink-0">
                  Hired
                </Badge>
              ) : (localIsCandidate || is_finalist) ? (
                (() => {
                  const isFinalist = is_finalist === true;
                  const label = isFinalist
                    ? "Final candidate"
                    : localIsCandidate
                      ? "Candidate"
                      : localOfferStatus === "accepted"
                        ? "Accepted"
                        : "Candidate";
                  const isAcceptedOnly = !isFinalist && !localIsCandidate && localOfferStatus === "accepted";
                  return (
                    <Badge
                      variant={isAcceptedOnly ? "default" : "secondary"}
                      className={
                        isAcceptedOnly
                          ? "bg-blue-600 text-white text-xs shrink-0"
                          : isFinalist
                            ? "bg-amber-100 text-amber-800 border border-amber-300 text-xs shrink-0"
                            : "bg-muted text-muted-foreground border border-border text-xs shrink-0"
                      }
                    >
                      {label}
                    </Badge>
                  );
                })()
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{title}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onViewProfile}
        >
          View Profile
        </Button>
      </div>

      {/* Languages */}
      <div className="mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Languages</p>
        <div className="flex flex-wrap gap-2">
          {Array.isArray(languages) && languages.length > 0
            ? languages.map((name) => {
              const code = getCountryCode(name);
              return (
                <Badge key={name} variant="secondary" className="flex items-center gap-1.5 text-xs">
                  {code && (
                    <ReactCountryFlag
                      countryCode={code}
                      svg
                      style={{ width: "14px", height: "14px" }}
                      title={name}
                    />
                  )}
                  <span className="capitalize">{name}</span>
                </Badge>
              );
            })
            : <span className="text-sm text-muted-foreground">Not specified</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        {userRole === "agent" || userRole === "agency" ? (
          <>
            <div className="flex gap-2">
              {localHireId || localOfferStatus === "completed" || localOfferStatus === "hired" ? (
                <Button className="flex-1 bg-amber-500 hover:bg-amber-600 cursor-pointer text-white font-semibold" disabled>
                  Hired
                </Button>
              ) : localOfferStatus === "accepted" && localIsCandidate ? (
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 cursor-pointer text-white font-semibold"
                  onClick={() => setWarningModal(true)}
                >
                  Hire candidate
                </Button>
              ) : localIsCandidate ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 cursor-pointer"
                    onClick={removeCandidate}
                  >
                    Remove
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 cursor-pointer text-white font-semibold"
                    onClick={() => setWarningModal(true)}
                  >
                    Send offer
                  </Button>
                </>
              ) : localOfferStatus === "offered" ? (
                <Button className="flex-1 cursor-pointer" variant="secondary" disabled>
                  Offer sent
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 cursor-pointer text-white font-semibold"
                  onClick={() => setWarningModal(true)}
                >
                  Send offer
                </Button>
              )}
            </div>
            {onRequestPriceUpdate && !localHireId && localOfferStatus !== "completed" && localOfferStatus !== "hired" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer gap-2"
                onClick={onRequestPriceUpdate}
              >
                <Mail className="h-4 w-4" />
                Request price update
              </Button>
            )}
            <Button variant="outline" className="w-full cursor-pointer" onClick={onMessage}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </>
        ) : (
          <>
            {localHireId || localOfferStatus === "hired" || localOfferStatus === "completed" ? (
              <Button className="w-full bg-amber-500 cursor-pointer text-white font-semibold" disabled>Hired</Button>
            ) : localOfferStatus === "accepted" && localIsCandidate ? (
              <Button className="w-full cursor-pointer" variant="secondary" disabled>Offer accepted</Button>
            ) : localIsCandidate ? (
              <Button className="w-full cursor-pointer" variant="secondary" disabled>Candidate</Button>
            ) : localOfferStatus === "offered" ? (
              <Button className="w-full cursor-pointer" variant="secondary" disabled>Offer received</Button>
            ) : (
              <Button className="w-full cursor-pointer" variant="secondary" disabled>Applied</Button>
            )}
            <Button variant="outline" className="w-full cursor-pointer" onClick={onMessage}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </>
        )}
      </div>
      </div>

      <WarningModal
        isOpen={warningModal}
        title={userRole === "agent" || userRole === "agency" ? (localOfferStatus === "accepted" && localIsCandidate ? "Hire this candidate" : "Send offer to this guide") : "Hire this guide"}
        message={userRole === "agent" || userRole === "agency" ? (localOfferStatus === "accepted" && localIsCandidate ? `Are you sure you want to hire this candidate?` : `Are you sure you want to send an offer to this guide?`) : `Are you sure you want to hire this guide?`}
        onConfirm={userRole === "agent" || userRole === "agency" ? (localOfferStatus === "accepted" && localIsCandidate ? hireUser : sendOffer) : hireUser}
        onCancel={() => setWarningModal(false)}
      />
    </Card>
  )
}
