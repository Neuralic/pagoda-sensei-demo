// "use client"

// import { useState } from "react"
// import { ChevronDown, Download } from "lucide-react"
// import { Card } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { CompletedActivityCard } from "./completed-activity-card"
// import { ItineraryHeader } from "./itinerary-header"

// interface CompletedActivity {
//   id: string
//   title: string
//   location: string
//   duration: string
//   groupSize: string
//   date: string
//   languages: string[]
//   image: string
//   completedDate: string
//   status: "Completed"
// }

// interface CompletedItinerary {
//   id: string
//   title: string
//   location: string
//   startDate: string
//   endDate: string
//   duration: string
//   jobsCount: number
//   unassignedCount: number
//   activities: CompletedActivity[]
// }

// interface CompletedItineraryCardProps {
//   itinerary: CompletedItinerary
// }

// export function CompletedItineraryCard({ itinerary }: CompletedItineraryCardProps) {
//   const [isExpanded, setIsExpanded] = useState(false)

//   return (
//     <Card className="overflow-hidden border border-border">
//       <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left">
//         <div className="p-6 hover:bg-muted/50 transition-colors">
//           <div className="flex items-center justify-between">
//             <div className="flex-1">
//               <h3 className="text-lg font-semibold text-foreground mb-3">{itinerary.title}</h3>
//               <ItineraryHeader itinerary={itinerary} />
//             </div>
//             <ChevronDown
//               className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
//             />
//           </div>
//         </div>
//       </button>

//       {isExpanded && itinerary.activities.length > 0 && (
//         <div className="border-t border-border bg-muted/30 p-6 space-y-4">
//           {itinerary.activities.map((activity) => (
//             <CompletedActivityCard key={activity.id} activity={activity} />
//           ))}

//           <div className="flex gap-3 justify-end pt-4 border-t border-border">
//             <Button variant="outline" size="sm" className="gap-2 bg-transparent">
//               <Download className="w-4 h-4" />
//               Export PDF
//             </Button>
//             <Button size="sm" className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white">
//               Edit
//             </Button>
//           </div>
//         </div>
//       )}
//     </Card>
//   )
// }





"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Download } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CompletedActivityCard } from "./completed-activity-card"
import { ItineraryHeader } from "./itinerary-header"

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

interface CompletedItineraryCardProps {
  itinerary: CompletedItinerary
}

export function CompletedItineraryCard({ itinerary }: CompletedItineraryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const router = useRouter()

  const handleEdit = () => {
    router.push(`/agent/edit-itinerary?id=${itinerary.id}`)
  }

  return (
    <Card className="overflow-hidden border border-border">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full text-left">
        <div className="p-6 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-3">{itinerary.title}</h3>
              <ItineraryHeader itinerary={itinerary} />
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      {isExpanded && itinerary.activities.length > 0 && (
        <div className="border-t border-border bg-muted/30 p-6 space-y-4">
          {itinerary.activities.map((activity) => (
            <CompletedActivityCard key={activity.id} activity={{ ...activity, itineraryId: itinerary.id }} />
          ))}

          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button onClick={handleEdit} size="sm" className="bg-[#D4AA25] hover:bg-[#D4AA25] text-black">
              Edit
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
