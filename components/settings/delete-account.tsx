"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DeleteAccount() {
  return (
    <Card className="p-6 border border-red-200 bg-red-50">
      <h2 className="text-xl font-bold text-red-900 mb-2">Delete Account</h2>
      <p className="text-red-700 mb-6">
        This will permanently delete your profile and all data. This action is irreversible.
      </p>
      <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
        Delete My Account
      </Button>
    </Card>
  )
}
