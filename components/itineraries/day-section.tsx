"use client"

import React, { useState } from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ActivityListItem } from "@/components/itineraries/activity-list-item"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { CreateJobModal } from "./create-job-modal"
import { ApiItinerary } from "@/app/types"
import ArrivalDate from "./arrival-date"
import { Input } from "../ui/input"
import toast from "react-hot-toast"

interface Activity {
  id: string
  title: string
  subtitle: string
  image: string
  time: string
  location: string
  duration: string
  price?: number | null
  guideName?: string | null
  guideId?: string | null
  bidsCount?: number
  /** Transferz itinerary line item (not a guide job — no bids) */
  isTransferzBooking?: boolean
  transferzJourneyCanceled?: boolean
  transferzFreeCancellationSummary?: string | null
  priceConfirmationStatus?: string | null
    priceConfirmationLastNotifiedAt?: string | null
  offerStatus?: string | null
  hasCommittedGuide?: boolean
}

interface DaySectionProps {
  day: {
    id: string
    dayNumber: number
    dayOfWeek: string
    date: string
    title: string
    startTime: string
    activities: Activity[]
    /** City / destination for this day (from intake stay plan or PDF location) */
    destination?: string
    /** Hotel name for this day (from intake stay plan) */
    hotel?: string
  }
  isExpanded: boolean
  onToggle: () => void
  onActivitySelect: (activity: Activity) => void
  itineraryId?: string
  activityDateISO?: string | null
  onJobSaved?: () => void
  toggleTourDay: () => void
  itinerary: ApiItinerary
  currentUserId?: string
  /** Itinerary owner — used as chat agency when admin is editing */
  advisorUserId?: string | null
  selectedActivityId?: string | null
  /** When true, show bid count and Bids link on each activity (agent edit itinerary, published only) */
  showBidInfo?: boolean
  /** Cancel Transferz journey via provider API, then refresh listings. */
  onCancelTransferzBooking?: (bookingRowId: string) => Promise<void>
  /** Visual highlight while dragging a tour over this day */
  isDropTarget?: boolean
  /** Job currently being persisted after a day move */
  movingActivityId?: string | null
  /** Pagoda admin editing on the advisor's behalf — unlocks the booking override */
  viewerIsAdmin?: boolean
}

export function DaySection({
  itinerary,
  day,
  isExpanded,
  onToggle,
  onActivitySelect,
  itineraryId,
  activityDateISO,
  onJobSaved,
  toggleTourDay,
  currentUserId,
  advisorUserId,
  selectedActivityId,
  showBidInfo,
  onCancelTransferzBooking,
  isDropTarget,
  movingActivityId,
  viewerIsAdmin,
}: DaySectionProps) {
  const dayColor = day.dayNumber % 3 === 1 ? "bg-green-100" : day.dayNumber % 3 === 2 ? "bg-blue-100" : "bg-pink-100"
  const dayTextColor =
    day.dayNumber % 3 === 1 ? "text-green-700" : day.dayNumber % 3 === 2 ? "text-blue-700" : "text-pink-700"
  const [jobOpen, setJobOpen] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")

  const droppableId = activityDateISO ? `day-drop:${activityDateISO}` : day.id
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: "day", iso: activityDateISO ?? null, dayId: day.id },
  })
  const showDropHighlight = Boolean(isDropTarget || isOver)


  const [plan, setPlan] = useState("");

  const handleRemoveActivity = async (activityId: string) => {
    try {
      if (activityId.startsWith("transferz-")) {
        if (!itineraryId) {
          throw new Error("Missing itinerary");
        }
        const bookingId = activityId.replace(/^transferz-/, "");
        const resp = await fetch(
          `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings/${encodeURIComponent(bookingId)}`,
          { method: "DELETE" }
        );
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to remove transfer");
        }
        toast.success("Transfer removed from the itinerary.");
        onJobSaved?.();
        return;
      }

      const resp = await fetch(`/api/jobs/${activityId}`, {
        method: "DELETE",
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete job");
      }

      toast.success("Job deleted successfully!");
      
      // Refresh jobs list
      onJobSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete job";
      toast.error(msg);
    }
  };

  const submitPlan = async () => {
    try {
      await fetch("/api/pdf/arrival", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          itineraryId: itineraryId,
          date: selectedDate,
          plan: plan
        })
      });

      setDateOpen(false);
    } catch (error) {
      console.log("Error updating:", error);
    }
  };


  return (
    <Card
      ref={setDroppableRef}
      className={`overflow-hidden transition-shadow ${
        showDropHighlight
          ? "ring-2 ring-[#D4AA25] ring-offset-2 shadow-md"
          : ""
      }`}
    >
      <div onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-4 flex-1 text-left">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center" title="Drag tours onto a day to reschedule">
              <svg className="w-5 h-5 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4-2h2v20h-2zm4 4h2v16h-2zm4 8h2v8h-2z" />
              </svg>
            </div>
            <div>
              <p className={`text-sm font-semibold ${dayColor} ${dayTextColor} px-2 py-1 rounded`}>
                Day {day.dayNumber} {day.dayOfWeek}, {day.date}
              </p>
              {showDropHighlight ? (
                <p className="text-xs font-medium text-[#af8a10] mt-1">Drop tour here to move to this day</p>
              ) : null}
              <div className="flex gap-2 items-center mt-2 mb-2">

                <h3 className="text-lg font-bold text-foreground">{day.title}</h3>
                <span className="font-medium">{itinerary?.arrival_heading?.[day.id]}</span>
              </div>
              <div className="flex justify-between gap-5 space-y-0.5 text-sm text-foreground">
                <p>
                  <span className="font-semibold">Destination:</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    {day.destination ||
                      itinerary?.arrival_location?.[day.id] ||
                      ""}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Hotel:</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    {day.hotel || ""}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border px-6 py-4 space-y-3 bg-muted/30">
          {day.activities.length > 0 ? (
            <SortableContext items={day.activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              {day.activities.map((activity) => (
                <ActivityListItem
                  key={activity.id}
                  activity={activity}
                  onSelect={() => onActivitySelect(activity)}
                  onRemove={handleRemoveActivity}
                  currentUserId={currentUserId}
                  advisorUserId={advisorUserId ?? itinerary?.user_id ?? null}
                  isSelected={selectedActivityId === activity.id}
                  showBidInfo={showBidInfo}
                  itineraryId={itineraryId}
                  itineraryName={itinerary?.name}
                  onCancelTransferzBooking={onCancelTransferzBooking}
                  isMoving={movingActivityId === activity.id}
                  onBookingStatusChange={onJobSaved}
                  viewerIsAdmin={viewerIsAdmin}
                />
              ))}
            </SortableContext>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No jobs added yet</p>
            </div>
          )}
          <div className="pt-4 border-t border-border flex gap-2">
            <button
              type="button"
              onClick={() => setJobOpen(true)}
              aria-label="Add Activity"
              className="w-full h-14 md:h-16  rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/40 transition-colors flex items-center justify-center"
            >
              <span className="inline-flex text-nowrap cursor-pointer items-center justify-center h-8 w-16 rounded-lg bg-muted text-muted-foreground">
                Add Job
              </span>
              <span className="sr-only">Add Activity</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTourDay()}
              aria-label="Select from tour library"
              className="w-full h-14 md:h-16  rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 hover:bg-muted/40 transition-colors flex items-center justify-center"
            >
              <span className="inline-flex text-nowrap cursor-pointer items-center justify-center h-8 px-3 rounded-lg bg-muted text-muted-foreground">
                Select from library
              </span>
              <span className="sr-only">Select from library</span>
            </button>
          </div>
        </div>
      )}
      <CreateJobModal
        open={jobOpen}
        onOpenChange={setJobOpen}
        activityTitle={day.title}
        itineraryId={itineraryId}
        activityDateISO={activityDateISO ?? null}
        onSave={() => {
          // inform parent to refresh jobs
          onJobSaved?.()
          setEditJobId(null)
        }}
      />

      {/* <ArrivalDate dateOpen={dateOpen} setDateOpen={setDateOpen} selectedDate={selectedDate} itineraryId={itineraryId} /> */}

    </Card>
  )
}
