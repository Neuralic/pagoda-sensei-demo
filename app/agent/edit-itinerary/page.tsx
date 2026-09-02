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
import { IntakeSummaryPanel } from "@/components/itineraries/intake-summary-panel";
import { ItineraryIntakeFields } from "@/components/itineraries/itinerary-intake-fields";
import { AdvisorMarkupPanel } from "@/components/itineraries/advisor-markup-panel";
import { bookingConfirmFieldsFromJob } from "@/lib/booking-price-confirmation";
import { applyMarkupPreviewToJobs } from "@/lib/advisor-markup";
import { useItineraryJobDayDrag } from "@/components/itineraries/use-itinerary-job-day-drag";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { normalizeJobImagePaths, signJobOrTourImagePaths, signItineraryHeroPath } from "@/lib/job-tour-image-sign";
import { ApiItinerary, JobApplicationRow, JobRow, SidebarActivity } from "@/app/types";
import {
  emptyIntakeData,
  intakeDataForApi,
  normalizeBuildMode,
  parseIntakeData,
  validateIntakeForPagodaBuild,
  type ItineraryBuildMode,
  type ItineraryIntakeData,
} from "@/lib/itinerary-intake";
import { intakeSummaryHasContent } from "@/lib/intake-summary";
import { citiesByDayFromStays, hotelsByDayFromStays, reconcileOrphanDayHeadingsWithActivities } from "@/lib/itinerary-day-summary";
import { rememberItineraryHref } from "@/lib/navigation-memory";
import { Button } from "@/components/ui/button";
import { LogIn, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { useReactToPrint } from "react-to-print";
import { compressPdfImagesForPrint } from "@/lib/compress-pdf-images";
import { addSmartPageBreaks } from "@/components/pdf/smart-page-breaks";
import { MultipleCandidatesModal } from "@/components/itineraries/multiple-candidates-modal";
import { checkMultipleCandidates } from "@/lib/check-multiple-candidates";
import { startAdminOverallAccess } from "@/lib/admin-overall-access-client";
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
  transferzBookingsToPriceLines,
  type TransferzMarkupOpts,
} from "@/lib/transferz/itinerary-pricing";
import { normalizeJobApplications, resolveJobGuideDisplayName } from "@/lib/guide-fulfillment";
import {
  indexActivitiesById,
  resolveActivityListImage,
} from "@/lib/itinerary-day-section-activities";

const TourModal = dynamic(() => import("@/components/itineraries/tour-modal"), { ssr: false });
const PdfContent = dynamic(() => import("@/components/pdf/PdfContent"), { ssr: false });
const ViewPdfModal = dynamic(() => import("@/components/pdf/ViewPdfModal"), { ssr: false });
const ItinerarySupportChat = dynamic(
  () =>
    import("@/components/itineraries/itinerary-support-chat").then(
      (m) => m.ItinerarySupportChat
    ),
  { ssr: false }
);

interface Activity {
  id: string;
  title: string;
  subtitle?: string;
  time?: string;
  location?: string;
  duration?: string;
  description?: string;
  image?: string | null;
  images?: string[];
  price?: number | null;
  isTransferzBooking?: boolean;
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

/** Legacy rows saved as jobs.notes.source === transferz — hide from itinerary list when listed separately. */
function jobNotesTransferz(notes: unknown): boolean {
  if (typeof notes !== "string") return false;
  try {
    const o = JSON.parse(notes) as { source?: string };
    return o?.source === "transferz";
  } catch {
    return false;
  }
}

export type EditItineraryViewProps = {
  itineraryIdOverride?: string;
  backHref?: string;
  editorRole?: "agent" | "admin";
};

export function EditItineraryPageInner({
  itineraryIdOverride,
  backHref,
  editorRole = "agent",
}: EditItineraryViewProps = {}) {
  const router = useRouter();
  const search = useSearchParams();
  const itineraryId = itineraryIdOverride || search.get("itineraryId") || "";
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
  const [intakeEditing, setIntakeEditing] = useState(false);
  const [intakeDraft, setIntakeDraft] = useState<ItineraryIntakeData>(emptyIntakeData());
  const [buildModeDraft, setBuildModeDraft] = useState<ItineraryBuildMode>("pagoda_build");
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [accountDefaultMarkupPct, setAccountDefaultMarkupPct] = useState<number | null>(null);
  const [accessingAdvisor, setAccessingAdvisor] = useState(false);
  const orphanPdfReconcileKeyRef = useRef<string>("");

  // Prices arrive already resolved from each guide's commission settings. There is no advisor
  // markup to preview any more, so the lines are shown exactly as the server priced them.
  const jobsForDisplay = jobs;

  const transferzMarkupOpts = useMemo(
    (): TransferzMarkupOpts => ({
      itineraryMarkupPct: itinerary?.markup_pct ?? null,
      accountDefaultMarkupPct,
    }),
    [itinerary?.markup_pct, accountDefaultMarkupPct]
  );

  const transferzPriceLines = useMemo(
    () => transferzBookingsToPriceLines(transferzBookings, transferzMarkupOpts),
    [transferzBookings, transferzMarkupOpts]
  );

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
    arrivalHeading: string
    summary: string[]
    hotel?: string
  };

  const enumerateDays = useCallback((start: string, end: string, arrival?: Record<string, string> | undefined, summaries?: Record<string, { summary: string[] }> | undefined, heading?: Record<string, string> | undefined): DayInfo[] => {

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
        arrivalHeading: heading?.[dayId] || "",
        summary: summaries?.[dayId]?.summary || [],
      });
    }
    return out;
  }, []);

  const toActivities = useCallback((dayISO: string): {
    id: string;
    title: string;
    subtitle: string;
    images: string[];
    time: string;
    start_time: string;
    end_time: string;
    location: string;
    duration: string;
    activity_type: string;
    description: string;
    status: "draft" | "publish";
    application?: JobApplicationRow[] | null;
    price?: number | null;
    /** Per-person pricing × participants (for display): from job.tour when tour-library job */
    pricePerAdult?: number | null;
    pricePerChild?: number | null;
    pricePerInfant?: number | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
    isTransferzBooking?: boolean;
    transferzJourneyCanceled?: boolean;
  }[] => {
    const mapJob = (j: JobRow) => {
      const tour = j.tour;
      const hasTourPerPerson = tour?.price_per_adult != null && tour?.price_per_child != null && tour?.price_per_infant != null;
      let perPersonAndParticipants: { pricePerAdult?: number | null; pricePerChild?: number | null; pricePerInfant?: number | null; adults?: number | null; children?: number | null; infants?: number | null } = {};
      if (hasTourPerPerson) {
        perPersonAndParticipants = {
          pricePerAdult: tour!.price_per_adult ?? null,
          pricePerChild: tour!.price_per_child ?? null,
          pricePerInfant: tour!.price_per_infant ?? null,
          adults: j.adults ?? null,
          children: j.children ?? null,
          infants: j.infants ?? null,
        };
      } else {
        const apps = Array.isArray(j.job_applications) ? j.job_applications : [];
        const isHired = (a: JobApplicationRow) =>
          a?.offer_status === "completed" || a?.offer_status === "hired";
        const isFinalist = (a: JobApplicationRow) => a?.is_finalist === true;
        const isCandidate = (a: JobApplicationRow) =>
          a?.offer_status === "candidate" || a?.is_candidate === true;
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
            adults: j.adults ?? null,
            children: j.children ?? null,
            infants: j.infants ?? null,
          };
        }
      }
      if (!j.start_time || !j.end_time) {
        return {
          id: j.id,
          title: j.name || "",
          subtitle: j.activity_type || "",
          images: normalizeJobImagePaths(j.images),
          time: "—",
          start_time: j.start_time || "",
          end_time: j.end_time || "",
          location: j.location || "",
          description: j.description || "",
          activity_type: j.activity_type || "",
          duration: "—",
          status: (j.status as "draft" | "publish") || "draft",
          application: j.job_applications,
          price: j.displayPrice ?? null,
          notes: j.notes || null,
          advisorComments: j.advisor_comments || null,
          ...perPersonAndParticipants,
        };
      }
      const start = new Date(j.start_time);
      const end = new Date(j.end_time);
      const time =
        jobTimeRangeLabel(j.start_time, j.end_time) ||
        "—";
      const startHH = jobWallClockHHMM(j.start_time);
      const endHH = jobWallClockHHMM(j.end_time);
      const durFromWall =
        startHH && endHH ? minutesBetweenLocalHHMM(startHH, endHH) : null;
      const durMin =
        durFromWall ?? Math.max(0, Math.round((+end - +start) / 60000));
      const duration =
        durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
      return {
        id: j.id,
        title: j.name || "",
        subtitle: j.activity_type || "",
        images: normalizeJobImagePaths(j.images),
        time,
        start_time: j.start_time,
        end_time: j.end_time,
        location: j.location || "",
        description: j.description || "",
        duration,
        activity_type: j.activity_type || "",
        status: (j.status as "draft" | "publish") || "draft",
        application: j.job_applications,
        price: j.displayPrice ?? null,
        notes: j.notes || null,
        advisorComments: j.advisor_comments || null,
        ...perPersonAndParticipants,
      };
    };

    const jobBlocks = (jobsForDisplay || [])
      .filter(
        (j) =>
          Boolean(
            j.start_time &&
              typeof j.start_time === "string" &&
              jobCalendarDateFromTimestamp(j.start_time) === dayISO &&
              !jobNotesTransferz(j.notes)
          )
      )
      .map(mapJob);

    const tzBlocks = (transferzBookings || [])
      .filter((tb) => tb.activity_date === dayISO)
      .map((tb) => {
        const payload =
          tb.payload && typeof tb.payload === "object" && !Array.isArray(tb.payload)
            ? (tb.payload as Record<string, unknown>)
            : {};
        const { displayPrice: price } = transferzAdvisorDisplayPricing(
          payload,
          transferzMarkupOpts
        );
        const psL = payload.pickupStartLocalHHMM;
        const peL = payload.pickupEndLocalHHMM;
        const wallTimeLabel = wallTimeRangeLabel(
          typeof psL === "string" ? psL : null,
          typeof peL === "string" ? peL : null
        );
        const start = new Date(tb.start_time);
        const end = new Date(tb.end_time);
        const pad = (n: number) => n.toString().padStart(2, "0");
        const timeFromDb = `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())} - ${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`
          .replace(/\s+/g, " ")
          .trim();
        const time = wallTimeLabel || timeFromDb;
        const durFromWall =
          typeof psL === "string" && typeof peL === "string"
            ? minutesBetweenLocalHHMM(psL, peL)
            : null;
        const durMin = durFromWall ?? Math.max(0, Math.round((+end - +start) / 60000));
        const duration =
          durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
        const destCc =
          typeof payload.destinationCountryCode === "string"
            ? payload.destinationCountryCode
            : null;
        const locationLabel =
          itinerary?.location?.trim() ||
          countryNameFromAlpha2(destCc) ||
          (tb.location || "");
        const js = typeof payload.journeyStatus === "string" ? payload.journeyStatus : null;
        return {
          id: `transferz-${tb.id}`,
          title: tb.title,
          subtitle: tb.activity_type,
          isTransferzBooking: true,
          transferzJourneyCanceled: isTransferzJourneyCanceledStatus(js),
          images: [TRANSFERZ_ITINERARY_DEFAULT_IMAGE],
          time,
          start_time: tb.start_time,
          end_time: tb.end_time,
          location: locationLabel,
          description: tb.description || "",
          activity_type: tb.activity_type,
          duration,
          status: "draft" as const,
          application: undefined,
          price,
          adults: typeof payload.adults === "number" ? payload.adults : null,
          children: typeof payload.children === "number" ? payload.children : null,
          infants: typeof payload.infants === "number" ? payload.infants : null,
        };
      });

    return [...jobBlocks, ...tzBlocks].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [jobsForDisplay, transferzBookings, itinerary, transferzMarkupOpts]);

  const days = useMemo(() => {
    if (!itinerary) return [];

    const base = enumerateDays(
      itinerary.start_date,
      itinerary.end_date,
      itinerary.arrival_location,
      itinerary.trips_summary,
      itinerary.arrival_heading
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

  // When returning from bids page with jobId in URL, expand the day that contains that job
  const returnJobId = search.get("jobId") || null;
  useEffect(() => {
    if (!returnJobId || !days?.length || !jobs?.length) return;
    const job = jobs.find((j: JobRow) => j.id === returnJobId);
    if (!job?.start_time || typeof job.start_time !== "string") return;
    const dayISO = job.start_time.slice(0, 10);
    const day = days.find((d: { iso: string }) => d.iso === dayISO);
    if (day) {
      setExpandedDays((prev) => (prev.includes(day.id) ? prev : [...prev, day.id]));
    }
  }, [returnJobId, days, jobs]);

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

  const refreshItinerary = useCallback(async () => {
    if (!itineraryId) return;
    const res = await fetch(`/api/itineraries/${encodeURIComponent(itineraryId)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && data.itinerary) {
      setItinerary(data.itinerary);
      try {
        const url = await signItineraryHeroPath(data.itinerary.image);
        setHeroUrl(url);
      } catch {
        setHeroUrl(null);
      }
    }
  }, [itineraryId]);

  const refreshLineItems = useCallback(async () => {
    await Promise.all([refreshJobs(), refreshTransferzBookings(), refreshItinerary()]);
  }, [refreshJobs, refreshTransferzBookings, refreshItinerary]);

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
        // Get current user ID (bootstrap works for admin + agents; /api/auth/me is users-table only)
        const userRes = await fetch("/api/bootstrap", { cache: "no-store" });
        const userData = await userRes.json().catch(() => null);
        if (!cancelled && userData?.ok && userData?.user?.id) {
          setCurrentUserId(String(userData.user.id));
          setViewerIsAdmin(String(userData.user.role || "").toLowerCase() === "admin");
          if (userData.user.defaultMarkupPct != null) {
            setAccountDefaultMarkupPct(Number(userData.user.defaultMarkupPct));
          }
        }

        // Prefer account default from /api/user for agents editing their own trips
        try {
          const uRes = await fetch("/api/user", { cache: "no-store" });
          const uData = await uRes.json().catch(() => null);
          if (!cancelled && uRes.ok && uData?.ok && uData.user?.defaultMarkupPct != null) {
            setAccountDefaultMarkupPct(Number(uData.user.defaultMarkupPct));
          }
        } catch {
          /* ignore */
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

  // Keep Notes for the guide (and other job fields) on the open sidebar after refresh
  useEffect(() => {
    setSelectedActivity((prev) => {
      if (!prev?.id) return prev;
      const job = jobs.find((j) => j.id === prev.id);
      if (!job) return prev;
      const comments = (job as JobRow).advisor_comments || null;
      const notes = (job as JobRow).notes || null;
      if (
        (prev.advisorComments || null) === (comments || null) &&
        (prev.notes || null) === (notes || null)
      ) {
        return prev;
      }
      return {
        ...prev,
        advisorComments: comments ?? undefined,
        notes: notes ?? undefined,
      };
    });
  }, [jobs]);

  // Whenever jobs change, sign ALL image paths and cache mapping
  useEffect(() => {
    let cancelled = false;
    async function signJobImages() {
      // Collect ALL image paths from all jobs, not just the first one
      if (!jobs || !Array.isArray(jobs)) {
        setJobImageMap({});
        return;
      }
      
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
    async function signProfileImages() {
      // Collect all unique profile_picture_path values from job_applications
      const profilePaths = Array.from(
        new Set(
          jobs
            .flatMap((j) => {
              // j.job_applications is an array, each with profiles array
              if (!Array.isArray(j.job_applications)) {
                return [];
              }
              return j.job_applications
                .map((app) => {
                  const profiles = app.profiles;
                  if (profiles && typeof profiles === "object" && !Array.isArray(profiles) && profiles.profile_picture_path) {
                    return profiles.profile_picture_path;
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
                .map((app) => {
                  const profiles = app.profiles;
                  if (profiles && typeof profiles === "object" && !Array.isArray(profiles) && profiles.intro_video_path) {
                    return profiles.intro_video_path;
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
    signProfileImages();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  useEffect(() => {
    if (days.length > 0) {
      setExpandedDays((prev) => {
        // If user already interacted this session, keep it.
        if (prev.length > 0) return prev;

        // Restore persisted expanded days for this itinerary, if any.
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

        // Default: expand all days.
        const all = days.map((d) => d.id);
        persistExpandedDays(all);
        return all;
      });
    }
  }, [days, expandedDaysStorageKey, persistExpandedDays]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateSelectedActivityImages() {
      const id = selectedActivity?.id;
      if (!id) return;
      const job = jobs.find((j) => j.id === id);
      if (!job) return;

      // Get all image paths from job (array, JSON string, or single path)
      const allImagePaths: string[] = [...normalizeJobImagePaths(job.images)];

      // Add single image if it exists and is a path (not already a URL)
      if (selectedActivity?.image &&
        !selectedActivity.image.startsWith("http") &&
        !selectedActivity.image.startsWith("/") &&
        !jobImageMap[selectedActivity.image]) {
        allImagePaths.push(...normalizeJobImagePaths(selectedActivity.image));
      }

      // Remove duplicates
      const uniquePaths = Array.from(new Set(allImagePaths));

      if (!uniquePaths.length) {
        // Thumbnail-only jobs: sign the list image but do not wipe gallery URLs parent may have set
        if (selectedActivity?.image && jobImageMap[selectedActivity.image]) {
          setSelectedActivity((prev) =>
            prev ? { ...prev, image: jobImageMap[prev.image!] } : null
          );
        }
        return;
      }

      // Check if images are already signed URLs
      const needsSigning = uniquePaths.some(
        (p) => !p.startsWith("http") && !p.startsWith("/") && !jobImageMap[p]
      );

      if (!needsSigning) {
        // All images are already signed, use jobImageMap
        const signedImages = uniquePaths.map((p) => jobImageMap[p] || p);
        setSelectedActivity((prev) =>
          prev ? {
            ...prev,
            images: signedImages,
            image: signedImages[0] || prev.image
          } : null
        );
        return;
      }

      try {
        // Try to sign images that aren't already signed
        const pathsToSign = uniquePaths.filter(
          (p) => !p.startsWith("http") && !p.startsWith("/") && !jobImageMap[p]
        );

        if (pathsToSign.length > 0) {
          const signed = await signJobOrTourImagePaths(pathsToSign);
          if (cancelled) return;

          const newMap: Record<string, string> = { ...jobImageMap, ...signed };
          setJobImageMap(newMap);

          // Build final signed URLs array
          const signedImages = uniquePaths.map((p) => newMap[p] || jobImageMap[p] || p);
          setSelectedActivity((prev) =>
            prev ? {
              ...prev,
              images: signedImages,
              image: signedImages[0] || prev.image
            } : prev
          );
        }
      } catch (err) {
        console.error("Error signing activity images:", err);
        if (!cancelled) {
          // Fallback: use jobImageMap for what we have
          const signedImages = uniquePaths.map((p) => jobImageMap[p] || p);
          setSelectedActivity((prev) =>
            prev ? {
              ...prev,
              images: signedImages,
              image: signedImages[0] || prev.image
            } : prev
          );
        }
      }
    }
    hydrateSelectedActivityImages();
    return () => {
      cancelled = true;
    };
  }, [selectedActivity?.id, selectedActivity?.image, jobs, jobImageMap]);

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
    // Refetch jobs + Transferz lines so PDF total and activities match
    await refreshLineItems();
    await new Promise((r) => setTimeout(r, 200));
    await waitForImages();
    // Compress large photos so email-friendly PDFs stay smaller
    await compressPdfImagesForPrint(itineraryRef.current);
    // Add smart page breaks before printing - wait a bit for layout to settle
    if (itineraryRef.current) {
      // Force a reflow to ensure accurate measurements
      void itineraryRef.current.offsetHeight;
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
      void itineraryRef.current.offsetHeight;
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
    // Refetch jobs + Transferz so PDF shows current data
    await refreshLineItems();
    // Brief delay so activitiesByDay updates from new jobs before opening modal
    setTimeout(() => setPdfOpen(true), 150);
  }

  const handleFinalistsSelected = async () => {
    // Refresh jobs + Transferz to get updated data
    await refreshLineItems();
    // Close modal
    setMultipleCandidatesModalOpen(false);
    
    // Get the pending action before clearing it
    const action = pendingPdfAction;
    setPendingPdfAction(null);
    
    // Wait a bit for jobs to refresh
    setTimeout(async () => {
      // Refresh once more so the UI matches
      await refreshLineItems();
      
      // Based on the action, either show PDF preview or open edit summary modal
      if (action === "preview") {
        // Preview button: Show PDF preview directly
        setSkipMultipleCandidatesCheck(true);
        await waitForImages();
        await compressPdfImagesForPrint(itineraryRef.current);
        if (itineraryRef.current) {
          void itineraryRef.current.offsetHeight;
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

  const toggleTourDay = (dayISO: string) => {
    setSelectTourDate(dayISO);
    setTourOpen(true)
  };



  useEffect(() => {
    if (!itinerary || !days) return;

    const allActivities: Record<string, Activity[]> = {};
    days.forEach((d) => {
      const activities = toActivities(d.iso).map((a) => {
        // Map job images to signed URLs
        // If path is already a URL (signed or public), keep it; otherwise use jobImageMap or keep path
        const images = Array.isArray(a.images)
          ? a.images.map((imgPath: string) => {
            // If already a URL, return as-is
            if (imgPath && (imgPath.startsWith('http://') || imgPath.startsWith('https://'))) {
              return imgPath;
            }
            // If in jobImageMap, use signed URL
            if (imgPath && jobImageMap[imgPath]) {
              return jobImageMap[imgPath];
            }
            // Otherwise return path (will be signed later if needed)
            return imgPath;
          })
          : [];

        // Map profile pictures and intro videos in applications to signed URLs and preserve bio
        const application = Array.isArray(a.application)
          ? a.application.map((app) => {
            const profiles = app.profiles;
            if (profiles && typeof profiles === "object" && !Array.isArray(profiles)) {
              const profilePath = profiles.profile_picture_path;
              const videoPath = profiles.intro_video_path;
              
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
                  bio: profiles.bio || null,
                  intro_video_path: signedVideoPath,
                }],
              };
            }
            return app;
          })
          : a.application;

        return {
          ...a,
          images,
          application,
        };
      });
      allActivities[d.id] = activities;
    });


    setActivitiesByDay(allActivities);
  }, [days, jobImageMap, profileImageMap, videoUrlMap, itinerary, jobsForDisplay, toActivities]);

  useEffect(() => {
    const sid = selectedActivity?.id;
    if (!sid || sid.startsWith("transferz-")) return;
    const job = jobsForDisplay.find((j) => j.id === sid);
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
  }, [jobsForDisplay, selectedActivity?.id]);

  // Clear leftover PDF day titles (e.g. deleted tour still named in arrival_heading / summary)
  useEffect(() => {
    if (!itineraryId || !itinerary || !activitiesByDay || !days.length) return;
    const key = `${itineraryId}:${jobs.length}:${transferzBookings.length}:${JSON.stringify(
      itinerary.arrival_heading || {}
    )}`;
    if (orphanPdfReconcileKeyRef.current === key) return;

    const byDay: Record<string, { title?: string | null; subtitle?: string | null }[]> = {};
    for (const d of days) {
      byDay[d.id] = (activitiesByDay[d.id] || []).map((a) => ({
        title: a.title,
        subtitle: a.subtitle,
      }));
    }

    const { fields, changed } = reconcileOrphanDayHeadingsWithActivities(
      itinerary.trips_summary,
      itinerary.arrival_heading,
      byDay
    );
    orphanPdfReconcileKeyRef.current = key;
    if (!changed) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/itineraries/${encodeURIComponent(itineraryId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trips_summary: fields.trips_summary,
            arrival_heading: fields.arrival_heading,
          }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled || !res.ok || !data?.ok) return;
        setItinerary((prev) =>
          prev
            ? {
                ...prev,
                trips_summary: fields.trips_summary,
                arrival_heading: fields.arrival_heading,
              }
            : prev
        );
      } catch {
        /* ignore — next load can retry */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itineraryId, itinerary, activitiesByDay, days, jobs.length, transferzBookings.length]);

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
      const jobApps = job?.job_applications;
      const apps = normalizeJobApplications(
        jobApps as Parameters<typeof normalizeJobApplications>[0]
      );
      const displayPrice = job?.displayPrice;
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
        typeof job?.guide_name === "string"
          ? String(job.guide_name).trim() || null
          : null;
      return {
        price,
        guideName: fromApps || fromJob,
        guideId:
          job?.guide_id ||
          job?.tour?.user_id ||
          (() => {
            type AppRow = {
              offer_status?: string;
              is_finalist?: boolean;
              applicant_id?: string;
            };
            const typed = apps as AppRow[];
            const hired = typed.find(
              (a) =>
                a.offer_status === "completed" ||
                a.offer_status === "hired" ||
                a.offer_status === "accepted"
            );
            const finalist = typed.find((a) => a.is_finalist);
            return hired?.applicant_id || finalist?.applicant_id || null;
          })(),
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
        const job = jobsForDisplay.find((j) => j.id === a.id);
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
              image: (a as { image?: string }).image,
              images: Array.isArray(a.images) ? (a.images as string[]) : undefined,
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
  }, [itinerary, days, activitiesByDay, jobsForDisplay, jobImageMap, toActivities, transferzBookings, transferzMarkupOpts]);

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
        {editorRole === "admin" ? (
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                Admin overall access — editing{" "}
                {itinerary?.owner
                  ? (
                      <strong>
                        {[itinerary.owner.first_name, itinerary.owner.last_name]
                          .filter(Boolean)
                          .join(" ")
                          .trim() || itinerary.owner.email || "advisor"}
                      </strong>
                    )
                  : "this advisor"}
                &apos;s itinerary from the admin console
              </span>
              {itinerary?.user_id ? (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={`/admin/users/${encodeURIComponent(String(itinerary.user_id))}`}
                    className="font-medium text-amber-950 underline underline-offset-2 hover:text-amber-800"
                  >
                    Open advisor profile
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    disabled={accessingAdvisor}
                    className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5 h-8"
                    onClick={async () => {
                      const ownerId = String(itinerary.user_id);
                      setAccessingAdvisor(true);
                      try {
                        const result = await startAdminOverallAccess(ownerId);
                        if (!result.ok) {
                          toast.error(result.error || "Could not access this account.");
                          return;
                        }
                        toast.success(`Accessing ${result.targetName || "advisor"}…`);
                        // Land on profile so you can complete photo / website for PDF cover.
                        // Full page load, not router.push: overall access swaps the session
                        // cookies, so every client cache built for the admin has to go.
                        window.location.assign("/agent/profile");
                      } catch {
                        toast.error("Could not access this account.");
                      } finally {
                        setAccessingAdvisor(false);
                      }
                    }}
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    {accessingAdvisor ? "Opening…" : "Access account"}
                  </Button>
                </div>
              ) : null}
            </div>
            {itinerary ? (
              <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Client intake (Asia Luxury request)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Edit the submitted inquiry details here. This is separate from Edit Summary
                      (PDF day text).
                    </p>
                  </div>
                  {intakeEditing ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => {
                        setIntakeDraft(parseIntakeData(itinerary.intake_data));
                        setBuildModeDraft(normalizeBuildMode(itinerary.build_mode));
                        setIntakeEditing(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit intake
                    </Button>
                  )}
                </div>

                {intakeEditing ? (
                  <div className="space-y-4">
                    <ItineraryIntakeFields
                      buildMode={buildModeDraft}
                      onBuildModeChange={setBuildModeDraft}
                      intake={intakeDraft}
                      onIntakeChange={(patch) =>
                        setIntakeDraft((prev) => ({ ...prev, ...patch }))
                      }
                      arrivalDate={itinerary.start_date}
                      departureDate={itinerary.end_date}
                      disabled={intakeSaving}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={intakeSaving}
                        onClick={() => setIntakeEditing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
                        disabled={intakeSaving}
                        onClick={async () => {
                          if (buildModeDraft === "pagoda_build") {
                            const err = validateIntakeForPagodaBuild(intakeDraft);
                            if (err) {
                              toast.error(err);
                              return;
                            }
                          }
                          setIntakeSaving(true);
                          try {
                            const cleaned = intakeDataForApi(intakeDraft);
                            const resp = await fetch(`/api/itineraries/${itinerary.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                name: itinerary.name,
                                location: itinerary.location,
                                start_date: itinerary.start_date,
                                end_date: itinerary.end_date,
                                build_mode: buildModeDraft,
                                intake_data: cleaned,
                              }),
                            });
                            const data = await resp.json().catch(() => null);
                            if (!resp.ok || !data?.ok) {
                              throw new Error(data?.error || "Failed to save intake");
                            }
                            setItinerary((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    build_mode: buildModeDraft,
                                    intake_data: cleaned,
                                    arrival_location:
                                      data.itinerary?.arrival_location ??
                                      prev.arrival_location,
                                    pdf_title:
                                      data.itinerary?.pdf_title ?? prev.pdf_title,
                                    pdf_subtitle:
                                      data.itinerary?.pdf_subtitle ??
                                      prev.pdf_subtitle,
                                  }
                                : prev
                            );
                            setIntakeEditing(false);
                            toast.success("Intake updated");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to save intake");
                          } finally {
                            setIntakeSaving(false);
                          }
                        }}
                      >
                        {intakeSaving ? "Saving…" : "Save intake"}
                      </Button>
                    </div>
                  </div>
                ) : intakeSummaryHasContent(parseIntakeData(itinerary.intake_data)) ? (
                  <IntakeSummaryPanel
                    intake={parseIntakeData(itinerary.intake_data)}
                    fallbackLocation={itinerary.location}
                    title=""
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No intake details were submitted yet. Use Edit intake to add them.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <EditHeader
          itineraryId={itineraryId}
          onItineraryPublished={handleItineraryPublished}
          onBack={() => (backHref ? router.push(backHref) : router.back())}
          printExportPdf={handlePrintPdf}
          onExportPdf={onExportPdf}
        />
        {/* <h1>Create Your Clients Itinerary</h1> */}
        <div style={{ width: '784px', display: 'none' }}>
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
              {itinerary &&
              editorRole !== "admin" &&
              intakeSummaryHasContent(parseIntakeData(itinerary.intake_data)) ? (
                <div className="rounded-lg border border-border bg-card px-4 py-4">
                  <IntakeSummaryPanel
                    intake={parseIntakeData(itinerary.intake_data)}
                    fallbackLocation={itinerary.location}
                    title="Client preferences"
                  />
                </div>
              ) : null}

              {itinerary ? (
                <TripOverviewCard
                  itinerary={{
                    title: itinerary.name,
                    destination: itinerary.location,
                    duration: (() => {
                      const s = new Date(itinerary.start_date);
                      const e = new Date(itinerary.end_date);
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

              {itinerary ? (
                <AdvisorMarkupPanel
                  itineraryId={itinerary.id}
                  markupPct={itinerary.markup_pct}
                  marginStrategy={
                    itinerary.margin_strategy as
                      | "keep"
                      | "share"
                      | "split"
                      | null
                      | undefined
                  }
                  accountDefaultMarkupPct={accountDefaultMarkupPct}
                  priceLines={[
                    ...jobsForDisplay.map((j) => ({
                      baseDisplayPrice: j.baseDisplayPrice,
                      displayPrice: j.displayPrice,
                      advisorProfit: j.advisorProfit,
                    })),
                    ...transferzPriceLines,
                  ]}
                  onSaved={(patch) => {
                    setItinerary((prev) =>
                      prev
                        ? {
                            ...prev,
                            markup_pct: patch.markup_pct,
                            margin_strategy: patch.margin_strategy,
                          }
                        : prev
                    );
                    void refreshLineItems();
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
                          const signedImage =
                            activity.image && jobImageMap[activity.image]
                              ? jobImageMap[activity.image]
                              : activity.image;
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
                            image: signedImage,
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
                        const job = jobsForDisplay.find((j) => j.id === activity.id);
                        // Ensure image is signed URL if available in jobImageMap
                        // Activity has image property (singular), not images
                        const signedImage = activity.image && jobImageMap[activity.image]
                          ? jobImageMap[activity.image]
                          : activity.image;
                        const payload: SidebarActivity = {
                          id: activity.id,
                          title: activity.title,
                          subtitle: activity.subtitle,
                          image: signedImage,
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
                          adults: job?.adults ?? undefined,
                          children: job?.children ?? undefined,
                          infants: job?.infants ?? undefined,
                          notes: job?.notes || undefined,
                          advisorComments: job?.advisor_comments || undefined,
                          supplierPrice: job?.supplier_price ?? null,
                          clientPrice: job?.client_price ?? null,
                          lineMarkupPct: job?.line_markup_pct ?? null,
                          displayPrice: job?.displayPrice ?? null,
                          baseDisplayPrice: job?.baseDisplayPrice ?? null,
                          guideId: job?.guide_id || null,
                          tourId: job?.tour_id || null,
                          ...bookingConfirmFieldsFromJob(job as { price_confirmation_status?: string | null; job_applications?: unknown }),
                        };
                        setSelectedActivity(payload);
                      }}
                      itineraryId={itinerary.id}
                      activityDateISO={d.iso}
                      onJobSaved={refreshLineItems}
                      toggleTourDay={() => toggleTourDay(d.iso)}
                      itinerary={itinerary}
                      currentUserId={currentUserId}
                      advisorUserId={itinerary.user_id ?? null}
                      selectedActivityId={selectedActivity?.id || null}
                      showBidInfo={itinerary.status === "published"}
                      onCancelTransferzBooking={handleCancelTransferzBooking}
                      isDropTarget={overDayIso === d.iso}
                      movingActivityId={movingJobId}
                      viewerIsAdmin={viewerIsAdmin}
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
                itineraryMarkupPct={itinerary?.markup_pct ?? null}
                accountDefaultMarkupPct={accountDefaultMarkupPct}
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
                              : a.price,
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
                          : j.displayPrice;
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
                            : j.advisor_comments,
                        supplier_price:
                          patch.supplierPrice !== undefined
                            ? patch.supplierPrice
                            : j.supplier_price,
                        line_markup_pct:
                          patch.lineMarkupPct !== undefined
                            ? patch.lineMarkupPct
                            : j.line_markup_pct,
                        displayPrice,
                        start_time:
                          patch.start_time != null && patch.start_time !== ""
                            ? patch.start_time
                            : j.start_time,
                        end_time:
                          patch.end_time != null && patch.end_time !== ""
                            ? patch.end_time
                            : j.end_time,
                        baseDisplayPrice:
                          patch.baseDisplayPrice !== undefined
                            ? patch.baseDisplayPrice
                            : j.baseDisplayPrice,
                      } satisfies JobRow;
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
          itineraryId={itineraryId}
          editorRole={editorRole}
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
          role={editorRole}
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
