"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

export function SuggestedEdit() {
  const [isExpanded, setIsExpanded] = useState(true)

  if (!isExpanded) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4 my-4">
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src="/professional-man-avatar.png" />
          <AvatarFallback>T</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Takeshi Suggested An Edit</p>
          <p className="text-xs text-muted-foreground mt-1">
            Updated itinerary for your Kyoto trip, including additional cultural stops and adjusted timing for a
            smoother experience.
          </p>
        </div>
      </div>

      {/* Edit Details */}
      <div className="bg-muted rounded p-3 mb-3 text-sm">
        <p className="font-medium text-foreground mb-2">Day Trip to Kyoto - Revised Plan</p>
        <p className="text-muted-foreground text-xs mb-2">
          Updated itinerary for your Kyoto trip, including additional cultural stops and adjusted timing for a smoother
          experience.
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Suggested for:</span> Tuesday, September 2, 2025
        </p>
        <p className="text-xs text-muted-foreground">10:00 AM - 5:00 PM</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setIsExpanded(false)}>
          Cancel
        </Button>
        <Button className="bg-yellow-500 hover:bg-yellow-600 text-black" size="sm">
          Suggest Edit
        </Button>
      </div>
    </div>
  )
}
