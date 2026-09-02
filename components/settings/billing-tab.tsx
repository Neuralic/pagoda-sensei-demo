"use client"

import { Card } from "@/components/ui/card"

export default function BillingTab() {
  return (
    <div className="space-y-6">
      <Card className="p-6 border border-border">
        <h2 className="text-xl font-bold text-foreground mb-6">Billing Information</h2>
        <p className="text-muted-foreground">Your billing information will appear here.</p>
      </Card>
    </div>
  )
}
