import { MapPin, Calendar, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"

interface TripOverviewCardProps {
  itinerary: {
    title: string
    destination: string
    duration: string
    startDate: string
    endDate: string
    backgroundImage: string
  }
}

export function TripOverviewCard({ itinerary }: TripOverviewCardProps) {
  return (
    <Card className="overflow-hidden rounded-xl">
      <div
        className="relative h-48 bg-cover bg-center rounded-lg"
        style={{ backgroundImage: `url(${itinerary.backgroundImage})` }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 flex flex-col justify-end p-6">
          <h2 className="text-3xl font-bold text-white mb-4">{itinerary.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/90 rounded-lg p-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#D4AA25]" />
              <div>
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-semibold text-sm">{itinerary.destination}</p>
              </div>
            </div>
            <div className="bg-white/90 rounded-lg p-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#D4AA25]" />
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-semibold text-sm">{itinerary.duration}</p>
              </div>
            </div>
            <div className="bg-white/90 rounded-lg p-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D4AA25]" />
              <div>
                <p className="text-xs text-muted-foreground">Arrival date</p>
                <p className="font-semibold text-sm">{itinerary.startDate}</p>
              </div>
            </div>
            <div className="bg-white/90 rounded-lg p-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D4AA25]" />
              <div>
                <p className="text-xs text-muted-foreground">Departure date</p>
                <p className="font-semibold text-sm">{itinerary.endDate}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
