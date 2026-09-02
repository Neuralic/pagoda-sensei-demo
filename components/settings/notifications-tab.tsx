"use client"

import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

export default function NotificationsTab() {
  return (
    <div className="space-y-6">
      <Card className="p-6 border border-border">
        <h2 className="text-xl font-bold text-foreground mb-6">Notification Preferences</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox defaultChecked />
            <div>
              <label className="font-medium text-foreground">Email Notifications</label>
              <p className="text-sm text-muted-foreground">Receive email updates about your account</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox defaultChecked />
            <div>
              <label className="font-medium text-foreground">Tour Inquiries</label>
              <p className="text-sm text-muted-foreground">Get notified when someone inquires about your tours</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox />
            <div>
              <label className="font-medium text-foreground">Marketing Emails</label>
              <p className="text-sm text-muted-foreground">Receive promotional content and updates</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
