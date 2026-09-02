"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { MapPin, Clock, Users, Calendar, Trash2, Ban, CheckCircle, Eye, CalendarX } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { BidBadge } from "./bid-badge";
import toast from "react-hot-toast";
import GuidePrice from "@/components/guide_price/guide_price";
import { ApplyJobModal } from "./apply-job-modal";
import { JobDescriptionModal } from "./job-description-modal";
import { ConfirmBookingButton } from "./confirm-booking-button";
import { ConfirmBookingPriceModal } from "./confirm-booking-price-modal";

interface Activity {
  id: string;
  title: string;
  location: string;
  duration: string;
  groupSize: string;
  date: string;
  languages: string | string[];
  image: string;
  bidsCount: number;
  postedDaysAgo: number;
  job_available?: boolean;
  /** When false, job creator (agent) is suspended — show "no longer available" and disable apply for guides */
  creator_is_active?: boolean;
  application_status?: string;
  bookingStatus?: string | null;
  bookingStatusLabel?: string | null;
  priceConfirmationStatus?: string | null;
  quotedGuidePriceAtRequest?: number | null;
  /** Advisor-facing price after commissions. */
  displayPrice?: number | null;
  /** Linked / hired guide or operator name */
  guideName?: string | null;
  bid_available_at?: string | null;
  /** Tour Library line owned by the logged-in guide. */
  isOwnTour?: boolean;
  guideId?: string | null;
  /** Transfer-provider line (not a guide job). */
  isTransferzBooking?: boolean;
  /** From Transferz GET / booking payload after cancel or sync. */
  transferzJourneyCanceled?: boolean;
  /** Human-readable cancellation window from `cancellationDetails`. */
  transferzFreeCancellationSummary?: string | null;
  referenceCode?: string | null;
  hasCommittedGuide?: boolean;
  guideFulfillment?: {
    pickupDate?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    guideDisplayName?: string | null;
    guideWhatsapp?: string | null;
  } | null;
}

interface ActivityItemProps {
  activity: Activity;
  role: "agent" | "guide";
  onDeleteJob?: (jobId: string) => void;
  userId?: string;
  onStatusJob?: (jobId: string) => void;
  /** When set, save to sessionStorage before navigating to bids so back restores expanded card (itineraries list) */
  itineraryId?: string;
  /** When set, the ActivityItem with this job id will open the price update modal (guide, from email link) */
  openPriceUpdateJobId?: string | null;
  /** When set, open the confirm-price modal for this job (guide, from booking email) */
  openConfirmPriceJobId?: string | null;
  /** Agent itineraries list: cancel Transferz journey then refresh row state. */
  transferzCancelHandler?: (bookingRowId: string) => Promise<void>;
}

export function ActivityItem({
  activity,
  role,
  onDeleteJob,
  userId,
  onStatusJob,
  itineraryId,
  openPriceUpdateJobId,
  openConfirmPriceJobId,
  transferzCancelHandler,
}: ActivityItemProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [updatePriceOpen, setUpdatePriceOpen] = useState(false);
  const [confirmPriceOpen, setConfirmPriceOpen] = useState(false);
  const openedPriceUpdateFromUrlRef = useRef(false);
  const openedConfirmPriceFromUrlRef = useRef(false);
  const [applied, setApplied] = useState(false);
  const [hired, setHired] = useState(false);
  const [hasOffer, setHasOffer] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hirePrice, setHirePrice] = useState(0);
  const [offerPrice, setOfferPrice] = useState("");
  const [, setIsCandidate] = useState(false);
  const [offerStatus, setOfferStatus] = useState<string | null>(null);
  const [priceConfirmationStatus, setPriceConfirmationStatus] = useState<string | null>(
    activity.priceConfirmationStatus ?? null
  );
  const [quotedGuidePriceAtRequest, setQuotedGuidePriceAtRequest] = useState<number | null>(
    activity.quotedGuidePriceAtRequest ?? null
  );
  const [candidateGuidePrice, setCandidateGuidePrice] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transferzCancelOpen, setTransferzCancelOpen] = useState(false);
  const [cancelingTransferz, setCancelingTransferz] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [removeGuideOpen, setRemoveGuideOpen] = useState(false);
  const [removingGuide, setRemovingGuide] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewDescriptionOpen, setViewDescriptionOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const bidAvailableAt = activity.bid_available_at ? new Date(activity.bid_available_at).getTime() : null;
  const bidLocked = role === "guide" && bidAvailableAt != null && bidAvailableAt > now;
  const isTransferLine =
    Boolean(activity.isTransferzBooking) || (typeof activity.id === "string" && activity.id.startsWith("transferz-"));
  const transferzRowId =
    typeof activity.id === "string" && activity.id.startsWith("transferz-")
      ? activity.id.replace(/^transferz-/, "")
      : null;
  const transferzCanceled = Boolean(activity.transferzJourneyCanceled);
  /** Real guide jobs only — Transferz transfers are not marketplace jobs; never use "closed job" copy for them. */
  const jobNoLongerAvailable =
    role === "guide" &&
    !isTransferLine &&
    (activity.job_available === false || activity.creator_is_active === false);
  useEffect(() => {
    if (!bidLocked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bidLocked]);

  const handleRemoveGuide = async () => {
    setRemovingGuide(true);
    try {
      const res = await fetch("/api/jobs/remove-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: activity.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to remove guide");
      }
      toast.success("Guide removed — job is open for bidding again.");
      setHired(false);
      setOfferStatus(null);
      setRemoveGuideOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove guide");
    } finally {
      setRemovingGuide(false);
    }
  };

  const fulfillment = activity.guideFulfillment;
  const showFulfillment =
    fulfillment &&
    (fulfillment.guideDisplayName ||
      fulfillment.guideWhatsapp ||
      fulfillment.pickupDate ||
      fulfillment.pickupLocation);

  const handleGuideApply = async () => {
    if (applied) return;
    try {
      const res = await fetch("/api/guide/bid-readiness", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Could not verify bid eligibility");
        return;
      }
      if (!data.guideApproved) {
        toast.error("Your account is pending approval. Complete Settings and wait for Pagoda to enable full access.");
        router.push("/settings");
        return;
      }
      if (!data.canBid) {
        toast.error(
          "Save your availability calendar in Settings → Guide profile before your first bid.",
          { duration: 6000 }
        );
        router.push("/settings");
        return;
      }
      setOpen(true);
    } catch {
      toast.error("Could not verify bid eligibility");
    }
  };

  const refreshApplicationStatus = async () => {
    if (role !== "guide" || !activity?.id) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/applications?jobId=${encodeURIComponent(activity.id)}`, { credentials: "include" });
      const data = await res.json();
      setApplied(Boolean(data?.applied));
      setHired(Boolean(data?.hire_me));
      setHasOffer(Boolean(data?.has_offer));
      setHirePrice(Number(data?.guide_hire) || 0);
      setIsCandidate(Boolean(data?.is_candidate));
      setOfferStatus(typeof data?.offer_status === "string" ? data.offer_status : null);
      setCandidateGuidePrice(data?.guide_price != null ? Number(data.guide_price) : null);
      setPriceConfirmationStatus(
        typeof data?.price_confirmation_status === "string" ? data.price_confirmation_status : null
      );
      setQuotedGuidePriceAtRequest(
        data?.quoted_guide_price_at_request != null ? Number(data.quoted_guide_price_at_request) : null
      );
    } catch {
      setApplied(false);
      setHired(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (role !== "guide" || !activity?.id) return;
    let mounted = true;
    setChecking(true);
    fetch(`/api/applications?jobId=${encodeURIComponent(activity.id)}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        setApplied(Boolean(data?.applied));
        setHired(Boolean(data?.hire_me));
        setHasOffer(Boolean(data?.has_offer));
        setHirePrice(Number(data?.guide_hire) || 0);
        setIsCandidate(Boolean(data?.is_candidate));
        setOfferStatus(typeof data?.offer_status === "string" ? data.offer_status : null);
        setCandidateGuidePrice(data?.guide_price != null ? Number(data.guide_price) : null);
        setPriceConfirmationStatus(
          typeof data?.price_confirmation_status === "string" ? data.price_confirmation_status : null
        );
        setQuotedGuidePriceAtRequest(
          data?.quoted_guide_price_at_request != null ? Number(data.quoted_guide_price_at_request) : null
        );
      })
      .catch(() => {
        if (mounted) setApplied(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => { mounted = false; };
  }, [activity?.id, role]);

  useEffect(() => {
    if (
      role !== "guide" ||
      !openConfirmPriceJobId ||
      activity.id !== openConfirmPriceJobId ||
      openedConfirmPriceFromUrlRef.current
    )
      return;
    if (checking) return;
    openedConfirmPriceFromUrlRef.current = true;
    setConfirmPriceOpen(true);
  }, [role, openConfirmPriceJobId, activity.id, checking]);

  // Open price update modal when landing from email link (openPriceUpdateJobId === activity.id)
  useEffect(() => {
    if (
      role !== "guide" ||
      !openPriceUpdateJobId ||
      activity.id !== openPriceUpdateJobId ||
      openedPriceUpdateFromUrlRef.current ||
      openConfirmPriceJobId === activity.id
    )
      return;
    if (checking) return;
    openedPriceUpdateFromUrlRef.current = true;
    setUpdatePriceOpen(true);
  }, [role, openPriceUpdateJobId, openConfirmPriceJobId, activity.id, checking]);

  const handleDeleteJob = async () => {
    if (!onDeleteJob) return;
    setDeleting(true);
    try {
      await onDeleteJob(activity.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmTransferzCancel = async () => {
    if (!transferzCancelHandler || !transferzRowId) return;
    setCancelingTransferz(true);
    try {
      await transferzCancelHandler(transferzRowId);
      toast.success("Transfer reservation canceled with the provider.");
      setTransferzCancelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel reservation");
    } finally {
      setCancelingTransferz(false);
    }
  };

  const bidCountdownLabel =
    bidAvailableAt && bidAvailableAt > now
      ? (() => {
          const rem = Math.max(0, bidAvailableAt - now);
          const h = Math.floor(rem / (60 * 60 * 1000));
          const m = Math.floor((rem % (60 * 60 * 1000)) / (60 * 1000));
          const s = Math.floor((rem % (60 * 1000)) / 1000);
          if (h > 0) return `Bidding opens in ${h}h ${m}m`;
          if (m > 0) return `Bidding opens in ${m}m ${s}s`;
          return `Bidding opens in ${s}s`;
        })()
      : null;

  const statusLabel =
    activity.application_status === "accepted"
      ? "Candidate"
      : activity.application_status === "rejected"
        ? "Rejected"
        : "Pending";
  const effectivePriceConfirmation =
    priceConfirmationStatus || activity.priceConfirmationStatus || null;
  const awaitingPriceConfirm = effectivePriceConfirmation === "requested";
  const showGuideClosed =
    jobNoLongerAvailable && !awaitingPriceConfirm && effectivePriceConfirmation !== "confirmed";
  const agentCanBookLine = role === "agent" && !isTransferLine;
  const bookingBadgeClass =
    activity.bookingStatus === "booked"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : activity.bookingStatus === "awaiting_price_confirmation"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : activity.bookingStatus === "offer_accepted" ||
          activity.bookingStatus === "offer_sent" ||
          activity.bookingStatus === "candidate_selected" ||
          activity.bookingStatus === "bids_received"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : activity.bookingStatus === "open"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-gray-100 text-gray-600 border-gray-200";

  if (role === "guide" && isTransferLine) {
    return null;
  }

  return (
    <>
      <div className="flex gap-4 bg-background rounded-lg p-4 border border-border relative">
        <div className="relative shrink-0">
          <Image
            src={
              activity.image && (activity.image.startsWith("http") || activity.image.startsWith("/"))
                ? activity.image
                : "/assets/placeholder.svg"
            }
            alt={activity.title}
            width={160}
            height={128}
            className="w-40 h-32 object-cover rounded-lg"
            priority
          />
          {activity.bidsCount > 0 && <BidBadge count={activity.bidsCount} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h4 className="font-semibold text-foreground text-base">{activity.title}</h4>
              {role === "guide" && activity.isOwnTour && (
                <span className="shrink-0 rounded-full bg-[#D4AA25]/15 px-2 py-0.5 text-xs font-medium text-[#af8a10]">
                  Your tour
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                Posted {activity.postedDaysAgo === 0 ? "Today" : `${activity.postedDaysAgo} days ago`}
              </p>
              {role === "agent" && onDeleteJob && (
                <>
                  {isTransferLine &&
                    itineraryId &&
                    transferzCancelHandler &&
                    !transferzCanceled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setTransferzCancelOpen(true)}
                        disabled={cancelingTransferz}
                        className="text-amber-700 hover:bg-amber-50 h-8 w-8 cursor-pointer"
                        title="Cancel reservation with transfer provider"
                      >
                        <CalendarX className="w-4 h-4" />
                      </Button>
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={
                      deleting ||
                      (isTransferLine && !transferzCanceled)
                    }
                    className="text-red-600 hover:bg-red-50 h-8 w-8 cursor-pointer disabled:opacity-40"
                    title={
                      isTransferLine && !transferzCanceled
                        ? "Cancel the transfer with the provider first, then you can remove this line"
                        : "Delete job"
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
              {role === "agent" && onStatusJob && !isTransferLine && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStatusDialogOpen(true)}
                  disabled={deleting}
                  className="text-red-600 hover:bg-red-50 h-8 w-8 cursor-pointer"
                  title={activity.job_available ? "Disable job" : "Enable job"}
                >
                  {activity.job_available ? <Ban className="h-5 w-5 text-red-500" /> : <CheckCircle className="h-5 w-5 text-green-600" />}
                </Button>
              )}
            </div>
          </div>

          {role === "agent" && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${bookingBadgeClass}`}
              >
                {activity.bookingStatusLabel ||
                  (isTransferLine ? "Booked transfer" : "Open for bids")}
              </span>
              <span className="text-xs font-medium tabular-nums text-foreground">
                {activity.displayPrice != null
                  ? `Client price: ¥${Number(activity.displayPrice).toLocaleString()}`
                  : isTransferLine
                    ? "Provider price in transfer booking"
                    : "Price not quoted yet"}
              </span>
              {activity.guideName?.trim() ? (
                <span className="text-xs text-muted-foreground">
                  Guide:{" "}
                  <span className="font-medium text-foreground">{activity.guideName.trim()}</span>
                </span>
              ) : null}
            </div>
          )}

          {role === "agent" &&
            isTransferLine &&
            activity.transferzFreeCancellationSummary?.trim() && (
              <p className="text-xs text-muted-foreground mb-2 leading-snug">
                {activity.transferzFreeCancellationSummary.trim()}
              </p>
            )}
          <div className="grid grid-cols-2 gap-1 mb-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{activity.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{activity.duration}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" />
              <span>{activity.groupSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>{activity.date}</span>
            </div>
          </div>

          {role === "agent" && activity.referenceCode && !isTransferLine && (
            <p className="text-xs text-muted-foreground mb-2">
              Tour reference: <span className="font-mono font-medium text-foreground">{activity.referenceCode}</span>
            </p>
          )}

          {showFulfillment && !isTransferLine && (
            <div className="mb-4 rounded-md border border-border bg-background p-3 text-sm space-y-1">
              <p className="font-medium text-foreground">Traveler pickup details</p>
              {fulfillment?.guideDisplayName && (
                <p>
                  <span className="text-muted-foreground">Guide: </span>
                  {fulfillment.guideDisplayName}
                </p>
              )}
              {fulfillment?.guideWhatsapp && (
                <p>
                  <span className="text-muted-foreground">WhatsApp: </span>
                  {fulfillment.guideWhatsapp}
                </p>
              )}
              {(fulfillment?.pickupDate || fulfillment?.pickupTime) && (
                <p>
                  <span className="text-muted-foreground">Pickup: </span>
                  {[fulfillment.pickupDate, fulfillment.pickupTime].filter(Boolean).join(" at ")}
                </p>
              )}
              {fulfillment?.pickupLocation && (
                <p>
                  <span className="text-muted-foreground">Location: </span>
                  {fulfillment.pickupLocation}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {role === "guide" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewDescriptionOpen(true)}
                  className="shrink-0 cursor-pointer"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {activity.application_status === "accepted" ? (
                <>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-sm text-green-600">{statusLabel}</span>
                    {candidateGuidePrice != null && candidateGuidePrice > 0 && (
                      <>
                        <span className="text-muted-foreground text-sm" aria-hidden>·</span>
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          ¥{candidateGuidePrice.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                  {!hired && role === "guide" && !awaitingPriceConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUpdatePriceOpen(true)}
                      className="shrink-0 cursor-pointer"
                    >
                      Update price
                    </Button>
                  )}
                  {role === "guide" && awaitingPriceConfirm && (
                    <Button
                      size="sm"
                      className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90 shrink-0 cursor-pointer"
                      onClick={() => setConfirmPriceOpen(true)}
                    >
                      Confirm price
                    </Button>
                  )}
                  {role === "agent" && (
                    <ConfirmBookingButton
                      jobId={activity.id}
                      role={role}
                      offerStatus={offerStatus || activity.application_status}
                      priceConfirmationStatus={effectivePriceConfirmation}
                      onRequested={() => setPriceConfirmationStatus("requested")}
                      onConfirmed={() => {
                        setHired(true);
                        setOfferStatus("completed");
                        setPriceConfirmationStatus("confirmed");
                      }}
                    />
                  )}
                </>
              ) : showGuideClosed ? (
                <span className="text-red-600 text-sm">This job is no longer available</span>
              ) : isTransferLine || activity.job_available || agentCanBookLine || awaitingPriceConfirm ? (
                <>
                  {isTransferLine && role === "agent" && (
                    <span className="text-muted-foreground text-sm mr-auto max-w-md text-left">
                      Booked airport transfer. Not listed for guides — not the same as a closed tour job.
                    </span>
                  )}
                  {hired ? (
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-green-600 font-semibold">
                        {offerPrice || hirePrice > 0 ? `Hired: ¥${offerPrice || hirePrice}` : "Hired"}
                      </span>
                      {role === "agent" && (
                        <ConfirmBookingButton
                          jobId={activity.id}
                          role={role}
                          offerStatus={offerStatus || activity.application_status}
                          priceConfirmationStatus={effectivePriceConfirmation}
                          onRequested={() => setPriceConfirmationStatus("requested")}
                          onConfirmed={() => {
                            setHired(true);
                            setOfferStatus("completed");
                            setPriceConfirmationStatus("confirmed");
                          }}
                        />
                      )}
                      {role === "guide" && awaitingPriceConfirm && (
                        <Button
                          size="sm"
                          className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90 shrink-0 cursor-pointer"
                          onClick={() => setConfirmPriceOpen(true)}
                        >
                          Confirm price
                        </Button>
                      )}
                    </div>
                  ) : hasOffer ? (
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        onClick={() => setAcceptOpen(true)}
                        className="bg-[#2562d4] hover:bg-[#2c70ee] text-white shrink-0 cursor-pointer"
                      >
                        Accept Offer
                      </Button>
                      {role === "agent" && (
                        <ConfirmBookingButton
                          jobId={activity.id}
                          role={role}
                          offerStatus={offerStatus || "offered"}
                          priceConfirmationStatus={effectivePriceConfirmation}
                          onRequested={() => setPriceConfirmationStatus("requested")}
                          onConfirmed={() => {
                            setHired(true);
                            setOfferStatus("completed");
                            setPriceConfirmationStatus("confirmed");
                          }}
                        />
                      )}
                    </div>
                  ) : bidLocked ? (
                    <div className="flex flex-col items-end gap-1">
                      <Button className="bg-[#D4AA25]/60 text-white shrink-0 cursor-not-allowed" disabled>
                        Apply Now
                      </Button>
                      {bidCountdownLabel && <span className="text-xs text-muted-foreground">{bidCountdownLabel}</span>}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 shrink-0">
                        {role === "agent" && activity.bidsCount > 0 && (
                          <>
                            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
                            <span className="text-sm font-medium text-green-700 tabular-nums" title={`${activity.bidsCount} guide${activity.bidsCount !== 1 ? "s" : ""} bid`}>
                              {activity.bidsCount} bid{activity.bidsCount !== 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                        {!isTransferLine && (
                          <Button
                            className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white shrink-0 cursor-pointer"
                            onClick={() => {
                              if (role === "agent") {
                                if (typeof window !== "undefined" && itineraryId) {
                                  try {
                                    sessionStorage.setItem("pagoda_agent_itineraries_expanded", itineraryId);
                                  } catch (_) {}
                                }
                                router.push(`/agent/bids?jobId=${encodeURIComponent(activity.id)}`);
                                return;
                              }
                              void handleGuideApply();
                            }}
                            disabled={role === "guide" && applied}
                          >
                            {role === "agent"
                              ? "Bids"
                              : checking
                                ? "Checking…"
                                : applied
                                  ? "Applied"
                                  : "Apply Now"}
                          </Button>
                        )}
                        {!isTransferLine &&
                          role === "agent" &&
                          (activity.hasCommittedGuide || activity.bidsCount > 0) && (
                            <ConfirmBookingButton
                              jobId={activity.id}
                              role={role}
                              offerStatus={offerStatus || activity.application_status}
                              priceConfirmationStatus={effectivePriceConfirmation}
                              onRequested={() => setPriceConfirmationStatus("requested")}
                              onConfirmed={() => {
                                setHired(true);
                                setOfferStatus("completed");
                                setPriceConfirmationStatus("confirmed");
                              }}
                            />
                          )}
                        {role === "guide" && awaitingPriceConfirm && (
                          <Button
                            size="sm"
                            className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90 shrink-0 cursor-pointer"
                            onClick={() => setConfirmPriceOpen(true)}
                          >
                            Confirm price
                          </Button>
                        )}
                      </div>
                      {/* Guide or tour owner: show price (same as other guides) and update price when they have an application or are tour owner (auto-bid), and not hired */}
                      {role === "guide" && !hired && !awaitingPriceConfirm && (applied || activity.guideId === userId) && (
                        <>
                          {candidateGuidePrice != null && candidateGuidePrice > 0 && (
                            <span className="text-sm font-medium tabular-nums text-foreground shrink-0">
                              ¥{candidateGuidePrice.toLocaleString()}
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUpdatePriceOpen(true)}
                            className="shrink-0 cursor-pointer"
                          >
                            Update price
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <span className="text-red-600 text-sm">This job is no longer available</span>
              )}
              {role === "agent" && activity.hasCommittedGuide && !isTransferLine && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 cursor-pointer"
                  onClick={() => setRemoveGuideOpen(true)}
                >
                  Remove guide &amp; reopen
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <JobDescriptionModal
        isOpen={viewDescriptionOpen}
        onClose={() => setViewDescriptionOpen(false)}
        jobId={activity.id}
        initialTitle={activity.title}
        imageUrl={activity.image || undefined}
      />

      <ApplyJobModal
        open={open}
        onOpenChange={setOpen}
        jobId={activity.id}
        jobTitle={activity.title}
        jobSummary={{
          location: activity.location,
          duration: activity.duration,
          groupSize: activity.groupSize,
          date: activity.date,
        }}
        onApplicationSubmitted={refreshApplicationStatus}
      />

      <ConfirmBookingPriceModal
        isOpen={confirmPriceOpen}
        onClose={() => setConfirmPriceOpen(false)}
        jobId={activity.id}
        quotedPrice={quotedGuidePriceAtRequest}
        currentPrice={candidateGuidePrice}
        onConfirmed={() => {
          setHired(true);
          setOfferStatus("completed");
          setPriceConfirmationStatus("confirmed");
        }}
      />

      <GuidePrice
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        job_id={activity.id}
        userId={userId}
        setOfferPrice={setOfferPrice}
      />
      <GuidePrice
        mode="update"
        isOpen={updatePriceOpen}
        onClose={() => setUpdatePriceOpen(false)}
        job_id={activity.id}
        userId={userId}
        setOfferPrice={setOfferPrice}
        initialPrice={candidateGuidePrice}
        onPriceUpdated={refreshApplicationStatus}
      />

      {transferzCancelHandler && transferzRowId && (
        <AlertDialog open={transferzCancelOpen} onOpenChange={setTransferzCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel transfer reservation</AlertDialogTitle>
              <AlertDialogDescription>
                This requests cancellation with the transfer provider for &quot;{activity.title}&quot;.
                Fees may apply outside the free-cancellation window. You can remove this line from the
                itinerary only after the provider shows the journey as canceled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelingTransferz} className="cursor-pointer">
                Back
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmTransferzCancel();
                }}
                disabled={cancelingTransferz}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                {cancelingTransferz ? "Canceling…" : "Confirm cancellation"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {onDeleteJob && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">Delete Job</AlertDialogTitle>
              <AlertDialogDescription>
                {isTransferLine ? (
                  <>
                    Remove &quot;{activity.title}&quot; from this itinerary? The transfer provider must already
                    have canceled the booking — this only removes the saved line.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete &quot;{activity.title}&quot;? This cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} className="cursor-pointer">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteJob}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {onStatusJob && (
        <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {activity.job_available ? "Disable job" : "Enable job"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to {activity.job_available ? "disable" : "re-enable"} &quot;{activity.title}&quot;?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onStatusJob(activity.id);
                  setStatusDialogOpen(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                Update
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={removeGuideOpen} onOpenChange={setRemoveGuideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove guide and reopen job?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the hired or accepted guide from &quot;{activity.title}&quot; and lists the job on the
              guide job board again so others can bid. Pickup details will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingGuide} className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRemoveGuide();
              }}
              disabled={removingGuide}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {removingGuide ? "Removing…" : "Remove guide"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
