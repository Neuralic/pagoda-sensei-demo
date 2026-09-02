"use client"

import { Card } from "@/components/ui/card"

export default function LocationSection() {
  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Location</h2>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Street Address</p>
          <p className="text-foreground">France Street of testing France, Paris</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Country</p>
            <p className="text-foreground">France</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">City</p>
            <p className="text-foreground">Paris</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Postal Code</p>
            <p className="text-foreground">5656-6655</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
