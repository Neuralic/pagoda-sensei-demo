"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Tour, TourItinerary } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Users } from "lucide-react";
import Link from "next/link";
import TourCard from "@/components/tour_library/tour-card";
import { SearchInput } from "@/components/job_board/search-input";
import { SortDropdown } from "@/components/job_board/sort-dropdown";
import { activityTypeMatchesFilter } from "@/lib/tour-activity-types";
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
import toast from "react-hot-toast";
import { mapApiTourRowToTour } from "@/lib/map-api-tour-row-to-tour";
import { useBootstrap } from "@/components/shared/bootstrap-context";

const CreateTourModal = dynamic(
  () =>
    import("@/components/tour_library/create-tour-modal").then((m) => ({
      default: m.CreateTourModal,
    })),
  { ssr: false }
);

const TourDetailModal = dynamic(
  () =>
    import("@/components/tour_library/tour-detail-modal").then((m) => ({
      default: m.TourDetailModal,
    })),
  { ssr: false }
);

const SelectTourForCopyModal = dynamic(
  () =>
    import("@/components/tour_library/select-tour-for-copy-modal").then((m) => ({
      default: m.SelectTourForCopyModal,
    })),
  { ssr: false }
);

const UpdateTourModal = dynamic(
  () =>
    import("@/components/tour_library/edit-tour-modal").then((m) => ({
      default: m.UpdateTourModal,
    })),
  { ssr: false }
);

export default function GuideTourLibraryView() {
  const { user } = useBootstrap();
  const isOperator = Boolean(user?.isOperator);
  const isManagedGuide = Boolean(user?.isManagedGuide);
  const accessBlocked = user?.role === "guide" && isManagedGuide;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [sourceTourForCreate, setSourceTourForCreate] = useState<Tour | null>(null);
  const [selectTourForCopyOpen, setSelectTourForCopyOpen] = useState<boolean>(false);
  const [openTourModal, setOpenTourModal] = useState<boolean>(false);
  const [editButton, setEditButton] = useState<boolean>(true);
  const [tours, setTours] = useState<Tour[]>([]);
  const [dataUpdate, setDataUpdate] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-created");
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [editTour, setEditTour] = useState<Tour | null>(null);
  const [deleteTour, setDeleteTour] = useState<Tour | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filters, setFilters] = useState({
    location: "",
    dateRange: { start: "", end: "" },
    status: "",
    activityType: "",
    priceRange: "",
  });

  const [loading, setLoading] = useState(false);
  const [guideApproved, setGuideApproved] = useState<boolean | null>(null);
  const handleItineraryCreated = () => {
    setDataUpdate((prev) => prev + 1);
  };
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    async function fetchTours() {
      try {
        setLoading(true);
        setGuideApproved(user?.guideApproved !== false);

        const response = await fetch(`/api/tour/${userId}`, { cache: "no-store" });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (cancelled) return;

        if (data.ok && data.tours) {
          const mapped = data.tours.map((apiJob: Tour) =>
            mapApiTourRowToTour(apiJob as Partial<Tour> & Record<string, unknown>)
          );
          setTours(mapped);
        } else {
          setTours([]);
        }
      } catch (error) {
        console.error("Error fetching tours:", error);
        if (!cancelled) setTours([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTours();
    return () => {
      cancelled = true;
    };
  }, [dataUpdate, user?.guideApproved, user?.id]);

  const hasActiveFilters =
    filters.location ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.activityType ||
    filters.priceRange;

  const handleFiltersChange = (newFilters: {
    location: string;
    dateRange: { start: string; end: string };
    status: string;
    activityType?: string;
    priceRange?: string;
  }) => {
    setFilters({
      ...newFilters,
      activityType: newFilters.activityType || "",
      priceRange: newFilters.priceRange || "",
    });
  };

  const clearFilters = () => {
    setFilters({
      location: "",
      dateRange: { start: "", end: "" },
      status: "",
      activityType: "",
      priceRange: "",
    });
  };

  const filteredJobs = tours.filter((tour) => {
    const location = (tour.location ?? "").toLowerCase();
    const matchesSearch =
      tour?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      location.includes(searchQuery.toLowerCase()) ||
      tour.activity_type?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLocation =
      !filters.location || location.includes(filters.location.toLowerCase());

    const matchesActivityType = activityTypeMatchesFilter(
      tour.activity_type,
      filters.activityType
    );

    const matchesDateRange = (() => {
      if (!filters.dateRange.start && !filters.dateRange.end) return true;

      const tourDate = tour.start_time ? new Date(tour.start_time) : null;
      if (!tourDate) return false;

      if (filters.dateRange.start && filters.dateRange.end) {
        const startDate = new Date(filters.dateRange.start);
        const endDate = new Date(filters.dateRange.end);
        return tourDate >= startDate && tourDate <= endDate;
      }

      if (filters.dateRange.start) {
        const startDate = new Date(filters.dateRange.start);
        return tourDate >= startDate;
      }

      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end);
        return tourDate <= endDate;
      }

      return true;
    })();

    return matchesSearch && matchesLocation && matchesActivityType && matchesDateRange;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (a?.title ?? "").localeCompare(b?.title ?? "");
      case "location":
        return (a?.location ?? "").localeCompare(b?.location ?? "");
      case "date-start":
        return (
          new Date(a?.start_time ?? "").getTime() - new Date(b?.start_time ?? "").getTime()
        );
      case "date-created":
      default:
        return (
          new Date(b?.postedDate ?? "").getTime() - new Date(a?.postedDate ?? "").getTime()
        );
    }
  });

  const handleViewTour = (tour: Tour) => {
    setSelectedTour(tour);
    setOpenTourModal(true);
  };

  const handleCreateFromTour = (tour: Tour) => {
    setSourceTourForCreate(tour);
    setOpenTourModal(false);
    setSelectTourForCopyOpen(false);
    setIsCreateModalOpen(true);
  };

  const handleEditTour = (tour: Tour) => {
    setEditTour(tour);
    setEditOpen(true);
  };

  const handleDeleteTour = (tour: Tour) => {
    setDeleteTour(tour);
    setDeleteModalOpen(true);
  };

  const confirmDeleteTour = async () => {
    if (!deleteTour) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/tour?id=${deleteTour.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete tour");
      }

      toast.success("Tour deleted successfully");
      setDeleteModalOpen(false);
      setDeleteTour(null);
      setDataUpdate((prev) => prev + 1);
    } catch (error) {
      console.error("Error deleting tour:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete tour");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="min-h-screen container mx-auto bg-background">
      <div className="mx-auto px-10 py-8">
        {accessBlocked ? (
          <div className="max-w-lg mx-auto py-16 text-center space-y-4">
            <h1 className="text-2xl font-bold">Tour Library</h1>
            <p className="text-muted-foreground">
              Tour Library is for tour operators. Team guides use the Jobs Board to bid on trips
              assigned by your operator.
            </p>
            <Button asChild variant="outline" className="border-[#D4AA25] text-[#D4AA25]">
              <Link href="/guide/landing">Back to Jobs Board</Link>
            </Button>
          </div>
        ) : (
          <>
            {guideApproved === false && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                <p className="font-medium">Your guide account is pending approval</p>
                <p className="mt-1 text-sm">
                  An administrator must approve your account before you can apply for jobs or
                  perform other activities. You will be notified once your account is approved.
                </p>
              </div>
            )}
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-3xl font-bold mb-2">Tour Library</h1>
              <div className="flex gap-2 flex-wrap">
                {isOperator && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer gap-2"
                    asChild
                  >
                    <Link href="/guide/my-guides">
                      <Users className="w-4 h-4" />
                      My Guides
                    </Link>
                  </Button>
                )}
                {isOperator && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer gap-2"
                    asChild
                  >
                    <Link href="/guide/guide-tour-assignments">
                      <Users className="w-4 h-4" />
                      Tour assignments
                    </Link>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer gap-2"
                  disabled={tours.length === 0}
                  onClick={() => setSelectTourForCopyOpen(true)}
                >
                  <Copy className="w-4 h-4" />
                  New from existing
                </Button>
                <Button
                  className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white cursor-pointer gap-2"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  New Tour
                </Button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center justify-between ">
              <div className="flex gap-4 w-full">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search tours by title, location, or activity type..."
                />
              </div>

              <div className="flex gap-3 items-center">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-muted-foreground"
                  >
                    Clear filters
                  </Button>
                )}
                <SortDropdown value={sortBy} onChange={setSortBy} />
              </div>
            </div>

            {loading && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading tours...</p>
              </div>
            )}

            {!loading && sortedJobs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedJobs.map((tour) => (
                  <TourCard
                    key={tour.id}
                    {...tour}
                    languages={
                      Array.isArray(tour.languages)
                        ? tour.languages
                        : typeof tour.languages === "string"
                          ? tour.languages.split(",").map((s) => s.trim()).filter(Boolean)
                          : []
                    }
                    onView={() => handleViewTour(tour)}
                    onEdit={() => handleEditTour(tour)}
                    onDelete={() => handleDeleteTour(tour)}
                    onDuplicate={() => handleCreateFromTour(tour)}
                    editButton={editButton}
                  />
                ))}
              </div>
            )}

            {!loading && sortedJobs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {tours.length === 0
                    ? "No tours available"
                    : "No tours match your search criteria"}
                </p>
                {tours.length === 0 && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => window.location.reload()}
                  >
                    Refresh
                  </Button>
                )}
              </div>
            )}

            {isCreateModalOpen && (
              <CreateTourModal
                open={isCreateModalOpen}
                onOpenChange={(open) => {
                  if (!open) setSourceTourForCreate(null);
                  setIsCreateModalOpen(open);
                }}
                onItineraryCreated={handleItineraryCreated as unknown as (tour: TourItinerary) => void}
                sourceTour={sourceTourForCreate}
              />
            )}

            {selectTourForCopyOpen && (
              <SelectTourForCopyModal
                open={selectTourForCopyOpen}
                onOpenChange={setSelectTourForCopyOpen}
                tours={tours}
                onSelectTour={handleCreateFromTour}
              />
            )}

            {openTourModal && (
              <TourDetailModal
                isOpen={openTourModal}
                onClose={setOpenTourModal}
                selectedTour={selectedTour}
                onCreateFromTour={handleCreateFromTour}
                showCreateFromTour
              />
            )}

            {editOpen && (
              <UpdateTourModal
                dataUpdate={dataUpdate}
                setDataUpdate={setDataUpdate}
                open={editOpen}
                onOpenChange={setEditOpen}
                tour={editTour}
              />
            )}

            <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">Delete Tour</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4">
                      <div>
                        Are you sure you want to delete{" "}
                        <strong>
                          &quot;{deleteTour?.title || deleteTour?.name || "this tour"}&quot;
                        </strong>
                        ?
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="text-amber-800 text-sm">
                          This action cannot be undone. The tour will be permanently removed.
                        </div>
                      </div>

                      <div className="text-sm text-muted-foreground pt-2">
                        Please confirm you want to proceed with this deletion.
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    disabled={isDeleting}
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setDeleteTour(null);
                    }}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmDeleteTour}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "Deleting..." : "Delete Tour"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </main>
  );
}
