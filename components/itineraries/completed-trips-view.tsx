"use client"

import { CompletedItineraryCard } from "./completed-itinerary-card"

interface CompletedActivity {
  id: string
  title: string
  location: string
  duration: string
  groupSize: string
  date: string
  languages: string[]
  image: string
  completedDate: string
  status: "Completed"
}

interface CompletedItinerary {
  id: string
  title: string
  location: string
  startDate: string
  endDate: string
  duration: string
  jobsCount: number
  unassignedCount: number
  activities: CompletedActivity[]
}

interface CompletedTripsViewProps {
  itineraries: CompletedItinerary[]
}

export function CompletedTripsView({ itineraries }: CompletedTripsViewProps) {
  if (itineraries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No completed trips yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {itineraries.map((itinerary) => (
        <CompletedItineraryCard key={itinerary.id} itinerary={itinerary} />
      ))}
    </div>
  )
}
