"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Trash2, Edit, Copy, Archive, ArchiveRestore } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ActivityItem } from "./activity-item";
import { ItineraryHeader } from "./itinerary-header";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizeJobImagePaths, signJobOrTourImagePaths } from "@/lib/job-tour-image-sign";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { DeleteItineraryModal } from "./delete-itinerary-modal";
import { CardItinerary } from "@/app/types";
import { parseSafariDate } from "@/lib/utils";
import { countryNameFromAlpha2 } from "@/lib/transfer-booking-display";
import {
  formatTransferzFreeCancellationSummary,
  isTransferzJourneyCanceledStatus,
} from "@/lib/transferz/journey";
import { normalizeJobApplications, pickFulfillmentApplication, resolveJobGuideDisplayName } from "@/lib/guide-fulfillment";
import { isItineraryArchived } from "@/lib/itinerary-timeframe";
import { resolvePriceConfirmationStatus } from "@/lib/booking-price-confirmation";

interface Activity {
  id: string;
  title: string;
  location: string;
  duration: string;
  groupSize: string;
  date: string;
  languages: string | string[];
  image: string;
  bidsCount: number;
  postedDaysAgo: number;
  job_available?: boolean;
  application_status?: string;
  bookingStatus?: string | null;
  bookingStatusLabel?: string | null;
  displayPrice?: number | null;
  /** Linked / hired guide or operator name */
  guideName?: string | null;
  /** When false, job creator (agent) is suspended — show "no longer available" and disable apply for guides */
  creator_is_active?: boolean;
  /** ISO date when bidding opens (24h after release for non-tour-owners). If set and in future, show disabled bid + timer. */
  bid_available_at?: string | null;
  /** Transfer-provider line (not a guide job). */
  isTransferzBooking?: boolean;
  transferzJourneyCanceled?: boolean;
  transferzFreeCancellationSummary?: string | null;
  referenceCode?: string | null;
  hasCommittedGuide?: boolean;
  priceConfirmationStatus?: string | null;
  quotedGuidePriceAtRequest?: number | null;
  guideFulfillment?: {
    pickupDate?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    guideDisplayName?: string | null;
    guideWhatsapp?: string | null;
  } | null;
}

function jobActivityExtras(j: {
  reference_code?: string | null;
  guide_name?: string | null;
  job_applications?: unknown;
}) {
  const apps = normalizeJobApplications(j.job_applications as never).map((a) => a as {
        offer_status?: string;
        hire_id?: string | null;
        pickup_date?: string | null;
        pickup_time?: string | null;
        pickup_location?: string | null;
        guide_display_name?: string | null;
        guide_whatsapp?: string | null;
        fulfillment_submitted_at?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        is_finalist?: boolean | null;
        is_candidate?: boolean | null;
        price_confirmation_status?: string | null;
        quoted_guide_price_at_request?: number | null;
      });
  const fulfillmentApp = pickFulfillmentApplication(apps);
  const hasCommittedGuide = apps.some(
    (a) =>
      a.offer_status === "accepted" ||
      a.offer_status === "completed" ||
      a.offer_status === "hired" ||
      (typeof a.hire_id === "string" && a.hire_id.length > 0)
  );
  const fromJob =
    typeof j.guide_name === "string" ? j.guide_name.trim() || null : null;
  const quotedApp = apps.find((a) => a.quoted_guide_price_at_request != null);
  return {
    referenceCode: j.reference_code ?? null,
    hasCommittedGuide,
    priceConfirmationStatus:
      resolvePriceConfirmationStatus(apps) ??
      (typeof (j as { price_confirmation_status?: string | null }).price_confirmation_status === "string"
        ? (j as { price_confirmation_status: string }).price_confirmation_status
        : null),
    quotedGuidePriceAtRequest:
      quotedApp?.quoted_guide_price_at_request != null
        ? Number(quotedApp.quoted_guide_price_at_request)
        : null,
    guideName: resolveJobGuideDisplayName(apps) || fromJob,
    guideFulfillment: fulfillmentApp
      ? {
          pickupDate: fulfillmentApp.pickup_date ?? null,
          pickupTime: fulfillmentApp.pickup_time ?? null,
          pickupLocation: fulfillmentApp.pickup_location ?? null,
          guideDisplayName: fulfillmentApp.guide_display_name ?? null,
          guideWhatsapp: fulfillmentApp.guide_whatsapp ?? null,
        }
      : null,
  };
}

interface Itinerary {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  duration: string;
  jobsCount: number;
  unassignedCount: number;
  activities: Activity[];
  status?: "draft" | "published" | "banned" | "archived";
  bookingSummary?: CardItinerary["bookingSummary"];
}

interface ItineraryCardProps {
  itinerary: Itinerary;
  role: "agent" | "guide";
  onItineraryDeleted?: (itineraryId: string) => void;
  onItineraryEdit?: (itinerary: CardItinerary) => void;
  /** Reuse archived (or any) itinerary for another client */
  onReuseItinerary?: (itinerary: CardItinerary) => void;
  /** After status changes to archived / draft (restore) */
  onItineraryStatusChange?: (
    itineraryId: string,
    status: "archived" | "draft"
  ) => void;
  userId?: string;
  /** When true, card starts expanded (e.g. when opening from email link with jobId) */
  defaultExpanded?: boolean;
  /** When set, the ActivityItem with this job id will open the price update modal (guide, from email link) */
  openPriceUpdateJobId?: string | null;
  openConfirmPriceJobId?: string | null;
}

export function ItineraryCard({
  itinerary,
  role,
  onItineraryDeleted,
  onItineraryEdit,
  onReuseItinerary,
  onItineraryStatusChange,
  userId,
  defaultExpanded,
  openPriceUpdateJobId,
  openConfirmPriceJobId,
}: ItineraryCardProps) {
  const pathname = usePathname();
  const editHref = `${pathname?.startsWith("/agency") ? "/agency" : "/agent"}/edit-itinerary?itineraryId=${itinerary.id}`;
  const [isExpanded, setIsExpanded] = useState(!!defaultExpanded);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activities, setActivities] = useState<Activity[]>(
    itinerary.activities || []
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Expand when defaultExpanded is set (e.g. from email link with jobId)
  useEffect(() => {
    if (defaultExpanded) setIsExpanded(true);
  }, [defaultExpanded]);

  // Restore expanded state when returning from bids page (sessionStorage set by ActivityItem)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem("pagoda_agent_itineraries_expanded");
      if (saved === itinerary.id) {
        setIsExpanded(true);
        sessionStorage.removeItem("pagoda_agent_itineraries_expanded");
      }
    } catch (_) {}
  }, [itinerary.id]);

  const hasLoadedFromApi = useMemo(
    () =>
      activities.length > 0 &&
      (!itinerary.activities || activities !== itinerary.activities),
    [activities, itinerary.activities]
  );



  // Function to handle itinerary deletion
  const handleDeleteItinerary = async () => {
    setDeleting(true);
    try {
      const resp = await fetch(`/api/itineraries/${itinerary.id}`, {
        method: "DELETE",
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete itinerary");
      }

      toast.success("Itinerary deleted successfully!");
      setDeleteModalOpen(false);

      // Notify parent component to remove from state
      if (onItineraryDeleted) {
        onItineraryDeleted(itinerary.id);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete itinerary";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const manuallyArchived =
    String(itinerary.status || "").toLowerCase() === "archived";
  const alreadyInArchive = isItineraryArchived(itinerary);
  const canArchive =
    role === "agent" &&
    onItineraryStatusChange &&
    !alreadyInArchive &&
    itinerary.status !== "banned";
  const canRestore =
    role === "agent" && onItineraryStatusChange && manuallyArchived;

  const handleArchiveOrRestore = async (next: "archived" | "draft") => {
    if (!onItineraryStatusChange || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const resp = await fetch(`/api/itineraries/${itinerary.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update itinerary");
      }
      toast.success(
        next === "archived"
          ? "Moved to archive. Use copy to reuse it for another client."
          : "Restored to drafts."
      );
      onItineraryStatusChange(itinerary.id, next);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update itinerary";
      toast.error(msg);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Function to handle job deletion
  const handleCancelTransferzBooking = useCallback(
    async (bookingRowId: string) => {
      const res = await fetch(
        `/api/itineraries/${encodeURIComponent(itinerary.id)}/transferz-bookings/${encodeURIComponent(bookingRowId)}/cancel`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        booking?: { payload?: unknown };
      } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Cancellation failed");
      }
      const raw = data.booking?.payload;
      const p =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const js = typeof p.journeyStatus === "string" ? p.journeyStatus : null;
      setActivities((prev) =>
        prev.map((a) =>
          a.id === `transferz-${bookingRowId}`
            ? {
                ...a,
                transferzJourneyCanceled: isTransferzJourneyCanceledStatus(js),
                transferzFreeCancellationSummary: formatTransferzFreeCancellationSummary(
                  p.cancellationDetails
                ),
              }
            : a
        )
      );
    },
    [itinerary.id]
  );

  const handleDeleteJob = async (jobId: string) => {
    try {
      const isTransferLine = jobId.startsWith("transferz-");
      const resp = await fetch(
        isTransferLine
          ? `/api/itineraries/${encodeURIComponent(itinerary.id)}/transferz-bookings/${encodeURIComponent(
              jobId.replace(/^transferz-/, "")
            )}`
          : `/api/jobs/${jobId}`,
        { method: "DELETE" }
      );

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete job");
      }

      toast.success("Job deleted successfully!");

      // Remove the job from local state
      setActivities((prev) => prev.filter((activity) => activity.id !== jobId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete job";
      toast.error(msg);
    }
  };

  // just to open delete modal

  const jobStatus = async (jobId: string) => {
    try {
      const resp = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete job");
      }

      toast.success("Job  successfully!");

      // Remove the job from local state
      setActivities((prev) =>
        prev.map((activity) =>
          activity.id === jobId
            ? { ...activity, job_available: data.job_available }
            : activity
        )
      );


    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete job";
      toast.error(msg);
    }
  };

  const openDeleteModal = () => {
    setDeleteModalOpen(true);
  };


  // Helper function to extract first image from various formats (array, string, or JSON string)
  const getFirstImage = (images: unknown): string => {
    if (!images) return "";

    // If it's already an array
    if (Array.isArray(images)) {
      const firstImage = images[0];
      return typeof firstImage === 'string' && firstImage.trim() ? firstImage.trim() : "";
    }

    // If it's a string
    if (typeof images === 'string') {
      const trimmed = images.trim();
      if (!trimmed) return "";

      // Try to parse as JSON (might be a JSON string array)
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const firstImage = parsed[0];
          return typeof firstImage === 'string' && firstImage.trim() ? firstImage.trim() : "";
        }
        // If parsed to a single string, return it
        if (typeof parsed === 'string' && parsed.trim()) {
          return parsed.trim();
        }
      } catch {
        // Not JSON, treat as a single image path string
        return trimmed;
      }
    }

    return "";
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchJobs() {
      if (!isExpanded) return;
      // Avoid refetch if we already populated from API
      if (hasLoadedFromApi) return;
      setLoadingJobs(true);
      try {
        const [resp, tzResp] = await Promise.all([
          fetch(`/api/jobs?itineraryId=${encodeURIComponent(itinerary.id)}`, { cache: "no-store" }),
          role === "agent"
            ? fetch(
                `/api/itineraries/${encodeURIComponent(itinerary.id)}/transferz-bookings`,
                { cache: "no-store" }
              )
            : Promise.resolve(null as any),
        ]);
        const data = await resp.json().catch(() => null);
        const tzData = tzResp ? await tzResp.json().catch(() => null) : null;

        if (!resp.ok || !data?.ok || !Array.isArray(data.jobs)) return;


        const jobs: Array<{
          id: string;
          name: string;
          activity_type: string;
          start_time: string;
          end_time: string;
          location: string;
          description?: string | null;
          images?: string[] | null;
          languages?: string | null;
          group_size?: number | null;
          created_at?: string | null;
          job_available?: boolean;
          application_status?: string | null;
          booking_status?: string | null;
          booking_status_label?: string | null;
          displayPrice?: number | null;
          tour_id?: string | null;
          tour?: {
            id: string;
            user_id: string;
          } | null;
          bid_available_at?: string | null;
          job_applications?: unknown[];
          reference_code?: string | null;
        }> = data.jobs;

        // Collect first image paths to sign
        const imgPaths = Array.from(
          new Set(jobs.flatMap((j) => normalizeJobImagePaths(j.images)))
        );

        let urlMap: Record<string, string> = {};
        if (imgPaths.length) {
          try {
            urlMap = await signJobOrTourImagePaths(imgPaths);
          } catch {
            urlMap = {};
          }
          if (cancelled) return;
        }

        const toDateLabel = (iso: string) => {
          const d = parseSafariDate(iso);
          if (!d) return "";
          return new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(d);
        };

        const now = Date.now();

        const mapped: Activity[] = jobs.map((j) => {
          const start = parseSafariDate(j.start_time);
          const end = parseSafariDate(j.end_time);
          const firstPath = getFirstImage(j.images);
          const image = firstPath && urlMap[firstPath] ? urlMap[firstPath] : firstPath;

          const createdDate = j.created_at ? parseSafariDate(j.created_at) : null;
          const created = createdDate ? createdDate.getTime() : now;
          const postedDaysAgo = Math.max(
            0,
            Math.floor((now - created) / 86400000)
          );

          if (!start || !end) {
            // Return an object with ALL required Activity properties, with placeholders/defaults
            const bidsCount = Array.isArray(j.job_applications) ? j.job_applications.length : 0;
            return {
              id: j.id,
              title: j.name || "",
              location: j.location || "",
              duration: "—",
              groupSize: j.group_size ? `${j.group_size} people` : "—",
              date: toDateLabel(j.start_time),
              languages: j.languages ?? "",
              image,
              bidsCount,
              postedDaysAgo,
              application_status: j.application_status ?? "",
              bookingStatus: j.booking_status ?? null,
              bookingStatusLabel: j.booking_status_label ?? null,
              displayPrice: j.displayPrice ?? null,
              job_available: j.job_available,
              creator_is_active: (j as { creator_is_active?: boolean }).creator_is_active,
              // Prefer hired guide; tour.user_id is only a fallback (must be a real guide).
              guideId: (j as { guide_id?: string | null }).guide_id || j.tour?.user_id || null,
              bid_available_at: j.bid_available_at ?? null,
              ...jobActivityExtras(j),
            };
          }

          const durMin = Math.max(0, Math.round((+end - +start) / 60000));
          const duration =
            durMin >= 60
              ? `${(durMin / 60).toFixed(1)} Hours`
              : `${durMin} Min`;

          const bidsCount = Array.isArray(j.job_applications) ? j.job_applications.length : 0;
          return {
            id: j.id,
            title: j.name,
            location: j.location,
            duration,
            groupSize: j.group_size ? `${j.group_size} people` : "—",
            date: toDateLabel(j.start_time),
            languages: j.languages ?? "",
            image,
            bidsCount,
            postedDaysAgo,
            application_status: j.application_status ?? "",
            bookingStatus: j.booking_status ?? null,
            bookingStatusLabel: j.booking_status_label ?? null,
            displayPrice: j.displayPrice ?? null,
            job_available: j.job_available,
            creator_is_active: (j as { creator_is_active?: boolean }).creator_is_active,
            guideId: (j as { guide_id?: string | null }).guide_id || j.tour?.user_id || null,
            bid_available_at: j.bid_available_at ?? null,
            ...jobActivityExtras(j),
          };
        });

        const tzMapped: Activity[] =
          role === "agent" && tzResp && tzResp.ok && tzData?.ok && Array.isArray(tzData.bookings)
            ? (tzData.bookings as any[]).map((tb) => {
                const rawPayload = tb.payload;
                const payload =
                  rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
                    ? (rawPayload as Record<string, unknown>)
                    : {};
                const destCc =
                  typeof payload.destinationCountryCode === "string"
                    ? payload.destinationCountryCode
                    : null;
                const locationLabel =
                  itinerary.location?.trim() ||
                  countryNameFromAlpha2(destCc) ||
                  String(tb.location || "");
                const start = parseSafariDate(String(tb.start_time || tb.startTime || ""));
                const end = parseSafariDate(String(tb.end_time || tb.endTime || ""));
                const durMin =
                  start && end ? Math.max(0, Math.round((+end - +start) / 60000)) : 0;
                const duration =
                  durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
                const js =
                  typeof payload.journeyStatus === "string" ? payload.journeyStatus : null;
                return {
                  id: `transferz-${String(tb.id)}`,
                  title: String(tb.title || "Transfer"),
                  location: locationLabel,
                  duration: start && end ? duration : "—",
                  groupSize: "—",
                  date: toDateLabel(String(tb.start_time || tb.startTime || "")),
                  languages: [],
                  image: "/assets/placeholder.svg",
                  bidsCount: 0,
                  postedDaysAgo: 0,
                  /** So UI never treats Transferz rows like disabled marketplace jobs (`job_available` undefined was falsy). */
                  job_available: true,
                  isTransferzBooking: true,
                  transferzJourneyCanceled: isTransferzJourneyCanceledStatus(js),
                  bookingStatus: isTransferzJourneyCanceledStatus(js) ? "closed" : "booked",
                  bookingStatusLabel: isTransferzJourneyCanceledStatus(js)
                    ? "Canceled"
                    : "Booked transfer",
                  transferzFreeCancellationSummary: formatTransferzFreeCancellationSummary(
                    payload.cancellationDetails
                  ),
                } as Activity;
              })
            : [];

        const all = [...mapped, ...tzMapped].sort((a, b) => {
          // Sort by date label is coarse; best-effort stable ordering by id fallback.
          const ad = a.date || "";
          const bd = b.date || "";
          if (ad !== bd) return ad.localeCompare(bd);
          return a.id.localeCompare(b.id);
        });

        if (!cancelled) setActivities(all);
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    }
    fetchJobs();
    return () => {
      cancelled = true;
    };
  }, [isExpanded, itinerary.id, hasLoadedFromApi]);

  return (
    <>
      <Card className="overflow-hidden border border-border rounded-xl">
        <div className="p-6 hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex-1 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    <Link
                      href={editHref}
                      className="hover:underline"
                    >
                      {itinerary.title} <span className="text-muted-foreground text-sm font-normal">{role === "agent" ? "(Edit/Add)" : ""}</span>
                    </Link>
                  </h3>
                  <ItineraryHeader itinerary={itinerary} />
                </div>
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""
                      }`}
                  />
                  {/* <p className="text-sm text-muted-foreground cursor-pointer">View {role === "agent" ? "Bids" : "Jobs"}</p> */}
                </div>
              </div>
            </button>

            {role === "agent" && (
              <div className="flex items-center gap-2 ml-4">
                {onReuseItinerary && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const cardItinerary: CardItinerary = {
                        id: itinerary.id,
                        title: itinerary.title,
                        location: itinerary.location,
                        startDate: itinerary.startDate,
                        endDate: itinerary.endDate,
                        duration: itinerary.duration,
                        jobsCount: itinerary.jobsCount,
                        unassignedCount: itinerary.unassignedCount,
                        bookingSummary: itinerary.bookingSummary,
                        activities: itinerary.activities.map((act) => ({
                          ...act,
                          languages: Array.isArray(act.languages)
                            ? act.languages
                            : typeof act.languages === "string"
                              ? [act.languages]
                              : [],
                        })),
                        status: itinerary.status,
                      };
                      onReuseItinerary(cardItinerary);
                    }}
                    className="text-foreground hover:text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer w-[28px] h-[28px] p-0 [&_svg]:w-[22px]! [&_svg]:h-[22px]!"
                    title="Duplicate itinerary"
                  >
                    <Copy className="size-[22px]" />
                  </Button>
                )}
                {canArchive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleArchiveOrRestore("archived")}
                    disabled={statusUpdating}
                    className="text-foreground hover:text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer w-[28px] h-[28px] p-0 [&_svg]:w-[22px]! [&_svg]:h-[22px]!"
                    title="Move to archive"
                  >
                    <Archive className="size-[22px]" />
                  </Button>
                )}
                {canRestore && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleArchiveOrRestore("draft")}
                    disabled={statusUpdating}
                    className="text-foreground hover:text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer w-[28px] h-[28px] p-0 [&_svg]:w-[22px]! [&_svg]:h-[22px]!"
                    title="Restore to drafts"
                  >
                    <ArchiveRestore className="size-[22px]" />
                  </Button>
                )}
                {onItineraryEdit && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Convert Itinerary to CardItinerary format
                      const cardItinerary: CardItinerary = {
                        id: itinerary.id,
                        title: itinerary.title,
                        location: itinerary.location,
                        startDate: itinerary.startDate,
                        endDate: itinerary.endDate,
                        duration: itinerary.duration,
                        jobsCount: itinerary.jobsCount,
                        unassignedCount: itinerary.unassignedCount,
                        bookingSummary: itinerary.bookingSummary,
                        activities: itinerary.activities.map(act => ({
                          ...act,
                          languages: Array.isArray(act.languages) ? act.languages : typeof act.languages === 'string' ? [act.languages] : []
                        })),
                        status: itinerary.status,
                      };
                      onItineraryEdit(cardItinerary);
                    }}
                    className="text-foreground hover:text-[#D4AA25] hover:bg-[#D4AA25]/10 cursor-pointer w-[28px] h-[28px] p-0 [&_svg]:w-[22px]! [&_svg]:h-[22px]!"
                    title="Edit itinerary"
                  >
                    <Edit className="size-[26px]" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openDeleteModal}
                  disabled={deleting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer w-[28px] h-[28px] p-0 [&_svg]:w-[22px]! [&_svg]:h-[22px]!"
                  title="Delete itinerary"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-border bg-muted/30 p-6 space-y-4">
            {loadingJobs && (
              <div className="text-sm text-muted-foreground">Loading jobs…</div>
            )}
            {!loadingJobs && activities.length === 0 && (
              <div className="text-sm text-muted-foreground">No jobs yet</div>
            )}
            {!loadingJobs &&
              activities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  role={role}
                  userId={userId}
                  itineraryId={itinerary.id}
                  openPriceUpdateJobId={openPriceUpdateJobId}
                  openConfirmPriceJobId={openConfirmPriceJobId}
                  onDeleteJob={handleDeleteJob}
                  onStatusJob={jobStatus}
                  transferzCancelHandler={
                    role === "agent" ? handleCancelTransferzBooking : undefined
                  }
                />
              ))}
          </div>
        )}
      </Card>

      <DeleteItineraryModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleDeleteItinerary}
        itineraryTitle={itinerary.title}
        jobsCount={activities.length}
        loading={deleting}
      />
    </>
  );
}
