"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"

export default function TourGallery() {
  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Tour Gallery</h2>

      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Upload Tour Photos</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Add up to 10 photos that will be displayed on your public profile (Max 20MB each)
        </p>
        <Button className="bg-yellow-600 hover:bg-yellow-700 text-white">Choose Photos</Button>
      </div>
    </Card>
  )
}
