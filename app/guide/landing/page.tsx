"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItineraryCard } from "@/components/itineraries/itinerary-card";
import { FilterButton } from "@/components/itineraries/filter-button";
import { SortDropdown } from "@/components/itineraries/sort-dropdown";
import { CreateItineraryModal } from "@/components/itineraries/create-itinerary-modal";
import { CardItinerary } from "@/app/types";
import Link from "next/link";
import { EndRequestNotification } from "@/components/jobs/end-request-notification";
import { signJobOrTourImagePaths } from "@/lib/job-tour-image-sign";
import toast from "react-hot-toast";
import { useBootstrap } from "@/components/shared/bootstrap-context";
import { Users } from "lucide-react";
import { MyGuidesDashboard } from "@/components/operator/my-guides-dashboard";

function GuideLandingInner() {
  const router = useRouter();
  const { user: bootstrapUser } = useBootstrap();
  const isOperator = Boolean(bootstrapUser?.isOperator);
  const isManagedGuide = Boolean(bootstrapUser?.isManagedGuide);
  const searchParams = useSearchParams();
  const urlJobId = searchParams.get("jobId");
  const urlItineraryId = searchParams.get("itineraryId");
  const confirmPrice = searchParams.get("confirmPrice") === "1";

  // Legacy email links pointed at /guide/landing?jobId=&confirmPrice=1
  useEffect(() => {
    if (confirmPrice && urlJobId) {
      router.replace(
        `/guide/confirm-booking?jobId=${encodeURIComponent(urlJobId)}`
      );
    }
  }, [confirmPrice, urlJobId, router]);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("date-created");
  const [activeTab, setActiveTab] = useState("upcoming");
  const [items, setItems] = useState<CardItinerary[]>([]);
  const [userId, setUserId] = useState("");
  const [guideApproved, setGuideApproved] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    location: "",
    dateRange: { start: "", end: "" },
    status: "all",
  });
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

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {

        const userRes = await fetch("/api/auth/me", { cache: "no-store" });
        const userData = await userRes.json();
        if (userRes.status === 401 && userData?.suspended) {
          toast.error("Your account has been suspended. You have been logged out.");
          router.replace(userData.suspendedRole === "guide" ? "/guide/login" : "/agent/login");
          return;
        }
        if (userData?.user) {
          setUserId(userData.user.id);
          setGuideApproved(userData.user.guideApproved !== false);
        }

        const approved =
          bootstrapUser?.guideApproved !== false &&
          userData?.user?.guideApproved !== false;
        if (!approved) {
          if (!cancelled) setItems([]);
          return;
        }

        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          search: searchQuery,
          includeJobs: "true",
          timeframe: activeTab,
        });
        const res = await fetch(`/api/itineraries/all?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok)
          throw new Error(data?.error || "Failed to load");
        const apiItems: unknown[] = Array.isArray(data.itineraries)
          ? data.itineraries
          : [];

        // Map returned items to CardItinerary shape (jobs are already attached as `jobs`)
        const toDateLabel = (iso: string) => {
          try {
            const d = new Date(iso);
            return new Intl.DateTimeFormat("en-US", {
              timeZone: "UTC",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(d);
          } catch {
            return "";
          }
        };
        // First, collect all image paths that need signing
        const imagePaths: string[] = [];
        apiItems.forEach((it) => {
          const itObj = it as Record<string, unknown>;
          const jobs = Array.isArray(itObj["jobs"]) ? (itObj["jobs"] as unknown[]) : [];
          jobs.forEach((j) => {
            const job = j as Record<string, unknown>;
            const firstImage = Array.isArray(job["images"]) && job["images"] && (job["images"] as unknown[])[0]
              ? String((job["images"] as unknown[])[0])
              : "";
            if (firstImage && !firstImage.startsWith('http') && !firstImage.startsWith('/')) {
              imagePaths.push(firstImage);
            }
          });
        });

        // Sign all image URLs
        let imageUrlMap: Record<string, string> = {};
        if (imagePaths.length > 0) {
          try {
            imageUrlMap = await signJobOrTourImagePaths(imagePaths);
          } catch (err) {
            console.error("Error signing image URLs:", err);
          }
        }

        const mapped: CardItinerary[] = apiItems.map((it) => {
          const itObj = it as Record<string, unknown>;
          const sd = String(itObj["start_date"] ?? "");
          const ed = String(itObj["end_date"] ?? "");
          const start = new Date(sd);
          const end = new Date(ed);
          const diffDays = Math.max(
            1,
            Math.ceil(
              (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1
          );
          const activities = Array.isArray(itObj["jobs"])
            ? (itObj["jobs"] as unknown[]).map((j) => {
              const job = j as Record<string, unknown>;
              const startTime = job["start_time"]
                ? String(job["start_time"])
                : "";
              const endTime = job["end_time"] ? String(job["end_time"]) : "";
              const s = new Date(startTime);
              const e = new Date(endTime);
              const durMin = Math.max(0, Math.round((+e - +s) / 60000));

              // Get image path and convert to signed URL if available
              const imagePath = Array.isArray(job["images"]) &&
                job["images"] &&
                (job["images"] as unknown[])[0]
                ? String((job["images"] as unknown[])[0])
                : "";
              
              // Use signed URL if available, otherwise use path (or empty)
              const imageUrl = imagePath 
                ? (imageUrlMap[imagePath] || (imagePath.startsWith('http') || imagePath.startsWith('/') ? imagePath : ''))
                : "";

              return {
                id: String(job["id"] ?? ""),
                title: String(job["name"] ?? ""),
                location: String(job["location"] ?? ""),
                duration:
                  durMin >= 60
                    ? `${(durMin / 60).toFixed(1)} Hours`
                    : `${durMin} Min`,
                groupSize: job["group_size"]
                  ? `${String(job["group_size"])} people`
                  : "—",
                date: toDateLabel(startTime),
                languages: job["languages"]
                  ? String(job["languages"])
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                  : [],
                image: imageUrl,
                bidsCount: 0,
                postedDaysAgo: job["created_at"]
                  ? Math.max(
                    0,
                    Math.floor(
                      (Date.now() -
                        new Date(String(job["created_at"])).getTime()) /
                      86400000
                    )
                  )
                  : 0,
                job_available: job["job_available"] !== undefined ? Boolean(job["job_available"]) : true,
                bid_available_at: (job["bid_available_at"] && typeof job["bid_available_at"] === "string") ? String(job["bid_available_at"]) : null,
                isOwnTour: Boolean(job["is_own_tour"]),
              };
            })
            : [];

          return {
            id: String(itObj["id"] ?? ""),
            title: String(itObj["name"] ?? ""),
            location: String(itObj["location"] ?? ""),
            startDate: sd,
            endDate: ed,
            duration: `${diffDays} Days`,
            jobsCount: activities.length,
            unassignedCount: 0,
            activities,
          };
        });

        if (!cancelled) {
          setItems(mapped);
          setTotal(Number(data.count || 0));
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, searchQuery, bootstrapUser?.guideApproved, router, activeTab]);

  const expandedItineraryId = useMemo(() => {
    if (urlItineraryId && items.some((i) => i.id === urlItineraryId)) {
      return urlItineraryId;
    }
    if (!urlJobId || !items.length) return null;
    const it = items.find((i) => i.activities.some((a) => a.id === urlJobId));
    return it?.id ?? null;
  }, [urlJobId, urlItineraryId, items]);

  const ownTourLines = useMemo(() => {
    const lines: Array<{ jobId: string; jobTitle: string; itineraryTitle: string; itineraryId: string }> = [];
    for (const it of items) {
      for (const act of it.activities) {
        if (act.isOwnTour) {
          lines.push({
            jobId: act.id,
            jobTitle: act.title,
            itineraryTitle: it.title,
            itineraryId: it.id,
          });
        }
      }
    }
    return lines;
  }, [items]);

  return (
    <div className="container mx-auto bg-background">
      <div className="mx-auto px-10 py-5">
        {guideApproved === false && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <p className="font-medium">Your guide account is pending approval</p>
            <p className="mt-1 text-sm">
              {isManagedGuide
                ? "Pagoda must approve your account before you can view jobs and submit bids. Complete your profile in Settings while you wait."
                : isOperator
                  ? "An administrator must approve your operator account before you can use the full platform. You can still add and manage your guide team in the meantime."
                  : "An administrator must approve your account before you can apply for jobs or perform other activities. You will be notified once your account is approved."}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#af8a10] hover:underline"
              >
                Complete profile in Settings →
              </Link>
              {isOperator && (
                <Link
                  href="/guide/my-guides"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#af8a10] hover:underline"
                >
                  <Users className="h-4 w-4" />
                  My Guides →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* {isOperator && <MyGuidesDashboard />} */}

        {/* Header */}

        <div className="flex justify-between ">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Jobs Board</h1>
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Apply to jobs and manage your active gigs. Tours from your Tour Library appear here when an advisor adds them to a published itinerary — not under Guide → Tour Library.
              </p>
            </div>
          </div>
        </div>

        {(ownTourLines.length > 0 || urlJobId) && guideApproved !== false && (
          <div className="mb-6 rounded-lg border border-[#D4AA25]/40 bg-[#D4AA25]/10 px-4 py-3 text-foreground">
            <p className="font-medium text-[#af8a10]">
              {ownTourLines.length > 0 ? "Your tours on open itineraries" : "Open itinerary from email"}
            </p>
            {ownTourLines.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {ownTourLines.map((line) => (
                  <li key={line.jobId}>
                    <strong>{line.jobTitle}</strong>
                    <span className="text-muted-foreground"> — {line.itineraryTitle}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Expand the matching itinerary below to find the tour line from your email.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              To manage catalog tours (create, edit, publish), use{" "}
              <Link href="/guide/tour-library" className="font-medium text-[#af8a10] hover:underline">
                Guide → Tour Library
              </Link>
              .
            </p>
          </div>
        )}


        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-start md:items-center justify-between">
          <div className="flex gap-4 w-full">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <span className="absolute left-3 inset-y-0 flex items-center">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </span>
                <Input
                  placeholder="Search jobs by title or location..."
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

          <div className="flex gap-3">
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="upcoming" className="cursor-pointer">Upcoming Trips</TabsTrigger>
            <TabsTrigger value="completed" className="cursor-pointer">Completed Trips</TabsTrigger>
          </TabsList>
          <div className="ml-2 inline-flex flex-wrap gap-2">
            {isOperator && (
              <>
                <Link
                  href="/guide/my-guides"
                  className="inline-flex items-center gap-2 bg-[#D4AA25]/15 text-[#af8a10] px-4 py-3 rounded-md hover:bg-[#D4AA25]/25 border border-[#D4AA25]/40 transition-all duration-300"
                >
                  <Users className="h-4 w-4" />
                  My Guides
                </Link>
                <Link
                  href="/guide/tour-library"
                  className="bg-gray-100 text-gray-600 px-4 py-3 rounded-md hover:text-[#D4AA25] cursor-pointer hover:bg-white hover:border hover:border-gray-300 transition-all duration-300"
                >
                  Tour Library
                </Link>
              </>
            )}
          </div>
          <hr className="mb-6 border-t border-border" />
          
          <TabsContent value="upcoming" className="space-y-4">
            {/* Job End Request Notifications - Prominent at top */}
            <EndRequestNotification />
            {loading && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Loading itineraries…
              </div>
            )}
            {error && !loading && (
              <div className="text-sm text-red-600 py-8 text-center">
                {error}
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No itineraries yet
              </div>
            )}
            {!loading && !error && (
              <>
                <div className="space-y-4">
                  {items.map((itinerary) => (
                    <ItineraryCard
                      key={itinerary.id}
                      userId={userId}
                      itinerary={itinerary}
                      role={"guide"}
                      defaultExpanded={itinerary.id === expandedItineraryId}
                      openPriceUpdateJobId={confirmPrice ? null : urlJobId}
                      openConfirmPriceJobId={confirmPrice ? urlJobId : null}
                    />
                  ))}
                </div>

                {/* Pagination controls */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} -{" "}
                    {Math.min(page * pageSize, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      variant="outline"
                      size="sm"
                    >
                      Prev
                    </Button>
                    <Button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * pageSize >= total}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {loading && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Loading itineraries…
              </div>
            )}
            {error && !loading && (
              <div className="text-sm text-red-600 py-8 text-center">
                {error}
              </div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No completed trips yet
              </div>
            )}
            {!loading && !error && items.length > 0 && (
              <>
                <div className="space-y-4">
                  {items.map((itinerary) => (
                    <ItineraryCard
                      key={itinerary.id}
                      userId={userId}
                      itinerary={itinerary}
                      role={"guide"}
                      defaultExpanded={itinerary.id === expandedItineraryId}
                      openPriceUpdateJobId={confirmPrice ? null : urlJobId}
                      openConfirmPriceJobId={confirmPrice ? urlJobId : null}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} -{" "}
                    {Math.min(page * pageSize, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * pageSize >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        <CreateItineraryModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
        />
      </div>
    </div>
  );
}

export default function GuideLanding() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto bg-background px-10 py-5 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <GuideLandingInner />
    </Suspense>
  );
}
