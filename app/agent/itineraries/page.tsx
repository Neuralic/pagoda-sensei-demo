"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItineraryCard } from "@/components/itineraries/itinerary-card";
import { FilterButton } from "@/components/itineraries/filter-button";
import { SortDropdown } from "@/components/itineraries/sort-dropdown";
import { CreateItineraryModal } from "@/components/itineraries/create-itinerary-modal";
import { ReuseItineraryModal } from "@/components/itineraries/reuse-itinerary-modal";
import { CardItinerary, ApiItinerary } from "@/app/types";
import { isItineraryArchived } from "@/lib/itinerary-timeframe";

type ItinerariesTab = "draft" | "library" | "archive";

export default function ItinerariesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [userId, setUserId] = useState("");

  const [sortBy, setSortBy] = useState("date-created");
  const [activeTab, setActiveTab] = useState<ItinerariesTab>("draft");
  const [items, setItems] = useState<CardItinerary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingItinerary, setEditingItinerary] = useState<CardItinerary | null>(null);
  const [reuseItinerary, setReuseItinerary] = useState<CardItinerary | null>(null);

  const ITINERARIES_TAB_KEY = "pagoda_agent_itineraries_tab";

  useEffect(() => {
    const saved = sessionStorage.getItem(ITINERARIES_TAB_KEY);
    if (saved === "library" || saved === "draft" || saved === "archive") setActiveTab(saved);
  }, []);

  const setActiveTabAndPersist = (tab: string) => {
    if (tab !== "draft" && tab !== "library" && tab !== "archive") return;
    setActiveTab(tab);
    if (typeof window !== "undefined") sessionStorage.setItem(ITINERARIES_TAB_KEY, tab);
  };

  const [filters, setFilters] = useState({
    location: "",
    dateRange: { start: "", end: "" },
    status: "all",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [userRes, res] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/itineraries", { cache: "no-store" }),
        ]);
        const userData = await userRes.json();
        if (userRes.status === 401 && userData?.suspended) {
          toast.error("Your account has been suspended. You have been logged out.");
          router.replace(userData.suspendedRole === "guide" ? "/guide/login" : "/agent/login");
          return;
        }
        if (!cancelled) setUserId(userData?.user?.id ?? "");

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load");
        const apiItems: ApiItinerary[] = Array.isArray(data.itineraries) ? data.itineraries : [];

        const mapped: CardItinerary[] = apiItems.map((it) => {
          const sd = it.start_date;
          const ed = it.end_date;
          const start = new Date(sd);
          const end = new Date(ed);
          const diffDays = Math.max(
            1,
            Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
          );
          const itWithCounts = it as ApiItinerary & {
            jobs_count?: number;
            unassigned_count?: number;
          };
          return {
            id: it.id,
            title: it.name,
            location: it.location,
            startDate: sd,
            endDate: ed,
            duration: `${diffDays} Days`,
            jobsCount: itWithCounts.jobs_count ?? 0,
            unassignedCount: itWithCounts.unassigned_count ?? 0,
            bookingSummary: it.booking_summary,
            activities: [],
            status: it.status || "draft",
            created_at: it.created_at ?? null,
          };
        });

        if (!cancelled) setItems(mapped);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const draftCount = useMemo(
    () => items.filter((item) => item.status === "draft" && !isItineraryArchived(item)).length,
    [items]
  );
  const publishedCount = useMemo(
    () => items.filter((item) => item.status === "published" && !isItineraryArchived(item)).length,
    [items]
  );
  const archiveCount = useMemo(
    () => items.filter((item) => isItineraryArchived(item)).length,
    [items]
  );

  const filteredAndSortedItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const archived = isItineraryArchived(item);

      if (activeTab === "draft") {
        if (item.status !== "draft" || archived) return false;
      } else if (activeTab === "library") {
        if (item.status !== "published" || archived) return false;
      } else if (activeTab === "archive") {
        if (!archived) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesLocation = item.location.toLowerCase().includes(query);
        if (!matchesTitle && !matchesLocation) return false;
      }

      if (
        filters.location &&
        !item.location.toLowerCase().includes(filters.location.toLowerCase())
      ) {
        return false;
      }

      if (filters.dateRange.start && new Date(item.startDate) < new Date(filters.dateRange.start)) {
        return false;
      }

      if (filters.dateRange.end && new Date(item.endDate) > new Date(filters.dateRange.end)) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date-created": {
          const aPosted = a.created_at
            ? new Date(a.created_at).getTime()
            : new Date(a.startDate).getTime();
          const bPosted = b.created_at
            ? new Date(b.created_at).getTime()
            : new Date(b.startDate).getTime();
          return bPosted - aPosted;
        }
        case "date-start":
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        case "name":
          return a.title.localeCompare(b.title);
        case "location":
          return a.location.localeCompare(b.location);
        default:
          return 0;
      }
    });

    return filtered;
  }, [items, activeTab, searchQuery, sortBy, filters]);

  const handleItineraryCreated = (newItinerary: CardItinerary) => {
    if (editingItinerary) {
      setItems((prev) =>
        prev.map((item) => (item.id === newItinerary.id ? newItinerary : item))
      );
      setEditingItinerary(null);
    } else {
      setItems((prev) => [newItinerary, ...prev]);
    }
  };

  const handleItineraryEdit = (itinerary: CardItinerary) => {
    setEditingItinerary(itinerary);
    setIsCreateModalOpen(true);
  };

  const handleItineraryDeleted = (deletedItineraryId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== deletedItineraryId));
  };

  const handleItineraryStatusChange = (
    itineraryId: string,
    status: "archived" | "draft"
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itineraryId ? { ...item, status } : item))
    );
    if (status === "archived") {
      setActiveTabAndPersist("archive");
    } else {
      setActiveTabAndPersist("draft");
    }
  };

  const handleReuseCreated = (created: CardItinerary) => {
    setItems((prev) => [created, ...prev]);
    setActiveTabAndPersist("draft");
  };

  const handleFiltersChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  const clearFilters = () => {
    setFilters({
      location: "",
      dateRange: { start: "", end: "" },
      status: "all",
    });
    setSearchQuery("");
  };

  const hasActiveFilters =
    searchQuery.trim() || filters.location || filters.dateRange.start || filters.dateRange.end;

  const renderList = (emptyTitle: string, emptyHint?: string) => (
    <>
      {loading && (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading itineraries…</div>
      )}
      {error && !loading && (
        <div className="text-sm text-red-600 py-8 text-center">{error}</div>
      )}
      {!loading && !error && filteredAndSortedItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{emptyTitle}</p>
          {emptyHint && <p className="text-sm text-muted-foreground mb-4">{emptyHint}</p>}
          {!hasActiveFilters && activeTab === "draft" && (
            <Button
              className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white gap-2"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              New Itinerary
            </Button>
          )}
        </div>
      )}
      {!loading &&
        !error &&
        filteredAndSortedItems.map((itinerary) => (
          <ItineraryCard
            key={itinerary.id}
            userId={userId}
            itinerary={itinerary}
            role={"agent"}
            onItineraryDeleted={handleItineraryDeleted}
            onItineraryEdit={handleItineraryEdit}
            onReuseItinerary={(it) => setReuseItinerary(it)}
            onItineraryStatusChange={handleItineraryStatusChange}
          />
        ))}
    </>
  );

  return (
    <div className="min-h-screen container mx-auto bg-background">
      <div className="mx-auto px-10 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Your job postings</h1>

          <Button
            className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white cursor-pointer gap-2"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Itinerary
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center justify-between">
          <div className="flex gap-4 w-full">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <span className="absolute left-3 inset-y-0 flex items-center">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </span>
                <Input
                  placeholder="Search itineraries by title or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <FilterButton
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearFilters={clearFilters}
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

        <Tabs value={activeTab} onValueChange={setActiveTabAndPersist} className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="draft">Draft Trips ({draftCount})</TabsTrigger>
            <TabsTrigger value="library">Published Tours ({publishedCount})</TabsTrigger>
            <TabsTrigger value="archive">Archive ({archiveCount})</TabsTrigger>
          </TabsList>

          {hasActiveFilters && (
            <div className="mb-4 text-sm text-muted-foreground">
              Showing {filteredAndSortedItems.length} of {items.length} itineraries
            </div>
          )}

          <hr className="mb-6 border-t border-border" />

          <TabsContent value="draft" className="space-y-4">
            {renderList(
              hasActiveFilters ? "No draft trips match your filters" : "No draft trips yet"
            )}
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            {renderList(
              hasActiveFilters
                ? "No published itineraries match your filters"
                : "No itineraries in your library yet",
              !hasActiveFilters
                ? "Publish your draft trips to add them to your library"
                : undefined
            )}
          </TabsContent>

          <TabsContent value="archive" className="space-y-4">
            {!loading && !error && filteredAndSortedItems.length > 0 && (
              <p className="text-sm text-muted-foreground -mt-2 mb-2 flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 shrink-0" />
                Past trips and proposals you archive land here. Use copy to reuse one for another
                client, or restore an archived proposal back to drafts.
              </p>
            )}
            {renderList(
              hasActiveFilters
                ? "No archived itineraries match your filters"
                : "No archived itineraries yet",
              !hasActiveFilters
                ? "Archive declined proposals from Draft or Published, or wait until the trip end date passes"
                : undefined
            )}
          </TabsContent>
        </Tabs>

        <CreateItineraryModal
          open={isCreateModalOpen}
          onOpenChange={(open) => {
            setIsCreateModalOpen(open);
            if (!open) setEditingItinerary(null);
          }}
          onItineraryCreated={handleItineraryCreated}
          itinerary={editingItinerary}
        />

        <ReuseItineraryModal
          open={!!reuseItinerary}
          onOpenChange={(open) => {
            if (!open) setReuseItinerary(null);
          }}
          itinerary={reuseItinerary}
          onCreated={handleReuseCreated}
        />
      </div>
    </div>
  );
}
