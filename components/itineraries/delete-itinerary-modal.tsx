"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DeleteItineraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  itineraryTitle: string
  jobsCount: number
  loading?: boolean
}

export function DeleteItineraryModal({
  open,
  onOpenChange,
  onConfirm,
  itineraryTitle,
  jobsCount,
  loading = false
}: DeleteItineraryModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Delete Itinerary
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div>
                Are you sure you want to delete <strong>&quot;{itineraryTitle}&quot;</strong>?
              </div>
              
              {jobsCount > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="text-red-800 font-medium text-sm">
                    This action will also delete {jobsCount} related job{jobsCount !== 1 ? 's' : ''} associated with this itinerary.
                  </div>
                  <div className="text-red-700 text-sm mt-2">
                    This action cannot be undone. All data including job details, applications, and related information will be permanently removed.
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="text-amber-800 text-sm">
                    This action cannot be undone. The itinerary will be permanently removed.
                  </div>
                </div>
              )}
              
              <div className="text-sm text-muted-foreground pt-2">
                Please confirm you want to proceed with this deletion.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting..." : "Delete Itinerary"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}