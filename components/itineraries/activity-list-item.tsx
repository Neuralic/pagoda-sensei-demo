"use client"

import { useState } from "react"
import { GripVertical, Clock, MapPin, Trash2, MessageCircle, CheckCircle, CalendarX } from "lucide-react"
import Image from "next/image"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { ConfirmBookingButton } from "@/components/itineraries/confirm-booking-button"
import { JpyUsdPriceLabel } from "@/components/itineraries/jpy-usd-price-label"

interface ActivityListItemProps {
  activity: {
    id: string
    title: string
    subtitle: string
    image: string
    time: string
    location: string
    duration: string
    /** Client-facing display price for this tour line */
    price?: number | null
    /** Hired / linked guide or operator name */
    guideName?: string | null
    guideId?: string | null
    bidsCount?: number
    isTransferzBooking?: boolean
    transferzJourneyCanceled?: boolean
    transferzFreeCancellationSummary?: string | null
    priceConfirmationStatus?: string | null
    priceConfirmationLastNotifiedAt?: string | null
    offerStatus?: string | null
    hasCommittedGuide?: boolean
  }
  onSelect: () => void
  onRemove?: (activityId: string) => void
  currentUserId?: string
  /** Itinerary owner (advisor) — chat agency side when admin is helping */
  advisorUserId?: string | null
  isSelected?: boolean
  /** When true (agent edit itinerary, published only), show bid count and Bids button */
  showBidInfo?: boolean
  /** Itinerary id for restoring expanded state when returning from bids page */
  itineraryId?: string
  /** Trip name — opens a Guide↔Advisor thread labeled for this itinerary */
  itineraryName?: string | null
  onCancelTransferzBooking?: (bookingRowId: string) => Promise<void>
  /** Persisting a cross-day move */
  isMoving?: boolean
  /** Refresh itinerary lines after booking confirmation from the row */
  onBookingStatusChange?: () => void
  /** Pagoda admin editing on the advisor's behalf — unlocks the booking override */
  viewerIsAdmin?: boolean
}

export function ActivityListItem({ activity, onSelect, onRemove, currentUserId, advisorUserId, isSelected, showBidInfo, itineraryId, itineraryName, onCancelTransferzBooking, isMoving, onBookingStatusChange, viewerIsAdmin }: ActivityListItemProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transferzCancelOpen, setTransferzCancelOpen] = useState(false);
  const [cancelingTransferz, setCancelingTransferz] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const agencyIdForChat =
    (typeof advisorUserId === "string" && advisorUserId.trim()) ||
    (typeof currentUserId === "string" && currentUserId.trim()) ||
    null;
  const isTransferzLinePreview =
    Boolean(activity.isTransferzBooking) ||
    (typeof activity.id === "string" && activity.id.startsWith("transferz-"));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
    disabled: isTransferzLinePreview || Boolean(isMoving),
    data: {
      type: isTransferzLinePreview ? "transferz" : "job",
      movable: !isTransferzLinePreview,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isMoving ? 0.45 : 1,
  }

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (onRemove) {
      onRemove(activity.id);
    }
    setDeleteDialogOpen(false);
  };

  const transferzRowId =
    typeof activity.id === "string" && activity.id.startsWith("transferz-")
      ? activity.id.replace(/^transferz-/, "")
      : null;
  const isTransferzLine = Boolean(activity.isTransferzBooking) || Boolean(transferzRowId);
  const transferzCanceled = Boolean(activity.transferzJourneyCanceled);
  const showConfirmBooking =
    !isTransferzLine &&
    Boolean(activity.guideId || activity.hasCommittedGuide);

  const handleConfirmTransferzCancel = async () => {
    if (!onCancelTransferzBooking || !transferzRowId) return;
    setCancelingTransferz(true);
    try {
      await onCancelTransferzBooking(transferzRowId);
      toast.success("Transfer reservation canceled with the provider.");
      setTransferzCancelOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel reservation");
    } finally {
      setCancelingTransferz(false);
    }
  };

  const handleMessageGuide = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onSelect

    if (!activity.guideId || !agencyIdForChat) {
      toast.error(
        !activity.guideId
          ? "This tour has no linked guide to message."
          : "Missing advisor account for this chat. Refresh the page and try again."
      );
      return;
    }

    setMessaging(true);
    try {
      const { startGuideAdvisorChat } = await import("@/lib/start-guide-advisor-chat");
      const result = await startGuideAdvisorChat({
        guideId: activity.guideId,
        advisorUserId: agencyIdForChat,
        itineraryName,
        itineraryId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(result.href);
    } catch (error) {
      console.error('Error starting chat:', error);
      toast.error('Failed to start chat');
    } finally {
      setMessaging(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex gap-4 p-4 bg-white rounded-lg border transition-all cursor-pointer relative group ${
        isSelected 
          ? "border-[#D4AA25] border-2 shadow-md bg-[#D4AA25]/5" 
          : "border-border hover:border-[#D4AA25] hover:shadow-md"
      }`}
    >
      {/* Drag Handle */}
      <div
        {...(isTransferzLinePreview || isMoving ? {} : attributes)}
        {...(isTransferzLinePreview || isMoving ? {} : listeners)}
        className={`flex items-center justify-center shrink-0 ${
          isTransferzLinePreview || isMoving
            ? "cursor-not-allowed opacity-40"
            : "cursor-grab active:cursor-grabbing"
        }`}
        title={
          isTransferzLinePreview
            ? "Airport transfers can’t be dragged to another day"
            : isMoving
              ? "Moving…"
              : "Drag to another day"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </div>

      {/* Image */}
  
      <Image
        src={
          activity.image && (activity.image.startsWith('http') || activity.image.startsWith('/'))
            ? activity.image
            : '/assets/placeholder.svg'
        }
        alt={activity.title}
        width={96}
        height={96}
        className="w-24 h-24 rounded-lg object-cover shrink-0"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground">{activity.title}</h4>
            <p className="text-sm text-muted-foreground">{activity.subtitle}</p>
            {(() => {
              const hasPrice =
                activity.price != null && Number.isFinite(Number(activity.price));
              // A provider booking always has a price to show. When one is missing the
              // payload is incomplete, and rendering nothing at all made the line look
              // like it had simply not loaded — say so instead.
              const showMissingPrice = !hasPrice && isTransferzLine;
              if (!hasPrice && !showMissingPrice && !activity.guideName?.trim()) return null;
              return (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  {hasPrice ? (
                    <JpyUsdPriceLabel
                      jpy={Number(activity.price)}
                      className="font-medium tabular-nums text-foreground"
                    />
                  ) : showMissingPrice ? (
                    <span
                      className="font-medium text-amber-800"
                      title="This transfer booking has no price on file — contact Pagoda before quoting it."
                    >
                      Price unavailable
                    </span>
                  ) : null}
                  {activity.guideName?.trim() ? (
                    <span className="text-muted-foreground">
                      Guide:{" "}
                      <span className="text-foreground">{activity.guideName.trim()}</span>
                    </span>
                  ) : null}
                </div>
              );
            })()}
            {isTransferzLine && activity.transferzFreeCancellationSummary?.trim() ? (
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {activity.transferzFreeCancellationSummary.trim()}
              </p>
            ) : null}
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 sm:gap-2 justify-start sm:justify-end shrink-0 max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bid indicator + Bids button (only when itinerary is published, on agent edit page) */}
            {showBidInfo && !activity.isTransferzBooking && (
              <div className="flex items-center gap-2 shrink-0">
                {activity.bidsCount != null && activity.bidsCount > 0 && (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
                    <span className="text-sm font-medium text-green-700 tabular-nums">
                      {activity.bidsCount} bid{activity.bidsCount !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-[#D4AA25] hover:bg-[#D4AA25]/90 text-white border-0 shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof window !== "undefined" && itineraryId) {
                      try {
                        sessionStorage.setItem("pagoda_agent_itineraries_expanded", itineraryId);
                      } catch (_) {}
                    }
                    router.push(`/agent/bids?jobId=${encodeURIComponent(activity.id)}`);
                  }}
                >
                  Bids
                </Button>
              </div>
            )}
            {/* Message Guide Button - Only show if job was created from tour library */}
            {activity.guideId && activity.guideId !== agencyIdForChat && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMessageGuide}
                disabled={messaging || !agencyIdForChat}
                className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90 shrink-0"
                title="Message guide who uploaded this tour"
              >
                <span className="hidden sm:inline">Message Guide</span>
                <span className="sm:hidden">Message</span>
              </Button>
            )}
            {showConfirmBooking && (
              <ConfirmBookingButton
                jobId={activity.id}
                role="agent"
                offerStatus={activity.offerStatus ?? null}
                priceConfirmationStatus={activity.priceConfirmationStatus ?? null}
                priceConfirmationLastNotifiedAt={
                  activity.priceConfirmationLastNotifiedAt ?? null
                }
                isAdmin={viewerIsAdmin}
                compact
                onRequested={() => onBookingStatusChange?.()}
                onConfirmed={() => onBookingStatusChange?.()}
              />
            )}
            {/* Remove Button */}
            {onCancelTransferzBooking &&
              transferzRowId &&
              isTransferzLine &&
              !transferzCanceled && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransferzCancelOpen(true);
                  }}
                  disabled={cancelingTransferz}
                  className="h-8 w-8 text-amber-800 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Cancel reservation with transfer provider"
                >
                  <CalendarX className="w-4 h-4" />
                </Button>
              )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveClick}
                disabled={isTransferzLine && !transferzCanceled}
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 disabled:opacity-30"
                title={
                  isTransferzLine && !transferzCanceled
                    ? "Cancel with the provider first, then remove"
                    : "Remove activity"
                }
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{activity.time}</span>
          </div>

          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span>{activity.location}</span>
          </div>

          <span>{activity.duration}</span>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {onCancelTransferzBooking && transferzRowId && (
        <AlertDialog open={transferzCancelOpen} onOpenChange={setTransferzCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel transfer reservation</AlertDialogTitle>
              <AlertDialogDescription>
                This requests cancellation with the transfer provider for &quot;{activity.title}&quot;.
                You can remove this line from the day after the provider shows the journey as canceled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelingTransferz}>Back</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmTransferzCancel();
                }}
                disabled={cancelingTransferz}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelingTransferz ? "Canceling…" : "Confirm cancellation"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {onRemove && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                Delete Activity
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isTransferzLine ? (
                  <>
                    Remove &quot;{activity.title}&quot; from this day? The provider booking must already be
                    canceled.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete the activity &quot;{activity.title}&quot;? This action
                    cannot be undone and will remove all associated data.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
