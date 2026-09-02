"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { EditHeader } from "@/components/itineraries/edit-header";
import { TripOverviewCard } from "@/components/itineraries/trip-overview-card";
import { DaySection } from "@/components/itineraries/day-section";
import { EditActivitySidebar } from "@/components/itineraries/edit-activity-sidebar";
import { useItineraryJobDayDrag } from "@/components/itineraries/use-itinerary-job-day-drag";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { normalizeJobImagePaths, signJobOrTourImagePaths, signItineraryHeroPath } from "@/lib/job-tour-image-sign";
import { ApiItinerary, JobApplicationRow, JobRow, SidebarActivity } from "@/app/types";
import { parseIntakeData } from "@/lib/itinerary-intake";
import { citiesByDayFromStays, hotelsByDayFromStays } from "@/lib/itinerary-day-summary";
import { rememberItineraryHref } from "@/lib/navigation-memory";
import { bookingConfirmFieldsFromJob } from "@/lib/booking-price-confirmation";
import { useReactToPrint } from "react-to-print";
import { compressPdfImagesForPrint } from "@/lib/compress-pdf-images";
import { addSmartPageBreaks } from "@/components/pdf/smart-page-breaks";
import { parseSafariDate } from "@/lib/utils";
import { MultipleCandidatesModal } from "@/components/itineraries/multiple-candidates-modal";
import { checkMultipleCandidates } from "@/lib/check-multiple-candidates";
import {
  minutesBetweenLocalHHMM,
  wallTimeRangeLabel,
  jobTimeRangeLabel,
  jobCalendarDateFromTimestamp,
  jobWallClockHHMM,
} from "@/lib/itinerary-activity-timestamps";
import {
  cleanTransferDescriptionForForm,
  countryNameFromAlpha2,
} from "@/lib/transfer-booking-display";
import {
  formatTransferzFreeCancellationSummary,
  isTransferzJourneyCanceledStatus,
} from "@/lib/transferz/journey";
import {
  TRANSFERZ_ITINERARY_DEFAULT_IMAGE,
  transferzAdvisorDisplayPricing,
  type TransferzMarkupOpts,
} from "@/lib/transferz/itinerary-pricing";
import { normalizeJobApplications, resolveJobGuideDisplayName } from "@/lib/guide-fulfillment";
import {
  indexActivitiesById,
  resolveActivityListImage,
} from "@/lib/itinerary-day-section-activities";

const TourModal = dynamic(() => import("@/components/itineraries/tour-modal"), { ssr: false });
const PdfContent = dynamic(() => import("@/components/pdf/PdfContent"), { ssr: false });
const ItinerarySupportChat = dynamic(
  () =>
    import("@/components/itineraries/itinerary-support-chat").then(
      (m) => m.ItinerarySupportChat
    ),
  { ssr: false }
);
const ViewPdfModal = dynamic(() => import("@/components/pdf/ViewPdfModal"), { ssr: false });

interface Activity {
  id: string;
  title: string;
  subtitle?: string;
  time?: string;
  location?: string;
  duration?: string;
  description?: string;
  image?: string | null;
  price?: number | null;
}

type ItineraryTransferzBookingRow = {
  id: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  title: string;
  activity_type: string;
  location: string | null;
  description: string | null;
  payload: Record<string, unknown>;
};

function jobNotesTransferz(notes: unknown): boolean {
  if (typeof notes !== "string") return false;
  try {
    const o = JSON.parse(notes) as { source?: string };
    return o?.source === "transferz";
  } catch {
    return false;
  }
}

type SignedUrlResult = {
  bucket: string;
  path: string;
  signedUrl: string | null;
  publicUrl: string | null;
};
function EditItineraryPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const itineraryId = search.get("itineraryId") || "";
  const openChatFromQuery = search.get("openChat") === "1";

  useEffect(() => {
    if (!itineraryId || typeof window === "undefined") return;
    rememberItineraryHref(`${window.location.pathname}${window.location.search}`);
  }, [itineraryId]);
  const [tourOpen, setTourOpen] = useState(false)
  const [itinerary, setItinerary] = useState<ApiItinerary | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [transferzBookings, setTransferzBookings] = useState<ItineraryTransferzBookingRow[]>([]);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [selectTourDate, setSelectTourDate] = useState<string | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [jobImageMap, setJobImageMap] = useState<Record<string, string>>({});
  const [profileImageMap, setProfileImageMap] = useState<Record<string, string>>({});
  const [videoUrlMap, setVideoUrlMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<SidebarActivity | null>(null);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [multipleCandidatesModalOpen, setMultipleCandidatesModalOpen] = useState(false);
  const [jobsWithMultipleCandidates, setJobsWithMultipleCandidates] = useState<Array<{ id: string; name: string; candidateCount: number }>>([]);
  const [pendingPdfAction, setPendingPdfAction] = useState<"preview" | "edit" | null>(null);
  const [skipMultipleCandidatesCheck, setSkipMultipleCandidatesCheck] = useState(false);


  // activity data store
  const [activitiesByDay, setActivitiesByDay] = useState<Record<string, Activity[]> | undefined>();

  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const expandedDaysStorageKey = useMemo(() => {
    if (!itineraryId) return null;
    return `itinerary:${itineraryId}:expandedDays`;
  }, [itineraryId]);

  const persistExpandedDays = useCallback(
    (next: string[]) => {
      if (!expandedDaysStorageKey) return;
      try {
        localStorage.setItem(expandedDaysStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
    },
    [expandedDaysStorageKey]
  );

  const toggleDay = (dayId: string) => {
    setExpandedDays((prev) => {
      const next = prev.includes(dayId)
        ? prev.filter((id) => id !== dayId)
        : [...prev, dayId];
      persistExpandedDays(next);
      return next;
    });
  };

  const ensureDayExpanded = useCallback(
    (dayId: string) => {
      setExpandedDays((prev) => {
        if (prev.includes(dayId)) return prev;
        const next = [...prev, dayId];
        persistExpandedDays(next);
        return next;
      });
    },
    [persistExpandedDays]
  );

  type DayInfo = {
    id: string;
    iso: string;
    dayNumber: number;
    dayOfWeek: string;
    label: string;
    title: string;
    arrivalLocation: string
    summary: string[]
    hotel?: string
  };

  const enumerateDays = useCallback((start: string, end: string, arrival: Record<string, string>, summaries: Record<string, { summary: string[] }>): DayInfo[] => {

    const out: DayInfo[] = [];
    const s = new Date(start + "T00:00:00Z");
    const e = new Date(end + "T00:00:00Z");
    const dtfWeekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
    const dtfMonthDay = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    let i = 0;
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dayId = `day-${iso}`;
      const dayOfWeek = dtfWeekday.format(d);
      const label = dtfMonthDay.format(d);

      out.push({
        id: dayId,
        iso,
        dayNumber: ++i,
        dayOfWeek,
        label,
        title: `Day ${i}`,
        arrivalLocation: arrival?.[dayId] || "",
        summary: summaries?.[dayId]?.summary || [],
      });
    }
    return out;
  }, []);

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

  const transferzMarkupOpts = useMemo(
    (): TransferzMarkupOpts => ({
      itineraryMarkupPct:
        (itinerary as { markup_pct?: number | null } | null)?.markup_pct ?? null,
    }),
    [itinerary]
  );

  const toActivities = useCallback((dayISO: string): {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    time: string;
    start_time: string;
    end_time: string;
    location: string;
    duration: string;
    status: "draft" | "publish";
    application?: JobApplicationRow[] | null;
    price?: number | null;
    pricePerAdult?: number | null;
    pricePerChild?: number | null;
    pricePerInfant?: number | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    isTransferzBooking?: boolean;
    transferzJourneyCanceled?: boolean;
  }[] => {
    const jobBlocks = jobs
      .filter(
        (j) =>
          Boolean(j.start_time && jobCalendarDateFromTimestamp(j.start_time) === dayISO && !jobNotesTransferz(j.notes))
      )
      .map((j) => {
      const jAny = j as {
        displayPrice?: number | null;
        tour?: { price_per_adult?: number | null; price_per_child?: number | null; price_per_infant?: number | null } | null;
        adults?: number | null;
        children?: number | null;
        infants?: number | null;
        job_applications?: Array<{ offer_status?: string; is_finalist?: boolean; is_candidate?: boolean; price_per_adult?: number | null; price_per_child?: number | null; price_per_infant?: number | null }>;
      };
      const tour = jAny.tour;
      const hasTourPerPerson = tour?.price_per_adult != null && tour?.price_per_child != null && tour?.price_per_infant != null;
      let perPersonAndParticipants: { pricePerAdult?: number | null; pricePerChild?: number | null; pricePerInfant?: number | null; adults?: number | null; children?: number | null; infants?: number | null } = {};
      if (hasTourPerPerson) {
        perPersonAndParticipants = {
          pricePerAdult: tour!.price_per_adult ?? null,
          pricePerChild: tour!.price_per_child ?? null,
          pricePerInfant: tour!.price_per_infant ?? null,
          adults: jAny.adults ?? null,
          children: jAny.children ?? null,
          infants: jAny.infants ?? null,
        };
      } else {
        const apps = Array.isArray(jAny.job_applications) ? jAny.job_applications : [];
        const isHired = (a: { offer_status?: string }) => a?.offer_status === "completed" || a?.offer_status === "hired";
        const isFinalist = (a: { is_finalist?: boolean }) => a?.is_finalist === true;
        const isCandidate = (a: { offer_status?: string; is_candidate?: boolean }) => a?.offer_status === "candidate" || a?.is_candidate === true;
        const hasAnyFinalist = apps.some(isFinalist);
        const chosen = apps.find((a) => isHired(a)) ?? apps.find((a) => isFinalist(a)) ?? (!hasAnyFinalist ? apps.find((a) => isCandidate(a)) : undefined);
        const appPa = chosen?.price_per_adult;
        const appPc = chosen?.price_per_child;
        const appPi = chosen?.price_per_infant;
        if (appPa != null && appPc != null && appPi != null) {
          perPersonAndParticipants = {
            pricePerAdult: Number(appPa),
            pricePerChild: Number(appPc),
            pricePerInfant: Number(appPi),
            adults: jAny.adults ?? null,
            children: jAny.children ?? null,
            infants: jAny.infants ?? null,
          };
        }
      }
      const start = parseSafariDate(j.start_time);
      const end = parseSafariDate(j.end_time);
      if (!start || !end) {
        return {
          id: j.id,
          title: j.name || "",
          subtitle: j.activity_type || "",
          image: getFirstImage(j.images),
          time: "—",
          start_time: j.start_time,
          end_time: j.end_time,
          location: j.location || "",
          description: j.description || "",
          duration: "—",
          status: (j.status as "draft" | "publish") || "draft",
          application: j.job_applications,
          price: jAny.displayPrice ?? null,
          notes: (j as JobRow).notes || null,
          advisorComments: (j as JobRow).advisor_comments || null,
          ...perPersonAndParticipants,
        };
      }
      const time = jobTimeRangeLabel(j.start_time, j.end_time) || "—";
      const startHH = jobWallClockHHMM(j.start_time);
      const endHH = jobWallClockHHMM(j.end_time);
      const durFromWall =
        startHH && endHH ? minutesBetweenLocalHHMM(startHH, endHH) : null;
      const durMin =
        durFromWall ?? Math.max(0, Math.round((+end - +start) / 60000));
      const duration =
        durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
      const image = getFirstImage(j.images);
      return {
        id: j.id,
        title: j.name,
        subtitle: j.activity_type,
        image,
        time,
        start_time: j.start_time,
        end_time: j.end_time,
        location: j.location,
        description: j.description,
        duration,
        status: j.status as "draft" | "publish",
        application: j.job_applications,
        price: jAny.displayPrice ?? null,
        notes: (j as JobRow).notes || null,
        advisorComments: (j as JobRow).advisor_comments || null,
        ...perPersonAndParticipants,
      };
    });

    const tzBlocks = (transferzBookings || [])
      .filter((tb) => tb.activity_date === dayISO)
      .map((tb) => {
        const payload =
          tb.payload && typeof tb.payload === "object" && !Array.isArray(tb.payload)
            ? (tb.payload as Record<string, unknown>)
            : {};
        const destCc =
          typeof payload.destinationCountryCode === "string"
            ? payload.destinationCountryCode
            : null;
        const locationLabel =
          itinerary?.location?.trim() ||
          countryNameFromAlpha2(destCc) ||
          (tb.location || "");
        const { displayPrice: price } = transferzAdvisorDisplayPricing(
          payload,
          transferzMarkupOpts
        );
        const js = typeof payload.journeyStatus === "string" ? payload.journeyStatus : null;
        const transferzJourneyCanceled = isTransferzJourneyCanceledStatus(js);
        const psL = payload.pickupStartLocalHHMM;
        const peL = payload.pickupEndLocalHHMM;
        const wallTimeLabel = wallTimeRangeLabel(
          typeof psL === "string" ? psL : null,
          typeof peL === "string" ? peL : null
        );
        const durFromWall =
          typeof psL === "string" && typeof peL === "string"
            ? minutesBetweenLocalHHMM(psL, peL)
            : null;
        const start = parseSafariDate(tb.start_time);
        const end = parseSafariDate(tb.end_time);
        if (!start || !end) {
          const durMinEarly =
            durFromWall ?? 0;
          const durationEarly =
            durFromWall != null
              ? durMinEarly >= 60
                ? `${(durMinEarly / 60).toFixed(1)} Hours`
                : `${durMinEarly} Min`
              : "—";
          return {
            id: `transferz-${tb.id}`,
            title: tb.title,
            subtitle: tb.activity_type,
            image: TRANSFERZ_ITINERARY_DEFAULT_IMAGE,
            time: wallTimeLabel || "—",
            start_time: tb.start_time,
            end_time: tb.end_time,
            location: locationLabel,
            description: tb.description || "",
            duration: durationEarly,
            status: "draft" as const,
            application: undefined,
            price,
            adults: typeof payload.adults === "number" ? payload.adults : null,
            children: typeof payload.children === "number" ? payload.children : null,
            infants: typeof payload.infants === "number" ? payload.infants : null,
            isTransferzBooking: true,
            transferzJourneyCanceled,
          };
        }
        const pad = (n: number) => n.toString().padStart(2, "0");
        const timeFromDb = `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())} - ${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`;
        const time = wallTimeLabel || timeFromDb;
        const durMin = durFromWall ?? Math.max(0, Math.round((+end - +start) / 60000));
        const duration =
          durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
        return {
          id: `transferz-${tb.id}`,
          title: tb.title,
          subtitle: tb.activity_type,
          image: TRANSFERZ_ITINERARY_DEFAULT_IMAGE,
          time,
          start_time: tb.start_time,
          end_time: tb.end_time,
          location: locationLabel,
          description: tb.description || "",
          duration,
          status: "draft" as const,
          application: undefined,
          price,
          adults: typeof payload.adults === "number" ? payload.adults : null,
          children: typeof payload.children === "number" ? payload.children : null,
          infants: typeof payload.infants === "number" ? payload.infants : null,
          isTransferzBooking: true,
          transferzJourneyCanceled,
        };
      });

    return [...jobBlocks, ...tzBlocks].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [jobs, transferzBookings, itinerary, transferzMarkupOpts]);

  const days = useMemo(() => {
    if (!itinerary) return [];
    const base = enumerateDays(
      itinerary.start_date,
      itinerary.end_date,
      itinerary.arrival_location,
      itinerary.trips_summary
    );
    const stays = parseIntakeData(itinerary.intake_data)?.destinationStays;
    const dayIds = base.map((d) => d.id);
    const cities = citiesByDayFromStays(dayIds, stays);
    const hotels = hotelsByDayFromStays(dayIds, stays);
    return base.map((d) => ({
      ...d,
      arrivalLocation: String(d.arrivalLocation || "").trim() || cities[d.id] || "",
      hotel: hotels[d.id] || "",
    }));
  }, [itinerary, enumerateDays]);



  const daysForDrag = useMemo(
    () =>
      days.map((d) => ({
        id: d.id,
        iso: d.iso,
        dayNumber: d.dayNumber,
      })),
    [days]
  );

  const {
    activeJob,
    overDayIso,
    movingJobId,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useItineraryJobDayDrag({
    days: daysForDrag,
    jobs,
    setJobs,
    ensureDayExpanded,
  });



  const refreshJobs = useCallback(async () => {
    if (!itineraryId) return;
    const res = await fetch(
      `/api/jobs?itineraryId=${encodeURIComponent(itineraryId)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && Array.isArray(data.jobs)) {
      setJobs(data.jobs);
    }
  }, [itineraryId]);

  const refreshTransferzBookings = useCallback(async () => {
    if (!itineraryId) return;
    const res = await fetch(
      `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && Array.isArray(data.bookings)) {
      setTransferzBookings(data.bookings as ItineraryTransferzBookingRow[]);
    }
  }, [itineraryId]);

  const refreshLineItems = useCallback(async () => {
    await Promise.all([refreshJobs(), refreshTransferzBookings()]);
  }, [refreshJobs, refreshTransferzBookings]);

  const handleCancelTransferzBooking = useCallback(
    async (bookingRowId: string) => {
      if (!itineraryId) throw new Error("Missing itinerary");
      const res = await fetch(
        `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings/${encodeURIComponent(bookingRowId)}/cancel`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not cancel reservation");
      }
      await refreshLineItems();
    },
    [itineraryId, refreshLineItems]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!itineraryId) {
        setLoading(false);
        return;
      }
      try {
        // Bootstrap works for admin + advisors; /api/auth/me is users-table only, and admins
        // are not in `users`. Without this the agency portal had no viewer identity at all,
        // so an admin helping an advisor never saw the booking override the agent page has.
        try {
          const userRes = await fetch("/api/bootstrap", { cache: "no-store" });
          const userData = await userRes.json().catch(() => null);
          if (!cancelled && userData?.ok && userData?.user?.id) {
            setCurrentUserId(String(userData.user.id));
            setViewerIsAdmin(String(userData.user.role || "").toLowerCase() === "admin");
          }
        } catch {
          /* viewer identity is optional — the itinerary still loads */
        }

        const [itRes, jobsRes, tzRes] = await Promise.all([
          fetch(`/api/itineraries/${encodeURIComponent(itineraryId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/jobs?itineraryId=${encodeURIComponent(itineraryId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings`, {
            cache: "no-store",
          }),
        ]);
        const itData = await itRes.json().catch(() => null);
        const jData = await jobsRes.json().catch(() => null);
        const tzData = await tzRes.json().catch(() => null);
        if (!cancelled) {
          if (itRes.ok && itData?.ok) setItinerary(itData.itinerary);
          if (jobsRes.ok && jData?.ok && Array.isArray(jData.jobs))
            setJobs(jData.jobs);
          if (tzRes.ok && tzData?.ok && Array.isArray(tzData.bookings)) {
            setTransferzBookings(tzData.bookings as ItineraryTransferzBookingRow[]);
          } else {
            setTransferzBookings([]);
          }
        }
        // Sign itinerary hero image if present (tries itineraries → jobs → tours)
        if (itRes.ok && itData?.ok && itData.itinerary?.image) {
          try {
            const url = await signItineraryHeroPath(itData.itinerary.image);
            if (!cancelled) setHeroUrl(url);
          } catch {
            if (!cancelled) setHeroUrl(null);
          }
        } else if (!cancelled) {
          setHeroUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itineraryId]);

  // When user returns to this tab (e.g. from bids page after changing candidate), refetch jobs so PDF prices stay in sync
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && itineraryId) void refreshLineItems();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [itineraryId, refreshLineItems]);

  useEffect(() => {
    const sid = selectedActivity?.id;
    if (!sid || !sid.startsWith("transferz-")) return;
    const tid = sid.replace(/^transferz-/, "");
    const tb = transferzBookings.find((b) => String(b.id) === tid);
    if (!tb) return;
    const raw = tb.payload;
    const p =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    setSelectedActivity((prev) => {
      if (!prev || prev.id !== sid) return prev;
      const cur = prev.transferPayload;
      if (cur && JSON.stringify(cur) === JSON.stringify(p)) return prev;
      return { ...prev, transferPayload: p };
    });
  }, [transferzBookings, selectedActivity?.id]);

  useEffect(() => {
    const sid = selectedActivity?.id;
    if (!sid || sid.startsWith("transferz-")) return;
    const job = jobs.find((j) => j.id === sid);
    if (!job) return;
    setSelectedActivity((prev) => {
      if (!prev || prev.id !== sid) return prev;
      return {
        ...prev,
        title: job.name ?? prev.title,
        description: job.description ?? prev.description,
        displayPrice: job.displayPrice ?? prev.displayPrice,
        baseDisplayPrice: job.baseDisplayPrice ?? prev.baseDisplayPrice,
        lineMarkupPct: job.line_markup_pct ?? prev.lineMarkupPct,
        supplierPrice: job.supplier_price ?? prev.supplierPrice,
      };
    });
  }, [jobs, selectedActivity?.id]);

  // Whenever jobs change, sign their first image paths and cache mapping
  useEffect(() => {
    let cancelled = false;
    async function signJobImages() {
      const paths = Array.from(
        new Set(jobs.flatMap((j) => normalizeJobImagePaths(j.images)))
      );
      if (!paths.length) {
        setJobImageMap({});
        return;
      }
      try {
        const map = await signJobOrTourImagePaths(paths);
        if (!cancelled) setJobImageMap(map);
      } catch (err) {
        console.error("Error fetching signed URLs:", err);
        if (!cancelled) setJobImageMap({});
      }

    }
    signJobImages();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  // Whenever jobs change, sign profile picture paths and intro video paths from job_applications
  useEffect(() => {
    let cancelled = false;
    async function signProfileImagesAndVideos() {
      // Collect all unique profile_picture_path values from job_applications
      const profilePaths = Array.from(
        new Set(
          jobs
            .flatMap((j) => {
              if (!Array.isArray(j.job_applications)) {
                return [];
              }
              return j.job_applications
                .map((app: any) => {
                  if (app.profiles && typeof app.profiles === "object" && app.profiles.profile_picture_path) {
                    return app.profiles.profile_picture_path;
                  }
                  return null;
                })
                .filter((p): p is string => !!p)
            })
            .filter((p): p is string => !!p)
        )
      );

      // Collect all unique intro_video_path values from job_applications
      const videoPaths = Array.from(
        new Set(
          jobs
            .flatMap((j) => {
              if (!Array.isArray(j.job_applications)) {
                return [];
              }
              return j.job_applications
                .map((app: any) => {
                  if (app.profiles && typeof app.profiles === "object" && app.profiles.intro_video_path) {
                    return app.profiles.intro_video_path;
                  }
                  return null;
                })
                .filter((p): p is string => !!p && typeof p === 'string' && p.length > 0)
            })
            .filter((p): p is string => !!p)
        )
      );

      // Sign profile images
      if (profilePaths.length > 0) {
        try {
          const results = await getSignedUrls(
            profilePaths.map((p) => ({ bucket: BUCKETS.avatars, path: p }))
          );

          if (cancelled) return;

          const map: Record<string, string> = {};
          results.forEach((r, index) => {
            const path = profilePaths[index];
            const url = r.signedUrl || r.publicUrl;
            if (path && url) {
              map[path] = url;
            }
          });

          setProfileImageMap(map);
        } catch (err) {
          console.error("Error fetching profile signed URLs:", err);
          if (!cancelled) setProfileImageMap({});
        }
      } else {
        setProfileImageMap({});
      }

      // Sign intro videos
      if (videoPaths.length > 0) {
        try {
          const results = await getSignedUrls(
            videoPaths.map((p) => ({ bucket: BUCKETS.introVideos, path: p }))
          );

          if (cancelled) return;

          const map: Record<string, string> = {};
          results.forEach((r, index) => {
            const path = videoPaths[index];
            const url = r.signedUrl || r.publicUrl;
            if (path && url) {
              map[path] = url;
            }
          });

          setVideoUrlMap(map);
        } catch (err) {
          console.error("Error fetching video signed URLs:", err);
          if (!cancelled) setVideoUrlMap({});
        }
      } else {
        setVideoUrlMap({});
      }
    }
    signProfileImagesAndVideos();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  useEffect(() => {
    if (!days.length) return;
    setExpandedDays((prev) => {
      if (prev.length > 0) return prev;

      if (expandedDaysStorageKey) {
        try {
          const raw = localStorage.getItem(expandedDaysStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const valid = parsed.filter((id) => typeof id === "string");
              const dayIdSet = new Set(days.map((d) => d.id));
              const filtered = valid.filter((id) => dayIdSet.has(id));
              if (filtered.length > 0) return filtered;
            }
          }
        } catch {
          // ignore
        }
      }

      const all = days.map((d) => d.id);
      persistExpandedDays(all);
      return all;
    });
  }, [days, expandedDaysStorageKey, persistExpandedDays]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateSelectedActivityImages() {
      const id = selectedActivity?.id;
      if (!id) return;
      const job = jobs.find((j) => j.id === id);
      const paths = normalizeJobImagePaths(job?.images);
      if (!paths.length) {
        return;
      }
      if (
        selectedActivity?.images &&
        selectedActivity.images.length >= paths.length &&
        selectedActivity.images.every(
          (u) =>
            typeof u === "string" && (u.startsWith("http") || u.startsWith("/"))
        )
      ) {
        return;
      }
      try {
        const signed = await signJobOrTourImagePaths(paths);
        if (cancelled) return;
        const urls = paths
          .map((p) => signed[p])
          .filter((u): u is string => typeof u === "string" && u.length > 0);
        if (!urls.length) return;
        setSelectedActivity((prev) =>
          prev ? { ...prev, images: urls, image: urls[0] || prev.image } : prev
        );
      } catch {
        /* keep existing gallery URLs on failure */
      }
    }
    hydrateSelectedActivityImages();
    return () => {
      cancelled = true;
    };
  }, [selectedActivity?.id, jobs]);

  const handleItineraryPublished = () => {
    if (itinerary) {
      setItinerary((prev) => (prev ? { ...prev, status: "published" } : prev));
    }
  };

  // export pdf
  const itineraryRef = useRef<HTMLDivElement>(null);

  // Helper function to wait for images to load
  const waitForImages = async (): Promise<void> => {
    if (!itineraryRef.current) return;
    const images = itineraryRef.current.querySelectorAll('img');
    const imagePromises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // 5 second timeout
        img.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve(); // Continue even if image fails
        };
      });
    });
    await Promise.all(imagePromises);
  };

  const printExportPdf = useReactToPrint({
    contentRef: itineraryRef,
    documentTitle: "itinerary",
    pageStyle: `
    @page { size: A4; margin: 0; }
    body { -webkit-print-color-adjust: exact; }
  `,
    onAfterPrint: () => {
      console.log("Print dialog closed");
    },
  });

  // Wrapper function that waits for images before printing
  const handlePrintPdf = async () => {
    // Skip check if we just selected finalists
    if (!skipMultipleCandidatesCheck) {
      const jobsWithMultiple = checkMultipleCandidates(jobs);
      
      if (jobsWithMultiple.length > 0) {
        setJobsWithMultipleCandidates(jobsWithMultiple);
        setPendingPdfAction("preview");
        setMultipleCandidatesModalOpen(true);
        return;
      }
    }
    
    // Reset the flag after using it
    setSkipMultipleCandidatesCheck(false);
    // Refetch jobs + Transferz for PDF
    await refreshLineItems();
    await new Promise((r) => setTimeout(r, 200));
    await waitForImages();
    await compressPdfImagesForPrint(itineraryRef.current);
    // Add smart page breaks before printing - wait a bit for layout to settle
    if (itineraryRef.current) {
      // Force a reflow to ensure accurate measurements
      itineraryRef.current.offsetHeight;
      await new Promise((r) => setTimeout(r, 100));
      addSmartPageBreaks(itineraryRef.current);
      await new Promise((r) => setTimeout(r, 50));
    }
    printExportPdf();
  };

  // Handler for Preview button inside ViewPdfModal
  const handlePreviewFromEditModal = async () => {
    const jobsWithMultiple = checkMultipleCandidates(jobs);

    if (jobsWithMultiple.length > 0) {
      setPdfOpen(false);
      setJobsWithMultipleCandidates(jobsWithMultiple);
      setPendingPdfAction("preview");
      setMultipleCandidatesModalOpen(true);
      return;
    }

    await waitForImages();
    await compressPdfImagesForPrint(itineraryRef.current);
    if (itineraryRef.current) {
      itineraryRef.current.offsetHeight;
      await new Promise((r) => setTimeout(r, 100));
      addSmartPageBreaks(itineraryRef.current);
      await new Promise((r) => setTimeout(r, 50));
    }

    setPdfOpen(false);
    await new Promise((r) => setTimeout(r, 100));
    setSkipMultipleCandidatesCheck(true);
    printExportPdf();
  };

  const onExportPdf = async () => {
    await refreshLineItems();
    // Brief delay so activitiesByDay updates from new jobs before opening modal
    setTimeout(() => setPdfOpen(true), 150);
  }

  const handleFinalistsSelected = async () => {
    await refreshLineItems();
    // Close modal
    setMultipleCandidatesModalOpen(false);
    
    // Get the pending action before clearing it
    const action = pendingPdfAction;
    setPendingPdfAction(null);
    
    // Wait a bit for jobs to refresh
    setTimeout(async () => {
      await refreshLineItems();
      
      // Based on the action, either show PDF preview or open edit summary modal
      if (action === "preview") {
        // Preview button: Show PDF preview directly
        setSkipMultipleCandidatesCheck(true);
        await waitForImages();
        await compressPdfImagesForPrint(itineraryRef.current);
        if (itineraryRef.current) {
          itineraryRef.current.offsetHeight;
          await new Promise((r) => setTimeout(r, 100));
          addSmartPageBreaks(itineraryRef.current);
          await new Promise((r) => setTimeout(r, 50));
        }
        printExportPdf();
      } else if (action === "edit") {
        // Edit Summary button: Open ViewPdfModal (edit summary form)
        setPdfOpen(true);
      }
    }, 500);
  };

  const toggleTourDay = (dayId: string) => {
    setSelectTourDate(dayId);
    setTourOpen(true)
  };



  useEffect(() => {
    if (!itinerary || !days) return;

    const allActivities: Record<string, Activity[]> = {};

    days.forEach((d) => {
      const activities = toActivities(d.iso).map((a) => {
        // Map job images to signed URLs
        const signedImage = a.image && jobImageMap[a.image]
          ? jobImageMap[a.image]
          : a.image;

        // Map profile pictures and intro videos in applications to signed URLs
        const application = Array.isArray(a.application)
          ? a.application.map((app: any) => {
            if (app.profiles && typeof app.profiles === "object") {
              const profilePath = app.profiles.profile_picture_path;
              const videoPath = app.profiles.intro_video_path;
              
              const signedProfilePath = profilePath && profileImageMap[profilePath]
                ? profileImageMap[profilePath]
                : profilePath || null;
              
              const signedVideoPath = videoPath && videoUrlMap[videoPath]
                ? videoUrlMap[videoPath]
                : (videoPath && (videoPath.startsWith('http://') || videoPath.startsWith('https://'))
                    ? videoPath
                    : videoPath || null);
              
              return {
                ...app,
                profiles: [{
                  profile_picture_path: signedProfilePath,
                  bio: app.profiles.bio || null,
                  intro_video_path: signedVideoPath,
                }],
              };
            }
            return app;
          })
          : a.application;

        return {
          ...a,
          image: signedImage,
          application,
        };
      });
      allActivities[d.id] = activities;
    });


    setActivitiesByDay(allActivities);
  }, [days, jobImageMap, profileImageMap, videoUrlMap, itinerary, jobs, toActivities]);

  const activitiesForDaySection = useMemo(() => {
    type ListAct = {
      id: string;
      title: string;
      subtitle: string;
      image: string;
      time: string;
      location: string;
      duration: string;
      price?: number | null;
      guideName?: string | null;
      guideId?: string | null;
      bidsCount?: number;
      isTransferzBooking?: boolean;
      transferzJourneyCanceled?: boolean;
      transferzFreeCancellationSummary?: string | null;
      priceConfirmationStatus?: string | null;
      priceConfirmationLastNotifiedAt?: string | null;
      offerStatus?: string | null;
      hasCommittedGuide?: boolean;
    };
    const tzExtrasForActivity = (activityId: string, activityPrice?: number | null): Partial<ListAct> => {
      if (!activityId.startsWith("transferz-")) return {};
      const tid = activityId.replace(/^transferz-/, "");
      const tb = transferzBookings.find((b) => String(b.id) === tid);
      const p =
        tb?.payload && typeof tb.payload === "object" && !Array.isArray(tb.payload)
          ? (tb.payload as Record<string, unknown>)
          : {};
      const js = typeof p.journeyStatus === "string" ? p.journeyStatus : null;
      const { displayPrice } = transferzAdvisorDisplayPricing(p, transferzMarkupOpts);
      return {
        price:
          displayPrice != null && Number.isFinite(displayPrice)
            ? displayPrice
            : activityPrice != null && Number.isFinite(Number(activityPrice))
              ? Number(activityPrice)
              : null,
        transferzJourneyCanceled: isTransferzJourneyCanceledStatus(js),
        transferzFreeCancellationSummary: formatTransferzFreeCancellationSummary(
          p.cancellationDetails
        ),
      };
    };
    const listExtrasFromJob = (
      job: JobRow | undefined,
      activityPrice?: number | null
    ): Pick<
      ListAct,
      | "price"
      | "guideName"
      | "guideId"
      | "bidsCount"
      | "priceConfirmationStatus"
      | "priceConfirmationLastNotifiedAt"
      | "offerStatus"
      | "hasCommittedGuide"
    > => {
      const jobApps = (job as { job_applications?: unknown } | undefined)?.job_applications;
      const apps = normalizeJobApplications(
        jobApps as Parameters<typeof normalizeJobApplications>[0]
      );
      const displayPrice = (job as { displayPrice?: number | null } | undefined)?.displayPrice;
      // Prefer fresh job.displayPrice (after sidebar save/refresh) over stale activity.price
      const price =
        displayPrice != null && Number.isFinite(Number(displayPrice))
          ? Number(displayPrice)
          : activityPrice != null && Number.isFinite(Number(activityPrice))
            ? Number(activityPrice)
            : null;
      const fromApps = resolveJobGuideDisplayName(
        apps as Parameters<typeof resolveJobGuideDisplayName>[0]
      );
      const fromJob =
        typeof (job as { guide_name?: string | null } | undefined)?.guide_name === "string"
          ? String((job as { guide_name?: string | null }).guide_name).trim() || null
          : null;
      return {
        price,
        guideName: fromApps || fromJob,
        guideId:
          (job as { guide_id?: string } | undefined)?.guide_id ||
          (job as { tour?: { user_id?: string } } | undefined)?.tour?.user_id ||
          null,
        bidsCount: apps.length,
        ...bookingConfirmFieldsFromJob(job as { price_confirmation_status?: string | null; job_applications?: unknown }),
      };
    };
    const out: Record<string, ListAct[]> = {};
    if (!itinerary || !days.length) return out;

    const savedById = indexActivitiesById(activitiesByDay);

    for (const d of days) {
      out[d.id] = toActivities(d.iso).map((a) => {
        const saved = savedById.get(a.id);
        const job = jobs.find((j) => j.id === a.id);
        const isTransferz =
          Boolean((a as { isTransferzBooking?: boolean }).isTransferzBooking) ||
          a.id.startsWith("transferz-");
        const jobExtras = isTransferz
          ? {}
          : listExtrasFromJob(job, saved?.price ?? a.price ?? null);
        return {
          id: a.id,
          title: a.title,
          subtitle: a.subtitle,
          image: resolveActivityListImage(
            a.id,
            {
              image: a.image,
              // Lets a line with no photo fall back to its activity-type icon instead of
              // the generic placeholder — transfers and Shinkansen tickets never have one.
              activityType:
                (a as { activity_type?: string | null }).activity_type ?? a.subtitle ?? null,
            },
            saved,
            jobImageMap,
            TRANSFERZ_ITINERARY_DEFAULT_IMAGE
          ),
          time: saved?.time ?? a.time,
          location: saved?.location ?? a.location,
          duration: saved?.duration ?? a.duration,
          ...jobExtras,
          isTransferzBooking: isTransferz,
          ...tzExtrasForActivity(a.id, saved?.price ?? a.price ?? null),
        };
      });
    }
    return out;
  }, [itinerary, days, activitiesByDay, jobs, jobImageMap, toActivities, transferzBookings, transferzMarkupOpts]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="min-h-screen bg-background px-6">
        <EditHeader
          itineraryId={itineraryId}
          onItineraryPublished={handleItineraryPublished}
          onBack={() => router.back()}
          printExportPdf={handlePrintPdf}
          onExportPdf={onExportPdf}
        />
        <h1>Create Your Clients Itinerary</h1>
        <div style={{ width: '784px'}}>
          {itinerary && (
            <PdfContent
              eagerImagePreload={false}
              ref={itineraryRef}
              itinerary={itinerary}
              tourDays={days}
              activitiesByDay={activitiesByDay}
            />
          )}
        </div>

        <div className="w-full mx-auto py-6" >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" >
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {itinerary ? (
                <TripOverviewCard
                  itinerary={{
                    title: itinerary.name,
                    destination: itinerary.location,
                    duration: (() => {
                      const s = parseSafariDate(itinerary.start_date);
                      const e = parseSafariDate(itinerary.end_date);
                      if (!s || !e) {
                        return "1 day";
                      }
                      const days = Math.max(
                        1,
                        Math.round((+e - +s) / 86400000) + 1
                      );
                      return `${days} day${days > 1 ? "s" : ""}`;
                    })(),
                    startDate: itinerary.start_date,
                    endDate: itinerary.end_date,
                    backgroundImage: heroUrl || "/assets/images/itinerary-hero-default.jpg",
                  }}
                />
              ) : null}

              {/* Day Sections */}
              <div className="space-y-4">
                {loading && (
                  <div className="text-sm text-muted-foreground py-4">
                    Loading itinerary…
                  </div>
                )}
                {!loading &&
                  itinerary &&
                  days.map((d) => (
                    <DaySection
                      key={d.id}
                      day={{
                        id: d.id,
                        dayNumber: d.dayNumber,
                        dayOfWeek: d.dayOfWeek,
                        date: d.label,
                        title: `Day ${d.dayNumber}`,
                        startTime: "",
                        activities: activitiesForDaySection[d.id] ?? [],
                        destination: d.arrivalLocation || "",
                        hotel: d.hotel || "",
                      }}
                      isExpanded={expandedDays.includes(d.id)}
                      onToggle={() => toggleDay(d.id)}
                      onActivitySelect={(activity) => {
                        if (activity.id.startsWith("transferz-")) {
                          const tid = activity.id.replace(/^transferz-/, "");
                          const tb = transferzBookings.find((b) => b.id === tid);
                          const p =
                            tb?.payload &&
                            typeof tb.payload === "object" &&
                            !Array.isArray(tb.payload)
                              ? (tb.payload as Record<string, unknown>)
                              : {};
                          const ps = p.pickupStartLocalHHMM;
                          const pe = p.pickupEndLocalHHMM;
                          const timeFromPayload =
                            wallTimeRangeLabel(
                              typeof ps === "string" ? ps : null,
                              typeof pe === "string" ? pe : null
                            ) ?? activity.time;
                          const destCc =
                            typeof p.destinationCountryCode === "string"
                              ? p.destinationCountryCode
                              : null;
                          const locationLabel =
                            itinerary?.location?.trim() ||
                            countryNameFromAlpha2(destCc) ||
                            activity.location ||
                            "";
                          const payload: SidebarActivity = {
                            id: activity.id,
                            title: activity.title,
                            subtitle: activity.subtitle,
                            image: activity.image,
                            time: timeFromPayload,
                            location: locationLabel,
                            duration: activity.duration,
                            activityType: activity.subtitle,
                            description: cleanTransferDescriptionForForm(
                              tb?.description ?? ""
                            ),
                            activityDateISO: d.iso,
                            images: undefined,
                            languages: undefined,
                            adults:
                              typeof p.adults === "number" ? p.adults : undefined,
                            children:
                              typeof p.children === "number" ? p.children : undefined,
                            infants:
                              typeof p.infants === "number" ? p.infants : undefined,
                            notes: undefined,
                            transferPayload: p,
                            guideId: null,
                            tourId: null,
                            pickupStartLocalHHMM:
                              typeof ps === "string" ? ps : null,
                            pickupEndLocalHHMM:
                              typeof pe === "string" ? pe : null,
                          };
                          setSelectedActivity(payload);
                          return;
                        }
                        // Enrich selection with job details so the sidebar can prefill
                        const job = jobs.find((j) => j.id === activity.id);
                        const payload: SidebarActivity = {
                          id: activity.id,
                          title: activity.title,
                          subtitle: activity.subtitle,
                          image: activity.image,
                          time: activity.time,
                          location: activity.location,
                          duration: activity.duration,
                          activityType: activity.subtitle,
                          description: job?.description || undefined,
                          activityDateISO: d.iso,
                          images: job?.images || undefined,
                          languages: job?.languages ? (() => {
                            try {
                              if (typeof job.languages === 'string') {
                                const parsed = JSON.parse(job.languages);
                                return Array.isArray(parsed) ? parsed : [];
                              }
                              return Array.isArray(job.languages) ? job.languages : [];
                            } catch {
                              return [];
                            }
                          })() : undefined,
                          adults: (job as any)?.adults ?? undefined,
                          children: (job as any)?.children ?? undefined,
                          infants: (job as any)?.infants ?? undefined,
                          notes: job?.notes || undefined,
                          advisorComments: (job as { advisor_comments?: string | null })?.advisor_comments || undefined,
                          guideId: (job as { guide_id?: string | null })?.guide_id || null,
                          tourId: (job as { tour_id?: string | null })?.tour_id || null,
                          ...bookingConfirmFieldsFromJob(
                            job as { price_confirmation_status?: string | null; job_applications?: unknown }
                          ),
                        };
                        setSelectedActivity(payload);
                      }}
                      itineraryId={itinerary.id}
                      activityDateISO={d.iso}
                      onJobSaved={refreshLineItems}
                      toggleTourDay={() => toggleTourDay(d.id)}
                      itinerary={itinerary}
                      currentUserId={currentUserId}
                      viewerIsAdmin={viewerIsAdmin}
                      advisorUserId={itinerary.user_id ?? null}
                      selectedActivityId={selectedActivity?.id || null}
                      showBidInfo={itinerary.status === "published"}
                      onCancelTransferzBooking={handleCancelTransferzBooking}
                      isDropTarget={overDayIso === d.iso}
                      movingActivityId={movingJobId}
                    />
                  ))}
              </div>
            </div>

            <div className="lg:col-span-1">
              <EditActivitySidebar
                activity={selectedActivity ?? undefined}
                itineraryId={itineraryId}
                itineraryName={itinerary?.name}
                advisorUserId={itinerary?.user_id ?? null}
                itineraryMarkupPct={
                  (itinerary as { markup_pct?: number | null } | null)?.markup_pct ?? null
                }
                onSaved={refreshLineItems}
                onActivityUpdated={(patch) => {
                  setSelectedActivity((prev) => (prev ? { ...prev, ...patch } : prev));
                  const id = selectedActivity?.id;
                  if (!id) return;
                  setActivitiesByDay((prev) => {
                    if (!prev) return prev;
                    const next: typeof prev = { ...prev };
                    for (const dayId of Object.keys(next)) {
                      next[dayId] = next[dayId].map((a) => {
                        if (a.id !== id) return a;
                        return {
                          ...a,
                          title: patch.title ?? a.title,
                          subtitle: patch.subtitle ?? a.subtitle,
                          time: patch.time ?? a.time,
                          duration: patch.duration ?? a.duration,
                          location: patch.location ?? a.location,
                          description: patch.description ?? a.description,
                          price:
                            patch.displayPrice != null &&
                            Number.isFinite(Number(patch.displayPrice))
                              ? Number(patch.displayPrice)
                              : (a as { price?: number | null }).price,
                        };
                      });
                    }
                    return next;
                  });
                  setJobs((prev) =>
                    prev.map((j) => {
                      if (j.id !== id) return j;
                      const displayPrice =
                        patch.displayPrice != null &&
                        Number.isFinite(Number(patch.displayPrice))
                          ? Number(patch.displayPrice)
                          : (j as { displayPrice?: number | null }).displayPrice;
                      return {
                        ...j,
                        name: patch.title ?? j.name,
                        activity_type: patch.activityType ?? patch.subtitle ?? j.activity_type,
                        location: patch.location ?? j.location,
                        description:
                          patch.description !== undefined
                            ? patch.description
                            : j.description,
                        notes: patch.notes !== undefined ? patch.notes : j.notes,
                        advisor_comments:
                          patch.advisorComments !== undefined
                            ? patch.advisorComments
                            : (j as { advisor_comments?: string | null }).advisor_comments,
                        supplier_price:
                          patch.supplierPrice !== undefined
                            ? patch.supplierPrice
                            : (j as { supplier_price?: number | null }).supplier_price,
                        displayPrice,
                        start_time:
                          patch.start_time !== undefined
                            ? patch.start_time
                            : j.start_time,
                        end_time:
                          patch.end_time !== undefined
                            ? patch.end_time
                            : j.end_time,
                        baseDisplayPrice:
                          patch.baseDisplayPrice !== undefined
                            ? patch.baseDisplayPrice
                            : (j as { baseDisplayPrice?: number | null }).baseDisplayPrice,
                      } as JobRow;
                    })
                  );
                }}
                onClose={() => setSelectedActivity(null)}
              />
            </div>
          </div>
        </div>

        <TourModal tourOpen={tourOpen} setTourOpen={setTourOpen} itineraryId={itineraryId} selectTourDate={selectTourDate} onSaved={refreshLineItems} />
        {/* pdf */}
        <ViewPdfModal
          pdfOpen={pdfOpen}
          setPdfOpen={setPdfOpen}
          daysList={days}
          printExportPdf={handlePreviewFromEditModal}
          refreshJobs={refreshLineItems}
          activitiesByDay={activitiesByDay}
          onItineraryFieldsSaved={(patch) => {
            setItinerary((prev) => (prev ? { ...prev, ...patch } : prev));
          }}
        />
        {/* Multiple candidates warning modal */}
        <MultipleCandidatesModal
          open={multipleCandidatesModalOpen}
          onOpenChange={(open) => {
            setMultipleCandidatesModalOpen(open);
            if (!open) {
              setPendingPdfAction(null);
            }
          }}
          jobs={jobsWithMultipleCandidates}
          role="agency"
          onFinalistsSelected={handleFinalistsSelected}
        />

      </div>
      <DragOverlay dropAnimation={null}>
        {activeJob ? (
          <div className="pointer-events-none rounded-lg border-2 border-[#D4AA25] bg-white px-4 py-3 shadow-xl max-w-sm">
            <p className="text-xs font-medium text-[#af8a10] mb-0.5">Move to another day</p>
            <p className="font-semibold text-foreground truncate">{activeJob.name || "Tour"}</p>
            {activeJob.activity_type ? (
              <p className="text-sm text-muted-foreground truncate">{activeJob.activity_type}</p>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
      {itineraryId ? (
        <ItinerarySupportChat
          itineraryId={itineraryId}
          autoOpen={openChatFromQuery}
        />
      ) : null}
    </DndContext>
  );
}

export default function EditItineraryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background p-6 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <EditItineraryPageInner />


    </Suspense>
  );
}
