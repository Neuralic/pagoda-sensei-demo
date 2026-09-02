"use client";

import React, { useEffect, useRef, useState } from "react";
import { Tour } from "@/app/types";
import { Button } from "@/components/ui/button";
import { calculateTimeDuration, formatDate } from "@/lib/common-function";
import TourCard from "../../../components/tour_library/tour-card";
import { SearchInput } from "@/components/job_board/search-input";
import { SortDropdown } from "@/components/job_board/sort-dropdown";
import { TourDetailModal } from "@/components/tour_library/tour-detail-modal";
import { AddTourToItineraryModal } from "@/components/tour_library/add-tour-to-itinerary-modal";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";
import { tourMatchesSearchQuery } from "@/lib/tour-search";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { AssignedGuideSummary } from "@/lib/guide-tour-assignments";

type LibraryView = "all" | "favorites" | "most-sold";

const FALLBACK_AGENT: Tour["agent"] = { id: "", name: "" };

function normalizeLanguages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  return ["English"];
}

function mapCatalogTour(apiJob: Partial<Tour> & Record<string, unknown>): Tour {
  const rawImage = apiJob.image != null && String(apiJob.image).length > 0 ? apiJob.image : null;
  const imagePath =
    rawImage == null
      ? undefined
      : Array.isArray(rawImage)
        ? JSON.stringify(rawImage)
        : String(rawImage);
  const primaryImage = imagePath && imagePath.length > 0 ? imagePath : "/placeholder.svg";
  const languages = normalizeLanguages(apiJob.languages);

  return {
    id: String(apiJob.id || ""),
    image: primaryImage,
    imagePath,
    title: String(apiJob.name || apiJob.title || ""),
    name: String(apiJob.name || apiJob.title || ""),
    location: String(apiJob.location || ""),
    description: String(apiJob.description || ""),
    activity_type: canonicalizeActivityTypeLabel(String(apiJob.activity_type || "")),
    duration: calculateTimeDuration(apiJob.start_time, apiJob.end_time),
    start_time: apiJob.start_time,
    end_time: apiJob.end_time,
    people: Number(apiJob.group_size || apiJob.people || 1) || 1,
    group_size: Number(apiJob.group_size || apiJob.people || 1) || 1,
    stops: 1,
    tour_date: String(apiJob.tour_date || ""),
    highlights: String(apiJob.description || "No description provided"),
    languages,
    postedDate: formatDate(apiJob.created_at),
    created_at: String(apiJob.created_at || ""),
    agent: apiJob.agent || FALLBACK_AGENT,
    country: String(apiJob.country || ""),
    jobsCount: 0,
    unassignedCount: 0,
    activities: [],
    displayPrice: apiJob.displayPrice ?? null,
    priceLabel: typeof apiJob.priceLabel === "string" ? apiJob.priceLabel : "Total",
    pricePerAdult:
      apiJob.pricePerAdult ??
      (typeof apiJob.price_per_adult === "number" ? apiJob.price_per_adult : null),
    pricePerChild:
      apiJob.pricePerChild ??
      (typeof apiJob.price_per_child === "number" ? apiJob.price_per_child : null),
    pricePerInfant:
      apiJob.pricePerInfant ??
      (typeof apiJob.price_per_infant === "number" ? apiJob.price_per_infant : null),
    displayPricePerAdult: apiJob.displayPricePerAdult ?? null,
    displayPricePerChild: apiJob.displayPricePerChild ?? null,
    displayPricePerInfant: apiJob.displayPricePerInfant ?? null,
    pricing_model: apiJob.pricing_model ?? null,
    base_rate: apiJob.base_rate ?? null,
    base_group_size: apiJob.base_group_size ?? null,
    max_group_size: apiJob.max_group_size ?? null,
    additional_per_person_rate: apiJob.additional_per_person_rate ?? null,
    assignedGuides: apiJob.assignedGuides,
    bookingCount: Number(apiJob.bookingCount) || 0,
    isFavorite: Boolean(apiJob.isFavorite),
  };
}

function tourLanguages(tour: Tour): string[] {
  return normalizeLanguages(tour.languages);
}

export default function Page() {
  const [openTourModal, setOpenTourModal] = useState(false);
  const [addToItineraryTour, setAddToItineraryTour] = useState<Tour | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-created");
  const [libraryView, setLibraryView] = useState<LibraryView>("all");
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const openedTourIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchTours = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/tour/all");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.ok && Array.isArray(data.tours)) {
          setTours(data.tours.map((row: Partial<Tour> & Record<string, unknown>) => mapCatalogTour(row)));
        } else {
          setTours([]);
        }
      } catch {
        setTours([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchTours();
  }, []);

  useEffect(() => {
    if (loading || tours.length === 0) return;
    const tourId = new URLSearchParams(window.location.search).get("tourId");
    if (!tourId || openedTourIdRef.current === tourId) return;
    const match = tours.find((t) => String(t.id) === String(tourId));
    if (!match) return;
    openedTourIdRef.current = tourId;
    setSelectedTour(match);
    setOpenTourModal(true);
  }, [loading, tours]);

  const filteredTours = tours.filter((tour) => {
    const matchesSearch = tourMatchesSearchQuery(tour, searchQuery);
    const matchesView = libraryView !== "favorites" || Boolean(tour.isFavorite);
    return matchesSearch && matchesView;
  });

  const effectiveSort = libraryView === "most-sold" ? "most-sold" : sortBy;

  const sortedTours = [...filteredTours].sort((a, b) => {
    switch (effectiveSort) {
      case "name":
        return (a.title || a.name || "").localeCompare(b.title || b.name || "");
      case "location":
        return (a.location || "").localeCompare(b.location || "");
      case "date-start":
        return new Date(a.start_time || "").getTime() - new Date(b.start_time || "").getTime();
      case "most-sold": {
        const sold = (b.bookingCount || 0) - (a.bookingCount || 0);
        if (sold !== 0) return sold;
        return (a.title || a.name || "").localeCompare(b.title || b.name || "");
      }
      case "date-created":
      default:
        return new Date(b.postedDate || b.created_at || "").getTime() - new Date(a.postedDate || a.created_at || "").getTime();
    }
  });

  const handleToggleFavorite = async (tour: Tour) => {
    const next = !tour.isFavorite;
    setTours((prev) =>
      prev.map((t) => (String(t.id) === String(tour.id) ? { ...t, isFavorite: next } : t))
    );
    setSelectedTour((current) =>
      current && String(current.id) === String(tour.id) ? { ...current, isFavorite: next } : current
    );
    try {
      const res = await fetch("/api/tour/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId: tour.id, favorite: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not update favorite");
      }
    } catch (err) {
      setTours((prev) =>
        prev.map((t) => (String(t.id) === String(tour.id) ? { ...t, isFavorite: !next } : t))
      );
      setSelectedTour((current) =>
        current && String(current.id) === String(tour.id) ? { ...current, isFavorite: !next } : current
      );
      toast.error(err instanceof Error ? err.message : "Could not update favorite");
    }
  };

  const emptyMessage = () => {
    if (tours.length === 0) return "No tours available";
    if (libraryView === "favorites") return "No favorite tours yet. Tap the heart on a tour to save it.";
    return "No tours match your search criteria";
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto px-10 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Tour Library</h1>
          <p className="text-sm text-muted-foreground">Save favorites, or sort by most sold bookings.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center justify-between">
          <div className="flex gap-4 w-full">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by tour, location, activity, or guide name…"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex rounded-md border overflow-hidden">
              {(
                [
                  ["all", "All"],
                  ["favorites", "Favorites"],
                  ["most-sold", "Most sold"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLibraryView(value)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium",
                    libraryView === value
                      ? "bg-[#D4AA25] text-black"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {libraryView !== "most-sold" && <SortDropdown value={sortBy} onChange={setSortBy} />}
          </div>
        </div>

        {loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading tours...</p>
          </div>
        )}

        {!loading && sortedTours.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedTours.map((tour) => (
              <TourCard
                key={tour.id}
                id={tour.id}
                title={tour.title || tour.name}
                image={tour.image}
                location={tour.location}
                description={tour.description}
                activity_type={tour.activity_type}
                duration={tour.duration}
                people={tour.people}
                stops={tour.stops}
                tour_date={tour.tour_date}
                highlights={tour.highlights}
                postedDate={tour.postedDate}
                country={tour.country}
                displayPrice={tour.displayPrice}
                priceLabel={tour.priceLabel}
                pricePerAdult={tour.pricePerAdult}
                pricePerChild={tour.pricePerChild}
                pricePerInfant={tour.pricePerInfant}
                languages={tourLanguages(tour)}
                showCalculatedPriceOnly
                assignedGuides={tour.assignedGuides}
                isFavorite={Boolean(tour.isFavorite)}
                bookingCount={tour.bookingCount}
                agent={tour.agent || FALLBACK_AGENT}
                onToggleFavorite={() => void handleToggleFavorite(tour)}
                onView={() => {
                  setSelectedTour(tour);
                  setOpenTourModal(true);
                }}
                onAddToItinerary={() => setAddToItineraryTour(tour)}
              />
            ))}
          </div>
        )}

        {!loading && sortedTours.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{emptyMessage()}</p>
            {tours.length === 0 && (
              <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                Refresh
              </Button>
            )}
          </div>
        )}

        <TourDetailModal
          isOpen={openTourModal}
          onClose={setOpenTourModal}
          selectedTour={selectedTour}
          showCalculatedPriceOnly
          assignedGuides={selectedTour?.assignedGuides as AssignedGuideSummary[] | undefined}
          onAddToItinerary={setAddToItineraryTour}
        />

        <AddTourToItineraryModal
          open={!!addToItineraryTour}
          onOpenChange={(open) => {
            if (!open) setAddToItineraryTour(null);
          }}
          tour={addToItineraryTour}
        />
      </div>
    </main>
  );
}
