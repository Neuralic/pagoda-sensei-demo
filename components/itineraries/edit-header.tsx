// "use client"

// import { ArrowLeft, Eye, FileText, Send, Pencil } from "lucide-react"
// import { Button } from "@/components/ui/button"
// import { useRouter } from "next/navigation"

// type EditHeaderProps = {
//   onBack?: () => void
//   onSaveEdit?: () => void
//   onPreview?: () => void
//   onExportPdf?: () => void
//   onPublish?: () => void
//   canSaveEdit?: boolean
// }

// export function EditHeader({ onBack, onSaveEdit, onPreview, onExportPdf, onPublish, canSaveEdit = true }: EditHeaderProps) {
//   const router = useRouter()

//   return (
//     <div className="border-b border-border bg-card">
//       <div className="w-full mx-auto px-4 py-4">
//         <div className="flex items-center justify-between gap-4 flex-wrap">
//           <div className="flex items-center gap-2">
//             <Button
//               variant="ghost"
//               size="icon"
//               className="h-8 w-8"
//               onClick={() => router.back()}
//             >
//               <ArrowLeft className="w-4 h-4" />
//             </Button>
//             {onSaveEdit ? (
//               <Button
//                 type="button"
//                 variant="outline"
//                 size="sm"
//                 className="gap-2 bg-transparent"
//                 onClick={onSaveEdit}
//                 disabled={!canSaveEdit}
//               >
//                 <Pencil className="w-4 h-4" />
//                 <span className="hidden sm:inline">Save & Edit</span>
//               </Button>
//             ) : null}
//           </div>

//           <div className="flex items-center gap-2 flex-wrap justify-end">
//             <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={onPreview}>
//               <Eye className="w-4 h-4" />
//               <span className="hidden sm:inline">Preview</span>
//             </Button>
//             <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={onExportPdf}>
//               <FileText className="w-4 h-4" />
//               <span className="hidden sm:inline">Export PDF</span>
//             </Button>
//             <Button className="bg-[#D4AA25] hover:bg-[#C49A1F] text-black gap-2" onClick={onPublish}>
//               <Send className="w-4 h-4" />
//               <span className="hidden sm:inline">Publish Job</span>
//             </Button>
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }

"use client";

import { useState } from "react";
import { ArrowLeft, Eye, FileText, Send, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type EditHeaderProps = {
  onBack?: () => void;
  onSaveEdit?: () => void;
  printExportPdf?: () => void | Promise<void>;
  onExportPdf?: () => void;
  onPublish?: () => void;
  canSaveEdit?: boolean;
  itineraryId?: string;
  onItineraryPublished?: () => void;
};

export function EditHeader({
  onSaveEdit,
  printExportPdf,
  onExportPdf,
  onPublish,
  canSaveEdit = true,
  itineraryId,
  onItineraryPublished,
}: EditHeaderProps) {
  const router = useRouter();
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreviewClick = async () => {
    if (!printExportPdf || previewLoading) return;
    setPreviewLoading(true);
    try {
      await Promise.resolve(printExportPdf());
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePublishClick = () => {
    if (!itineraryId) {
      toast.error("No itinerary ID provided");
      return;
    }
    setPublishModalOpen(true);
  };

  const handlePublish = async () => {
    if (!itineraryId) {
      toast.error("No itinerary ID provided");
      setPublishModalOpen(false);
      return;
    }

    setPublishing(true);
    try {
      const resp = await fetch(`/api/itineraries/${itineraryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "published",
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to publish itinerary");
      }

      setPublishModalOpen(false);

      if (onItineraryPublished) {
        onItineraryPublished();
      }

      toast.success("Itinerary published successfully!");

      if (onPublish) {
        onPublish();
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to publish itinerary";
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="border-b border-border bg-card">
      <div className="w-full mx-auto py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.back()}
            ></Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              onClick={onSaveEdit}
              disabled={!canSaveEdit}
            >
              <div
                // variant="ghost"
                // size="icon"
                className="flex items-center h-full w-full"
                onClick={() => router.back()}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Save & Edit</span>
              </div>
            </Button>
            {/* ) : null} */}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent cursor-pointer"
              onClick={handlePreviewClick}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {previewLoading ? "Preparing…" : "Preview"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent cursor-pointer"
              onClick={onExportPdf}
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Summary</span>
            </Button>
            <Button
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white gap-2 cursor-pointer"
              onClick={handlePublishClick}
              disabled={!itineraryId || publishing}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Publish Itinerary</span>
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Itinerary</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div>
                  Are you sure you want to publish this itinerary? Once published:
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="text-blue-800 font-medium text-sm">
                    • The itinerary will be visible to all tour guides
                  </div>
                  <div className="text-blue-800 font-medium text-sm">
                    • Tour Library jobs will be released for bidding (24-hour exclusive window starts)
                  </div>
                  <div className="text-blue-800 font-medium text-sm">
                    • All candidates will be converted to hired status
                  </div>
                  <div className="text-blue-800 font-medium text-sm">
                    • Guides will receive notifications about available jobs
                  </div>
                </div>
                <div className="text-sm text-muted-foreground pt-2">
                  This action will make the itinerary public and allow guides to bid on jobs.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePublish}
              disabled={publishing}
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            >
              {publishing ? "Publishing..." : "Publish Itinerary"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
