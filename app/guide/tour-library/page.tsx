"use client";
import React, { useEffect, useState } from 'react';
import { CardItinerary, Tour, TourItinerary } from '@/app/types';
import { CreateTourModal } from '@/components/tour_library/create-tour-modal';
import { Button } from '@/components/ui/button';
import { Plus, Copy, Users } from 'lucide-react';
import Link from 'next/link';
import TourCard from '../../../components/tour_library/tour-card';
import { SearchInput } from '@/components/job_board/search-input';
import { SortDropdown } from '@/components/job_board/sort-dropdown';
import { TourDetailModal } from '@/components/tour_library/tour-detail-modal';
import { SelectTourForCopyModal } from '@/components/tour_library/select-tour-for-copy-modal';
import { UpdateTourModal } from '@/components/tour_library/edit-tour-modal';
import { activityTypeMatchesFilter } from '@/lib/tour-activity-types';
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
import toast from 'react-hot-toast';
import { mapApiTourRowToTour } from '@/lib/map-api-tour-row-to-tour';
import { useBootstrap } from '@/components/shared/bootstrap-context';



const Page = () => {
  const { user } = useBootstrap();
  const isOperator = Boolean(user?.isOperator);
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
    priceRange: ""
  });
 
  const [loading, setLoading] = useState(true);
  const [guideApproved, setGuideApproved] = useState<boolean | null>(null);
  const handleItineraryCreated = (newItinerary: CardItinerary) => {
    // Refresh the tour list by incrementing dataUpdate, which triggers useEffect to refetch
    setDataUpdate(prev => prev + 1);
  };
  const [editOpen, setEditOpen] = useState(false)
  useEffect(() => {
    const fetchTours = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const userData = await res.json();
        if (userData?.user) {
          setGuideApproved(userData.user.guideApproved !== false);
        }

        // 👇 Fetch tours for this user if user_id exists, else get all tours
        const endpoint = `/api/tour/${userData.user.id}`;
        const response = await fetch(endpoint);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

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
        setTours([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTours();
  }, [dataUpdate]);


  const hasActiveFilters = filters.location ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.activityType ||
    filters.priceRange
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
      priceRange: newFilters.priceRange || ""
    })
  }


  const clearFilters = () => {
    setFilters({
      location: "",
      dateRange: { start: "", end: "" },
      status: "",
      activityType: "",
      priceRange: ""
    })
  }


  // Filter and search jobs
  const filteredJobs = tours.filter((tour) => {
    const matchesSearch =
      tour?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tour.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tour.activity_type?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesLocation = !filters.location ||
      tour.location.toLowerCase().includes(filters.location.toLowerCase())

    const matchesActivityType = activityTypeMatchesFilter(
      tour.activity_type,
      filters.activityType
    )

    // Add date range filtering
    const matchesDateRange = (() => {
      if (!filters.dateRange.start && !filters.dateRange.end) return true
      
      const tourDate = tour.start_time ? new Date(tour.start_time) : null
      if (!tourDate) return false
      
      if (filters.dateRange.start && filters.dateRange.end) {
        const startDate = new Date(filters.dateRange.start)
        const endDate = new Date(filters.dateRange.end)
        return tourDate >= startDate && tourDate <= endDate
      }
      
      if (filters.dateRange.start) {
        const startDate = new Date(filters.dateRange.start)
        return tourDate >= startDate
      }
      
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end)
        return tourDate <= endDate
      }
      
      return true
    })()

    return matchesSearch && matchesLocation && matchesActivityType && matchesDateRange
  })



  // Sort jobs
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (a?.title ?? '').localeCompare(b?.title ?? '');

      case "location":
        return (a?.location ?? '').localeCompare(b?.location ?? '');

      case "date-start":
        return new Date(a?.start_time ?? '').getTime() - new Date(b?.start_time ?? '').getTime();

      case "date-created":
      default:
        return new Date(b?.postedDate ?? '').getTime() - new Date(a?.postedDate ?? '').getTime();
    }
  });


  const handleViewTour = (tour: Tour) => {
    setSelectedTour(tour)
    setOpenTourModal(true)
  }

  const handleCreateFromTour = (tour: Tour) => {
    setSourceTourForCreate(tour);
    setOpenTourModal(false);
    setSelectTourForCopyOpen(false);
    setIsCreateModalOpen(true);
  }


  const handleEditTour = (tour: Tour) => {
    setEditTour(tour)
    setEditOpen(true)
  }

  const handleDeleteTour = (tour: Tour) => {
    setDeleteTour(tour);
    setDeleteModalOpen(true);
  }

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
      // Refresh the tour list
      setDataUpdate(prev => prev + 1);
    } catch (error) {
      console.error("Error deleting tour:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete tour");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen container mx-auto bg-background">
      <div className="mx-auto px-10 py-8">
        {guideApproved === false && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <p className="font-medium">Your guide account is pending approval</p>
            <p className="mt-1 text-sm">
              An administrator must approve your account before you can apply for jobs or perform other activities. You will be notified once your account is approved.
            </p>
          </div>
        )}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold mb-2">Tour Library</h1>
          <div className="flex gap-2 flex-wrap">
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
        {/* Search and Filter Section */}
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
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                Clear filters
              </Button>
            )}
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading tours...</p>
          </div>
        )}


        {/* Tours Grid */}
        {!loading && sortedJobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedJobs.map((tour) => (
              <TourCard
                key={tour.id}
                {...tour}
                languages={Array.isArray(tour.languages) ? tour.languages : (typeof tour.languages === 'string' ? tour.languages.split(',').map((s) => s.trim()).filter(Boolean) : [])}
                onView={() => handleViewTour(tour)}
                onEdit={() => handleEditTour(tour)}
                onDelete={() => handleDeleteTour(tour)}
                onDuplicate={() => handleCreateFromTour(tour)}
                editButton={editButton}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && sortedJobs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {tours.length === 0 ? "No tours available" : "No tours match your search criteria"}
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


        <CreateTourModal
          open={isCreateModalOpen}
          onOpenChange={(open) => {
            if (!open) setSourceTourForCreate(null);
            setIsCreateModalOpen(open);
          }}
          onItineraryCreated={handleItineraryCreated as unknown as (tour: TourItinerary) => void}
          sourceTour={sourceTourForCreate}
        />

        <SelectTourForCopyModal
          open={selectTourForCopyOpen}
          onOpenChange={setSelectTourForCopyOpen}
          tours={tours}
          onSelectTour={handleCreateFromTour}
        />

        {/* Tour detail modal */}
        <TourDetailModal
          isOpen={openTourModal}
          onClose={setOpenTourModal}
          selectedTour={selectedTour}
          onCreateFromTour={handleCreateFromTour}
          showCreateFromTour
        />
      </div>
      {/* Edit tour modal */}
      <UpdateTourModal dataUpdate={dataUpdate} setDataUpdate={setDataUpdate} open={editOpen} onOpenChange={setEditOpen} tour={editTour} />

      {/* Delete tour confirmation modal */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete Tour
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <div>
                  Are you sure you want to delete <strong>&quot;{deleteTour?.title || deleteTour?.name || "this tour"}&quot;</strong>?
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
            <AlertDialogCancel disabled={isDeleting} onClick={() => {
              setDeleteModalOpen(false);
              setDeleteTour(null);
            }}>
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
    </main>
  )
}
export default Page
