// import { MapPin, Calendar, Clock, Briefcase } from "lucide-react"
// import { Badge } from "@/components/ui/badge"

// interface Itinerary {
//   location: string
//   startDate: string
//   endDate: string
//   duration: string
//   jobsCount: number
//   unassignedCount: number
// }

// interface ItineraryHeaderProps {
//   itinerary: Itinerary
// }

// export function ItineraryHeader({ itinerary }: ItineraryHeaderProps) {
//   return (
//     <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
//       <div className="flex items-center gap-2">
//         <MapPin className="w-4 h-4" />
//         <span>{itinerary.location}</span>
//       </div>

//       <div className="flex items-center gap-2">
//         <Calendar className="w-4 h-4" />
//         <span>
//           {itinerary.startDate} - {itinerary.endDate}
//         </span>
//       </div>

//       <div className="flex items-center gap-2">
//         <Clock className="w-4 h-4" />
//         <span>{itinerary.duration}</span>
//       </div>

//       <div className="flex items-center gap-2">
//         <Briefcase className="w-4 h-4" />
//         <span>
//           {itinerary.jobsCount} Jobs -{" "}
//           <Badge variant="secondary" className="ml-1">
//             {itinerary.unassignedCount} Unassigned
//           </Badge>
//         </span>
//       </div>
//     </div>
//   )
// }



"use client"

import { MapPin, Calendar, Clock, Users, CircleDollarSign } from "lucide-react"
import type { ItineraryBookingSummary } from "@/app/types"

interface Itinerary {
  id: string
  title: string
  location: string
  startDate: string
  endDate: string
  duration: string
  jobsCount: number
  unassignedCount: number
  activities: unknown[]
  bookingSummary?: ItineraryBookingSummary
}

interface ItineraryHeaderProps {
  itinerary: Itinerary
}

export function ItineraryHeader({ itinerary }: ItineraryHeaderProps) {
  const summary = itinerary.bookingSummary
  const activeWork =
    (summary?.bidsReceived ?? 0) + (summary?.inProgress ?? 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <span>{itinerary.location}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>
            {itinerary.startDate} - {itinerary.endDate}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>{itinerary.duration}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span>{itinerary.jobsCount} activities</span>
        </div>
      </div>
      {summary && itinerary.jobsCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {summary.booked > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {summary.booked} booked
            </span>
          ) : null}
          {activeWork > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {activeWork} in progress
            </span>
          ) : null}
          {summary.open > 0 ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
              {summary.open} open for bids
            </span>
          ) : null}
          {summary.closed > 0 ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
              {summary.closed} closed
            </span>
          ) : null}
          <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" />
            Booked ¥{summary.bookedTotal.toLocaleString()}
            {summary.quotedTotal > summary.bookedTotal
              ? ` · Quoted ¥${summary.quotedTotal.toLocaleString()}`
              : ""}
          </span>
        </div>
      ) : null}
    </div>
  )
}
