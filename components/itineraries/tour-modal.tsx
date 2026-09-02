import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader } from '../ui/dialog'
import { ArrowLeft, ChevronDown, MapPin, Upload, X, Search } from 'lucide-react';
import { Tour } from '@/app/types';
import { calculateTimeDuration, formatDate, extractTimeFromString } from '@/lib/common-function';
import { computeGuideTotalFromTour, getDisplayTotalExact, isGroupSizeOverTourLimit, DEFAULT_COMMISSION_SETTINGS, type CommissionSettings } from '@/lib/tour-price';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '../ui/input';
import { uploadViaApi } from '@/lib/upload-client';
import { BUCKETS } from '@/lib/buckets';
import { getSignedUrls } from '@/lib/storage-sign-client';
import { TourModalTransferzPanel } from '@/components/itineraries/tour-modal-transferz';
import { hasTransferzDraft } from '@/lib/transferz-form-draft';
import {
  TOUR_ACTIVITY_TYPES,
  isAirportTransfersCatalogType,
} from '@/lib/tour-activity-types';
import { DestinationSelect } from '@/components/shared/destination-select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SIGN_CHUNK = 72;

function tourGuideOperatorName(tour: {
  assignedGuides?: Array<{ name?: string | null }> | null;
  agent?: {
    name?: string | null;
    user?: { firstName?: string; lastName?: string } | null;
  } | null;
}): string {
  const assigned = tour.assignedGuides?.find((g) => String(g?.name || "").trim());
  if (assigned?.name?.trim()) return assigned.name.trim();
  if (tour.agent?.name?.trim()) return tour.agent.name.trim();
  const fn = tour.agent?.user?.firstName || "";
  const ln = tour.agent?.user?.lastName || "";
  const fromUser = `${fn} ${ln}`.trim();
  return fromUser || "";
}

function firstImagePathFromRaw(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return parsed[0].trim();
    if (typeof parsed === 'string') return parsed.trim();
  } catch {
    return raw.trim();
  }
  return null;
}

async function batchSignTourStoragePaths(paths: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = [...new Set(paths.filter((p) => p.startsWith('images/')))];
  for (let i = 0; i < unique.length; i += SIGN_CHUNK) {
    const slice = unique.slice(i, i + SIGN_CHUNK);
    const results = await getSignedUrls(slice.map((path) => ({ bucket: BUCKETS.tours, path })));
    slice.forEach((path, j) => {
      const r = results[j];
      const url = r?.signedUrl || r?.publicUrl;
      if (url) map[path] = url;
    });
  }
  return map;
}

type CreateTourModalProps = {
  tourOpen: boolean;
  setTourOpen: (open: boolean) => void;
  itineraryId: string;
  selectTourDate?: string | null;
  onSaved?: () => void;
};

const jobActivityTypes = [...TOUR_ACTIVITY_TYPES];

const TourModal = ({
  tourOpen,
  setTourOpen,
  itineraryId,
  selectTourDate,
  onSaved
}: CreateTourModalProps) => {
  // Helper function to validate time format (HH:MM)
  const isValidTimeFormat = (time: string): boolean => {
    if (!time || typeof time !== 'string') return false;
    const trimmed = time.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return false;
    const [hours, minutes] = trimmed.split(':').map(Number);
    return !isNaN(hours) && !isNaN(minutes) &&
      hours >= 0 && hours <= 23 &&
      minutes >= 0 && minutes <= 59;
  };

  const [loading, setLoading] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);

  const [jobData, setJobData] = useState(false);
  const [adults, setAdults] = useState<number>(1);
  const [children, setChildren] = useState<number>(0);
  const [infants, setInfants] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState<string>("");
  const [activityPath, setActivityPath] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:30");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [advisorComments, setAdvisorComments] = useState<string>("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [activityOpen, setActivityOpen] = useState(false)
  const [selectActivity, setSelectActivity] = useState("")
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const [allLanguages, setAllLanguages] = useState<Array<{ code: string; name: string }>>([]);

  useEffect(() => {
    if (!tourOpen) return;
    let cancelled = false;
    import("world-countries")
      .then((mod) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        const countriesList = mod.default as { languages?: Record<string, string> }[];
        countriesList.forEach((c) => {
          if (c.languages && typeof c.languages === "object") {
            Object.entries(c.languages).forEach(([code, name]) => {
              if (!map.has(code)) map.set(code, String(name));
            });
          }
        });
        setAllLanguages(
          Array.from(map.entries())
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {
        if (!cancelled) setAllLanguages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tourOpen]);
  // Multiple images support - MAX 5 images total
  const MAX_IMAGES = 5;
  const [imageFiles, setImageFiles] = useState<Array<{ file: File; preview: string }>>([])
  const [existingImages, setExistingImages] = useState<Array<{ path: string; url: string }>>([])
  const countryDropdownRef = useRef<HTMLDivElement>(null)
  const activityTypeDropdownRef = useRef<HTMLDivElement>(null)
  const [activityTypeFilterOpen, setActivityTypeFilterOpen] = useState(false);
  const [selectCountry, setSelectCountry] = useState<string>("")
  const [selectActivityTypeFilter, setSelectActivityTypeFilter] = useState<string>("")
  const [countries, setCountries] = useState<string[]>([]);
  const [catalogActivityTypes, setCatalogActivityTypes] = useState<string[]>([]);
  const [tourCatalogSearch, setTourCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");
  const [hasMoreCatalog, setHasMoreCatalog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const prevTourOpenRef = useRef(false);
  /** Tour catalog vs Transferz partner transfer (no guide). */
  const [catalogView, setCatalogView] = useState<"tours" | "transferz">("tours");
  const [customTourWarnOpen, setCustomTourWarnOpen] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [selectedGuideName, setSelectedGuideName] = useState<string>("");
  /** Per-person pricing from selected tour (for automatic total calculation). */
  const [selectedTourPerPerson, setSelectedTourPerPerson] = useState<{
    pricePerAdult: number;
    pricePerChild: number;
    pricePerInfant: number;
  } | null>(null);
  /** Group-rate pricing snapshot when selected tour uses group_rate model (for client-side total calculation). */
  const [selectedTourGroupRate, setSelectedTourGroupRate] = useState<{
    base_rate: number;
    base_group_size: number;
    max_group_size?: number | null;
    additional_per_person_rate?: number | null;
  } | null>(null);
  /** Calculated per-person display prices from tour catalog API — agent sees these, not original guide price. */
  const [displayPricePerPerson, setDisplayPricePerPerson] = useState<{
    adult: number;
    child: number;
    infant: number;
  } | null>(null);
  /** Shown when selected tour has no pricing set. */
  const [priceError, setPriceError] = useState<string | null>(null);
  /** Must match catalog APIs (per-guide guide_commission_settings); avoids wrong totals when defaults ≠ guide rates. */
  const [priceCommissionSettings, setPriceCommissionSettings] = useState<CommissionSettings | null>(null);

  /** Total (incl. VAT): per_person = display prices × participants; group_rate = guide total + same commissions as tour library. */
  const displayTotalForGroup = useMemo(() => {
    const a = adults || 0;
    const c = children || 0;
    const i = infants || 0;
    if (a + c + i === 0) return null;
    const comm = priceCommissionSettings ?? DEFAULT_COMMISSION_SETTINGS;
    if (selectedTourGroupRate) {
      const result = computeGuideTotalFromTour(
        { pricing_model: "group_rate", ...selectedTourGroupRate },
        { adults: a, children: c, infants: i }
      );
      if (!result || result.guideTotal < 0) return null;
      const total = getDisplayTotalExact(
        result.guideTotal,
        comm.commissionMarketplacePct,
        comm.commissionAgentPct,
        comm.vatRatePct
      );
      return Math.round(total);
    }
    if (!displayPricePerPerson) return null;
    return Math.round(
      a * displayPricePerPerson.adult +
      c * displayPricePerPerson.child +
      i * displayPricePerPerson.infant
    );
  }, [displayPricePerPerson, selectedTourGroupRate, priceCommissionSettings, adults, children, infants]);

  const groupRateOverMax = useMemo(() => {
    if (!selectedTourGroupRate) return false;
    return isGroupSizeOverTourLimit(
      {
        pricing_model: "group_rate",
        max_group_size: selectedTourGroupRate.max_group_size ?? null,
      },
      { adults, children, infants }
    );
  }, [selectedTourGroupRate, adults, children, infants]);

  /** Breakdown lines for group_rate (guide amounts — internal). */
  const groupRateBreakdown = useMemo(() => {
    if (!selectedTourGroupRate) return null;
    const a = adults || 0;
    const c = children || 0;
    const i = infants || 0;
    const result = computeGuideTotalFromTour(
      { pricing_model: "group_rate", ...selectedTourGroupRate },
      { adults: a, children: c, infants: i }
    );
    return result?.breakdownLines ?? null;
  }, [selectedTourGroupRate, adults, children, infants]);

  /** Same breakdown in agent-facing currency (incl. commissions & VAT); lines sum to `displayTotalForGroup`. */
  const groupRateAgentBreakdown = useMemo(() => {
    if (!groupRateBreakdown || groupRateBreakdown.length === 0) return null;
    const comm = priceCommissionSettings ?? DEFAULT_COMMISSION_SETTINGS;
    const lines = groupRateBreakdown.map((line) => ({
      label: line.label,
      count: line.count,
      displayAmount: Math.round(
        getDisplayTotalExact(
          line.amount,
          comm.commissionMarketplacePct,
          comm.commissionAgentPct,
          comm.vatRatePct
        )
      ),
    }));
    if (displayTotalForGroup == null) return lines;
    const sum = lines.reduce((s, l) => s + l.displayAmount, 0);
    const drift = displayTotalForGroup - sum;
    if (drift !== 0 && lines.length > 0) {
      const last = lines.length - 1;
      lines[last] = { ...lines[last], displayAmount: lines[last].displayAmount + drift };
    }
    return lines;
  }, [groupRateBreakdown, priceCommissionSettings, displayTotalForGroup]);

  // Close language dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
      }
      if (activityTypeDropdownRef.current && !activityTypeDropdownRef.current.contains(e.target as Node)) {
        setActivityTypeFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageToggle = (language: { code: string; name: string }) => {
    setLanguages((prev) => {
      if (prev.includes(language.name)) {
        // Remove if already selected
        return prev.filter((lang) => lang !== language.name);
      } else {
        // Add if not selected
        const newLanguages = [...prev, language.name];
        setLanguages(newLanguages);
        setLanguageOpen(false);
        return newLanguages;
      }
    });
  };

  const filteredLanguages = allLanguages.filter((lang) =>
    lang.name.toLowerCase().includes(languageSearch.toLowerCase())
  );

  const selectedLanguages = allLanguages.filter((lang) =>
    languages.includes(lang.name)
  );

  const mapCatalogRowsToTours = useCallback(
    async (rawList: Array<Tour & { image?: string | null }>): Promise<Tour[]> => {
      // next/image only accepts http(s) or root-relative paths — never raw storage
      // keys like "images/….jpg". Sign those, otherwise keep a placeholder.
      const firstPaths = rawList.map((tour) => firstImagePathFromRaw(tour.image || null));
      const storagePaths = firstPaths.filter(
        (p): p is string =>
          !!p &&
          !p.startsWith("http://") &&
          !p.startsWith("https://") &&
          !p.startsWith("/")
      );
      const signedMap = storagePaths.length
        ? await batchSignTourStoragePaths(storagePaths)
        : {};

      const mappedTours = rawList.map((tour, i) => {
        const rawImageData = tour.image || null;
        const firstPath = firstPaths[i];
        let imageUrl = "/assets/images/profile/placeholder.svg";
        if (firstPath) {
          if (firstPath.startsWith("http://") || firstPath.startsWith("https://") || firstPath.startsWith("/")) {
            imageUrl = firstPath;
          } else if (signedMap[firstPath]) {
            imageUrl = signedMap[firstPath];
          }
        }

        const t = tour as Record<string, unknown>;
        return {
          ...tour,
          image: imageUrl,
          imagePath: rawImageData || "",
          rawImage: rawImageData,
          title: tour.name || tour.title || "Untitled Tour",
          location: tour.location || "",
          country: tour.country || "",
          description: tour.description || "",
          activity_type: tour.activity_type || "",
          duration: calculateTimeDuration(tour.start_time, tour.end_time),
          people: tour.group_size || 1,
          stops: 1,
          highlights: tour.description || "No description provided",
          pricePerAdult: t.pricePerAdult ?? t.price_per_adult ?? null,
          pricePerChild: t.pricePerChild ?? t.price_per_child ?? null,
          pricePerInfant: t.pricePerInfant ?? t.price_per_infant ?? null,
          languages: (() => {
            if (!tour.languages) return ["English"];
            if (Array.isArray(tour.languages)) return tour.languages;
            if (typeof tour.languages === "string") {
              try {
                const parsed = JSON.parse(tour.languages);
                return Array.isArray(parsed) ? parsed : ["English"];
              } catch {
                const split = tour.languages.split(",").map((l) => l.trim()).filter(Boolean);
                return split.length > 0 ? split : ["English"];
              }
            }
            return ["English"];
          })(),
          postedDate: formatDate(tour.created_at),
          start_time: tour.start_time || "",
          end_time: tour.end_time || "",
          agent: tour.agent || { name: "Unknown" },
        };
      });

      return mappedTours as unknown as Tour[];
    },
    []
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCatalogSearch(tourCatalogSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [tourCatalogSearch]);

  useEffect(() => {
    if (tourOpen && !prevTourOpenRef.current) {
      setTourCatalogSearch("");
      setDebouncedCatalogSearch("");
      setCatalogView(
        hasTransferzDraft(itineraryId, selectTourDate ?? null) ? "transferz" : "tours"
      );
    }
    prevTourOpenRef.current = tourOpen;
  }, [tourOpen, itineraryId, selectTourDate]);

  useEffect(() => {
    if (!tourOpen) return;
    let cancelled = false;
    (async () => {
      // Activity types are a fixed menu (order + labels). Destinations still come from facets.
      setCatalogActivityTypes([...TOUR_ACTIVITY_TYPES]);
      try {
        const res = await fetch("/api/tour/facets", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.ok) return;
        setCountries(Array.isArray(data.locations) ? data.locations : []);
      } catch {
        if (!cancelled) {
          setCountries([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tourOpen]);

  useEffect(() => {
    if (!tourOpen) return;
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("limit", "60");
        params.set("offset", "0");
        if (selectCountry) params.set("location", selectCountry);
        if (selectActivityTypeFilter) params.set("activityType", selectActivityTypeFilter);
        if (debouncedCatalogSearch) params.set("q", debouncedCatalogSearch);

        const response = await fetch(`/api/tour/list?${params.toString()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        if (!data.ok || !Array.isArray(data.tours)) {
          if (!ac.signal.aborted) {
            setTours([]);
            setHasMoreCatalog(false);
          }
          return;
        }

        const mapped = await mapCatalogRowsToTours(
          data.tours as Array<Tour & { image?: string | null }>
        );
        if (ac.signal.aborted) return;
        setTours(mapped);
        setHasMoreCatalog(Boolean(data.hasMore));
      } catch (error) {
        if (ac.signal.aborted) return;
        console.error("Error fetching tours:", error);
        setTours([]);
        setHasMoreCatalog(false);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [tourOpen, selectCountry, selectActivityTypeFilter, debouncedCatalogSearch, mapCatalogRowsToTours]);

  const loadMoreTours = useCallback(async () => {
    if (!tourOpen || !hasMoreCatalog || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "60");
      params.set("offset", String(tours.length));
      if (selectCountry) params.set("location", selectCountry);
      if (selectActivityTypeFilter) params.set("activityType", selectActivityTypeFilter);
      if (debouncedCatalogSearch) params.set("q", debouncedCatalogSearch);

      const response = await fetch(`/api/tour/list?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.tours)) return;

      const mapped = await mapCatalogRowsToTours(data.tours as Array<Tour & { image?: string | null }>);
      setTours((prev) => [...prev, ...mapped]);
      setHasMoreCatalog(Boolean(data.hasMore));
    } catch (e) {
      console.error("Error loading more tours:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [
    tourOpen,
    hasMoreCatalog,
    loadingMore,
    loading,
    tours.length,
    selectCountry,
    selectActivityTypeFilter,
    debouncedCatalogSearch,
    mapCatalogRowsToTours,
  ]);

  const handleRemoveImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Validate all files
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please drop only image files");
        return;
      }
      if (file.size > 1 * 1024 * 1024) {
        toast.error("Each image should be less than 1MB");
        return;
      }
    }

    // Process all files
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            file,
            preview: e.target?.result as string,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(processFiles).then((processed) => {
      const currentTotal = existingImages.length + imageFiles.length;
      const remainingSlots = MAX_IMAGES - currentTotal;

      if (remainingSlots <= 0) {
        toast.error(`Maximum ${MAX_IMAGES} images allowed. Please remove some images first.`);
        return;
      }

      // Only add as many as we have slots
      const toAdd = processed.slice(0, remainingSlots);
      setImageFiles((prev) => [...prev, ...toAdd]);

      if (processed.length > remainingSlots) {
        toast.error(`Only ${remainingSlots} image(s) added. Maximum ${MAX_IMAGES} images allowed.`);
      }
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Validate all files
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select only image files")
        return
      }
      if (file.size > 1 * 1024 * 1024) {
        toast.error("Each image should be less than 1MB")
        return
      }
    }

    // Process all files
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          resolve({
            file,
            preview: ev.target?.result as string,
          })
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(processFiles).then((processed) => {
      const currentTotal = existingImages.length + imageFiles.length;
      const remainingSlots = MAX_IMAGES - currentTotal;

      if (remainingSlots <= 0) {
        toast.error(`Maximum ${MAX_IMAGES} images allowed. Please remove some images first.`);
        return;
      }

      // Only add as many as we have slots
      const toAdd = processed.slice(0, remainingSlots);
      setImageFiles((prev) => [...prev, ...toAdd]);

      if (processed.length > remainingSlots) {
        toast.error(`Only ${remainingSlots} image(s) added. Maximum ${MAX_IMAGES} images allowed.`);
      }
    })
  }

  const tourJobCompare = async (tour: Tour & {
    rawImage?: string | null;
    displayPrice?: number | null;
    pricePerAdult?: number | null;
    pricePerChild?: number | null;
    pricePerInfant?: number | null;
    displayPricePerAdult?: number | null;
    displayPricePerChild?: number | null;
    displayPricePerInfant?: number | null;
    price_per_adult?: number | null;
    price_per_child?: number | null;
    price_per_infant?: number | null;
    pricing_model?: string | null;
    base_rate?: number | null;
    base_group_size?: number | null;
    max_group_size?: number | null;
    additional_per_person_rate?: number | null;
    priceDisplayCommissions?: CommissionSettings | null;
  }) => {
    setJobData(true);
    setSelectedTourId(tour.id || null);
    const assignedId = tour.assignedGuides?.[0]?.id;
    setSelectedGuideId(assignedId || tour.agent?.id || null);
    setSelectedGuideName(tourGuideOperatorName(tour));
    const comm =
      tour.priceDisplayCommissions &&
        typeof tour.priceDisplayCommissions.commissionMarketplacePct === "number"
        ? tour.priceDisplayCommissions
        : null;
    setPriceCommissionSettings(comm);
    const isGroupRate = tour.pricing_model === "group_rate";
    const baseRate = tour.base_rate != null ? Number(tour.base_rate) : null;
    const baseGroupSize = tour.base_group_size != null ? Number(tour.base_group_size) : null;

    if (isGroupRate && baseRate != null && baseGroupSize != null && baseRate >= 0 && baseGroupSize >= 1) {
      setSelectedTourGroupRate({
        base_rate: baseRate,
        base_group_size: baseGroupSize,
        max_group_size: tour.max_group_size != null ? Number(tour.max_group_size) : null,
        additional_per_person_rate: tour.additional_per_person_rate ?? null,
      });
      setSelectedTourPerPerson(null);
      setDisplayPricePerPerson(null);
      setPriceError(null);
    } else {
      setSelectedTourGroupRate(null);
      const pricePerAdult = tour.pricePerAdult ?? tour.price_per_adult;
      const pricePerChild = tour.pricePerChild ?? tour.price_per_child;
      const pricePerInfant = tour.pricePerInfant ?? tour.price_per_infant;
      const hasPerPerson =
        pricePerAdult != null && pricePerChild != null && pricePerInfant != null;
      if (hasPerPerson) {
        setSelectedTourPerPerson({
          pricePerAdult: Number(pricePerAdult),
          pricePerChild: Number(pricePerChild),
          pricePerInfant: Number(pricePerInfant),
        });
        const dpAdult = tour.displayPricePerAdult ?? (tour as Record<string, unknown>).displayPricePerAdult;
        const dpChild = tour.displayPricePerChild ?? (tour as Record<string, unknown>).displayPricePerChild;
        const dpInfant = tour.displayPricePerInfant ?? (tour as Record<string, unknown>).displayPricePerInfant;
        if (typeof dpAdult === "number" && typeof dpChild === "number" && typeof dpInfant === "number") {
          setDisplayPricePerPerson({ adult: dpAdult, child: dpChild, infant: dpInfant });
          setPriceError(null);
        } else {
          setDisplayPricePerPerson(null);
          setPriceError("This tour has no per-person pricing set. Add adult, child, and infant prices in the tour library.");
        }
      } else {
        setSelectedTourPerPerson(null);
        setDisplayPricePerPerson(null);
        setPriceError(isGroupRate ? "This tour's group rate is missing base rate or base group size." : "This tour has no pricing set. Add prices in the tour library.");
      }
    }
    setName(tour.name || "");

    // Safely extract and validate time values
    const extractedStartTime = extractTimeFromString(tour.start_time);
    const extractedEndTime = extractTimeFromString(tour.end_time);

    setStartTime(isValidTimeFormat(extractedStartTime) ? extractedStartTime : "09:30");
    setEndTime(isValidTimeFormat(extractedEndTime) ? extractedEndTime : "11:00");

    setLocation(tour.location || "");
    setDescription(tour.description || "");
    // Parse languages - could be JSON string, array, or comma-separated string
    let languagesArray: string[] = [];
    if (tour.languages) {
      if (typeof tour.languages === 'string') {
        try {
          const parsed = JSON.parse(tour.languages);
          languagesArray = Array.isArray(parsed) ? parsed : [];
        } catch {
          // If not JSON, treat as comma-separated string
          languagesArray = tour.languages.split(',').map(l => l.trim()).filter(Boolean);
        }
      } else if (Array.isArray(tour.languages)) {
        languagesArray = tour.languages;
      }
    }
    setLanguages(languagesArray);
    setNotes(tour.notes || "");
    setAdvisorComments("");
    setSelectActivity(tour.activity_type || "");

    // Reset image states
    setImageFiles([]);
    setExistingImages([]);

    // Parse and load all images from tour
    try {
      // Get the raw image data from the tour
      const rawImageData = (tour as any).rawImage || tour.imagePath || null;

      if (rawImageData) {
        let imagePaths: string[] = [];

        try {
          // Try to parse as JSON (array of paths)
          const parsed = JSON.parse(rawImageData);
          if (Array.isArray(parsed)) {
            imagePaths = parsed;
          } else if (typeof parsed === 'string') {
            imagePaths = [parsed];
          }
        } catch {
          // If not JSON, treat as single string
          imagePaths = [rawImageData];
        }

        const storagePaths = imagePaths.filter(
          (p) => typeof p === "string" && p.startsWith("images/")
        );
        const signedMap =
          storagePaths.length > 0 ? await batchSignTourStoragePaths(storagePaths) : {};
        const loadedImages: Array<{ path: string; url: string }> = [];
        for (const path of imagePaths) {
          let url = "/assets/images/profile/placeholder.svg";
          if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
            url = path;
          } else if (signedMap[path]) {
            url = signedMap[path];
          }
          loadedImages.push({ path, url });
        }

        if (loadedImages.length > MAX_IMAGES) {
          setExistingImages(loadedImages.slice(0, MAX_IMAGES));
          toast.error(`Only showing first ${MAX_IMAGES} images from tour. Maximum ${MAX_IMAGES} images allowed.`);
        } else {
          setExistingImages(loadedImages);
        }
      }
    } catch (error) {
      console.error("Error loading tour images:", error);
    }
  }


  const decAdults = () => setAdults((a) => Math.max(1, a - 1));
  const incAdults = () => setAdults((a) => a + 1);
  const decChildren = () => setChildren((c) => Math.max(0, c - 1));
  const incChildren = () => setChildren((c) => c + 1);
  const decInfants = () => setInfants((i) => Math.max(0, i - 1));
  const incInfants = () => setInfants((i) => i + 1);

  const handleSave = async (forceCustomTour = false) => {
    setSaving(true);

    if (selectedTourGroupRate) {
      const over = isGroupSizeOverTourLimit(
        { pricing_model: "group_rate", max_group_size: selectedTourGroupRate.max_group_size ?? null },
        { adults, children, infants }
      );
      if (over) {
        const max = selectedTourGroupRate.max_group_size;
        toast.error(
          typeof max === "number"
            ? `Total participants cannot exceed ${max} for this tour.`
            : "Group size exceeds the limit for this tour."
        );
        setSaving(false);
        return;
      }
    }

    // Ensure valid time formats
    const validStartTime = isValidTimeFormat(startTime) ? startTime.trim() : "09:30";
    const validEndTime = isValidTimeFormat(endTime) ? endTime.trim() : "11:00";

    // Validate required fields
    if (!name.trim()) {
      toast.error("Please enter a name");
      setSaving(false);
      return;
    }

    if (!selectActivity) {
      toast.error("Please select an activity type");
      setSaving(false);
      return;
    }

    if (!location.trim()) {
      toast.error("Please enter a location");
      setSaving(false);
      return;
    }

    if (!selectedTourId && !forceCustomTour) {
      setSaving(false);
      setCustomTourWarnOpen(true);
      return;
    }

    let imagePaths: string[] = [];

    const isStoragePath = (p: string) =>
      typeof p === "string" &&
      p.length > 0 &&
      !p.startsWith("http://") &&
      !p.startsWith("https://") &&
      !p.startsWith("/");

    const parseTourImagePaths = (raw: unknown): string[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.filter((p): p is string => typeof p === "string" && isStoragePath(p));
      }
      if (typeof raw !== "string") return [];
      const trimmed = raw.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((p): p is string => typeof p === "string" && isStoragePath(p));
        }
        if (typeof parsed === "string" && isStoragePath(parsed)) return [parsed];
      } catch {
        if (isStoragePath(trimmed)) return [trimmed];
      }
      return [];
    };

    // Step 1: Prefer storage paths from the selected tour library images.
    // (Signed preview URLs must not be saved — they expire and break itinerary display.)
    const existingPaths = existingImages
      .slice(0, MAX_IMAGES)
      .map((img) => img.path)
      .filter((p): p is string => isStoragePath(p));
    if (existingPaths.length > 0) {
      imagePaths = [...existingPaths];
    } else if (selectedTourId) {
      const selected = tours.find((t) => t.id === selectedTourId) as
        | (Tour & { rawImage?: string | null; imagePath?: string })
        | undefined;
      const fromTour = parseTourImagePaths(
        selected?.rawImage || selected?.imagePath || null
      );
      if (fromTour.length > 0) imagePaths = fromTour.slice(0, MAX_IMAGES);
    }

    // Step 2: Upload all new images and add their paths
    if (imageFiles.length > 0) {
      const remainingSlots = MAX_IMAGES - imagePaths.length;
      if (remainingSlots > 0) {
        const filesToUpload = imageFiles.slice(0, remainingSlots);
        const fileArray = filesToUpload.map(item => item.file);
        const results = await uploadViaApi(fileArray, {
          bucket: BUCKETS.jobs,
          folder: "images",
        });
        const newPaths = results.map((r) => r.path);
        imagePaths = [...imagePaths, ...newPaths];
      }
    }

    // Limit total to MAX_IMAGES
    imagePaths = imagePaths.slice(0, MAX_IMAGES);

    // Convert languages array to JSON string for storage
    const languagesString = languages.length > 0
      ? JSON.stringify(languages)
      : null;
    try {
      const resp = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          which: "tour",
          itineraryId,
          activityDateISO: selectTourDate ?? null,
          name: name.trim(),
          activityType: selectActivity,
          startTime: validStartTime,
          endTime: validEndTime,
          location: location.trim(),
          description: description.trim() || null,
          imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
          languages: languagesString,
          notes: notes.trim() || null,
          advisorComments: advisorComments.trim() || null,
          adults: adults ?? null,
          children: children ?? null,
          infants: infants ?? null,
          groupSize: adults + children + infants,
          tourId: selectedTourId || null,
          guideId: selectedGuideId || null,

        }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create job");
      }

      toast.success("Created Successfully ✅");
      onSaved?.();
      setTourOpen(false)
      setJobData(false)

      // Reset states
      setImageFiles([]);
      setExistingImages([]);
      setSelectedTourId(null);
      setSelectedGuideId(null);
      setSelectedGuideName("");
      setSelectedTourPerPerson(null);
      setDisplayPricePerPerson(null);
      setPriceCommissionSettings(null);
      setPriceError(null);

      return data;
    } catch (error) {
      console.error("Error creating job:", error);
      // ✅ Type guard for safe message access
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }


  const handleActivityTypeFilterSelect = (activityType: string) => {
    setActivityTypeFilterOpen(false)
    if (isAirportTransfersCatalogType(activityType)) {
      setCatalogView("transferz")
      return
    }
    setSelectActivityTypeFilter(activityType)
  }

  const handleClearCountryFilter = () => {
    setSelectCountry("")
  }

  const handleClearActivityTypeFilter = () => {
    setSelectActivityTypeFilter("")
  }

  return (
    <>
    <Dialog open={tourOpen} onOpenChange={setTourOpen}>
      <DialogContent className="sm:max-w-2xl w-full px-4 sm:px-8 lg:px-8 rounded-2xl min-h-[70vh] max-h-[90vh] overflow-y-auto">

        {jobData ? <>
          {/* Close Button */}
          <button
            onClick={() => setJobData(false)}
            className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
          >
            <ArrowLeft className="w-5 h-5 cursor-pointer" />
          </button>
          <DialogHeader className="text-center space-y-1">
            <h2 className="text-2xl md:text-3xl font-bold text-center">
              Tour detail
            </h2>
          </DialogHeader>
          <div className="space-y-6 py-2 flex-1 overflow-y-auto pr-1">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                placeholder="New Activity"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-input"
              />
            </div>

            {/* Activity Type */}
            <div className="space-y-2 relative w-full max-w-sm">
              <label className="text-sm font-medium text-foreground">
                Activity Type
              </label>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActivityOpen(!activityOpen)}
                className="w-full justify-between border-input h-10"
              >
                {selectActivity || "Select One..."}
                <ChevronDown
                  className={`ml-2 h-4 w-4 shrink-0 transition-transform ${activityOpen ? "rotate-180" : ""}`}
                />
              </Button>

              {activityOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-80 overflow-y-auto">
                  {jobActivityTypes.map((activity) => (
                    <button
                      key={activity}
                      type="button"
                      onClick={() => {
                        if (isAirportTransfersCatalogType(activity)) {
                          setActivityOpen(false);
                          setJobData(false);
                          setCatalogView("transferz");
                          return;
                        }
                        setSelectActivity(activity);
                        setActivityOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors ${selectActivity === activity ? "bg-muted" : ""}`}
                    >
                      {activity}
                      {/* {isAirportTransfersCatalogType(activity) ? (
                        <span className="block text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                          Book a transfer via the configured provider
                        </span>
                      ) : null} */}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Times + Location */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Start
                </label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="border-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Finish
                </label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="border-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Location
                </label>
                <Input
                  placeholder="Area or address"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="border-input"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Activity Description..."
                className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Images */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Select or Upload Image
              </label>

              {/* Existing Images from Tour Library */}
              {existingImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Images from tour library ({existingImages.length}/{MAX_IMAGES}):
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {existingImages.map((img, index) => (
                      <div
                        key={index}
                        className="relative border-2 border-border rounded-lg overflow-hidden transition-all hover:border-[#D4AA25]/50"
                      >
                        <div className="aspect-video relative">
                          <Image
                            src={img.url}
                            alt={`Tour image ${index + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveExistingImage(index);
                          }}
                          className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                          aria-label="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Uploaded Images */}
              {imageFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    New uploaded images ({imageFiles.length}/{MAX_IMAGES - existingImages.length}):
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {imageFiles.map((img, index) => (
                      <div
                        key={index}
                        className="relative border-2 border-border rounded-lg overflow-hidden transition-all hover:border-[#D4AA25]/50"
                      >
                        <div className="aspect-video relative">
                          <Image
                            src={img.preview}
                            alt={`Uploaded image ${index + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(index);
                          }}
                          className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                          aria-label="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-1 left-1">
                          <span className="text-xs text-white bg-black/50 px-2 py-1 rounded truncate max-w-[calc(100%-0.5rem)]">
                            {img.file.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Area - Show if no images or allow adding more */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-[#D4AA25] transition-colors cursor-pointer group"
              >
                <input
                  id="itinerary-image"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
                <label
                  htmlFor="itinerary-image"
                  className="cursor-pointer block"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="p-2 bg-muted rounded-full group-hover:bg-[#D4AA25]/10 transition-colors">
                      <Upload className="w-5 h-5 text-muted-foreground group-hover:text-[#D4AA25] transition-colors" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                        {existingImages.length > 0 || imageFiles.length > 0
                          ? "Add more images"
                          : "Click to upload images or drag and drop"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PNG, JPG up to 1MB each
                      </div>
                    </div>
                  </div>
                </label>
              </div>

              {/* Image Count Info */}
              {(existingImages.length > 0 || imageFiles.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  Total images: {existingImages.length + imageFiles.length}/{MAX_IMAGES} (all will be uploaded)
                  {existingImages.length + imageFiles.length >= MAX_IMAGES && (
                    <span className="text-destructive ml-2">Maximum reached</span>
                  )}
                </p>
              )}
            </div>

            {/* Job fields (conditional) */}

            <div className="space-y-6">
              {/* Language Requirements */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Language Requirements
                </label>

                {/* Selected Language Badges */}
                {selectedLanguages.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {selectedLanguages.map((lang) => (
                      <span
                        key={lang.code}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-sm"
                      >
                        {lang.name}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLanguageToggle(lang);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Dropdown */}
                <div className="relative" ref={languageDropdownRef}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLanguageOpen(!languageOpen)}
                    className="w-full justify-between border-input h-10"
                  >
                    Select languages...
                    <ChevronDown
                      className={`ml-2 h-4 w-4 transition-transform ${languageOpen ? "rotate-180" : ""}`}
                    />
                  </Button>

                  {languageOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg">
                      {/* Search Input */}
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search languages..."
                            value={languageSearch}
                            onChange={(e) => setLanguageSearch(e.target.value)}
                            className="pl-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Language List */}
                      <div className="max-h-60 overflow-y-auto">
                        {filteredLanguages.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No languages found
                          </div>
                        ) : (
                          filteredLanguages.map((lang) => {
                            const isSelected = selectedLanguages.some(
                              (l) => l.code === lang.code
                            );

                            return (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => handleLanguageToggle(lang)}
                                className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors flex items-center gap-2 ${isSelected ? "bg-muted" : ""}`}
                              >
                                <span>{lang.name}</span>
                                {isSelected && (
                                  <span className="ml-auto text-sm text-foreground">✓</span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Participants: Adults (12+), Children (3–11), Infants (0–2) */}
              <div className="space-y-4">
                <label className="text-sm font-medium text-foreground">
                  Participants
                </label>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Adults (12+)</span>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={decAdults}
                    >
                      −
                    </Button>
                    <div className="w-10 text-center select-none font-medium">
                      {adults}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={incAdults}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Children (3–11)</span>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={decChildren}
                    >
                      −
                    </Button>
                    <div className="w-10 text-center select-none font-medium">
                      {children}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={incChildren}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Infants (0–2)</span>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={decInfants}
                    >
                      −
                    </Button>
                    <div className="w-10 text-center select-none font-medium">
                      {infants}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 px-0"
                      onClick={incInfants}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              {/* Calculated price: per-person or group-rate breakdown + total (incl. VAT) */}
              {selectedTourId != null && (
                <div className="rounded-xl border border-border/60 bg-muted/40 overflow-hidden">
                  {selectedTourGroupRate != null ? (
                    <div className="p-4 space-y-4">
                      <p className="text-sm font-semibold text-foreground tracking-tight">
                        Group rate — pricing breakdown
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Your group: {adults} adult{adults !== 1 ? "s" : ""}, {children} child{children !== 1 ? "ren" : ""}, {infants} infant{infants !== 1 ? "s" : ""}
                        {selectedTourGroupRate.max_group_size != null && (
                          <span className="block mt-1">
                            Maximum for this tour: {selectedTourGroupRate.max_group_size} people
                          </span>
                        )}
                      </div>
                      {groupRateOverMax && selectedTourGroupRate.max_group_size != null && (
                        <p className="text-sm text-destructive">
                          Total participants exceed the maximum ({selectedTourGroupRate.max_group_size}) for this tour. Reduce headcounts or pick another tour.
                        </p>
                      )}
                      {groupRateAgentBreakdown && groupRateAgentBreakdown.length > 0 && (
                        <ul className="space-y-1.5 text-sm">
                          {groupRateAgentBreakdown.map((line, idx) => (
                            <li key={idx} className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                {line.label}
                                {line.count > 1 && ` × ${line.count}`}
                              </span>
                              <span className="tabular-nums font-medium">¥{line.displayAmount.toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-border/60">
                        <span className="text-sm font-medium text-foreground">Total</span>
                        <span className="text-xl font-bold tabular-nums text-foreground">
                          {displayTotalForGroup != null
                            ? `¥${displayTotalForGroup.toLocaleString()}`
                            : "—"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Amounts include this guide&apos;s marketplace fee, agent commission, and VAT (same as the tour catalog). Total is for your selected group size.
                      </p>
                      {priceError && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
                          {priceError}
                        </p>
                      )}
                    </div>
                  ) : selectedTourPerPerson != null ? (
                    <div className="p-4 space-y-4">
                      <p className="text-sm font-semibold text-foreground tracking-tight">
                        Price per person
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/40">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Adults (12+)</span>
                          <span className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                            {displayPricePerPerson != null
                              ? `¥${Math.round(displayPricePerPerson.adult).toLocaleString()}`
                              : "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">per person</span>
                        </div>
                        <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/40">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Children (3–11)</span>
                          <span className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                            {displayPricePerPerson != null
                              ? `¥${Math.round(displayPricePerPerson.child).toLocaleString()}`
                              : "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">per person</span>
                        </div>
                        <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/40">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Infants (0–2)</span>
                          <span className="text-sm font-semibold tabular-nums text-foreground mt-0.5">
                            {displayPricePerPerson != null
                              ? `¥${Math.round(displayPricePerPerson.infant).toLocaleString()}`
                              : "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">per person</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pt-1">
                        Your group: {adults} adult{adults !== 1 ? "s" : ""}, {children} child{children !== 1 ? "ren" : ""}, {infants} infant{infants !== 1 ? "s" : ""}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-border/60">
                        <span className="text-sm font-medium text-foreground">Total</span>
                        <span className="text-xl font-bold tabular-nums text-foreground">
                          {displayTotalForGroup != null
                            ? `¥${displayTotalForGroup.toLocaleString()}`
                            : "—"}
                        </span>
                      </div>
                      {priceError && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
                          {priceError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-sm font-medium text-foreground mb-1">Pricing</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {priceError || "This tour has no pricing set. Add prices in the tour library to see the total here."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Notes for the advisor */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Notes for the advisor
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Great fit for a first-time visitor; suggest pairing with dinner nearby…"
                  className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Notes for the guide */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Notes for the guide
                </label>
                <p className="text-xs text-muted-foreground">
                  Share instructions with the guide or operator for this tour.
                </p>
                <textarea
                  value={advisorComments}
                  onChange={(e) => setAdvisorComments(e.target.value)}
                  placeholder="Please enter your comments for the guide or the operator here"
                  className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-3 border-t mt-2">
            <Button
              onClick={() => void handleSave()}
              disabled={saving || (selectedTourGroupRate != null && groupRateOverMax)}
              className="flex-1 bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
            >
              {saving ? "adding…" : "Add to Itinerary"}
            </Button>
            {(selectedGuideName || displayTotalForGroup != null) && (
              <div className="text-center text-sm space-y-0.5 px-1">
                {selectedGuideName ? (
                  <p className="text-muted-foreground">
                    Guide / operator:{" "}
                    <span className="font-semibold text-foreground">
                      {selectedGuideName}
                    </span>
                  </p>
                ) : null}
                {displayTotalForGroup != null ? (
                  <p className="text-muted-foreground">
                    Tour price:{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      ¥{displayTotalForGroup.toLocaleString()}
                    </span>
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </>
          : catalogView === "transferz" ? (
            <>
              <button
                onClick={() => setTourOpen(false)}
                className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
              <DialogHeader className="text-center space-y-1">
                <h2 className="text-2xl md:text-3xl font-bold text-center">
                  Add transfer
                </h2>
              </DialogHeader>
              <TourModalTransferzPanel
                itineraryId={itineraryId}
                activityDateISO={selectTourDate ?? null}
                onBack={() => setCatalogView("tours")}
                onComplete={() => {
                  onSaved?.();
                  setTourOpen(false);
                  setCatalogView("tours");
                }}
              />
            </>
          ) : (
            <>
              {/* Close Button */}
              <button
                onClick={() => setTourOpen(false)}
                className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <DialogHeader className="text-center space-y-1">
                <h2 className="text-2xl md:text-3xl font-bold text-center">
                  Tour List
                </h2>
              </DialogHeader>
              {/* Filters */}
              <div className="space-y-4 mb-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Search className="w-4 h-4" /> Search tours
                  </label>
                  <Input
                    placeholder="Name, guide, location, type…"
                    value={tourCatalogSearch}
                    onChange={(e) => setTourCatalogSearch(e.target.value)}
                    className="border-input"
                  />
                </div>
                {/* Country/Location Filter */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 min-w-0" ref={countryDropdownRef}>
                    <DestinationSelect
                      value={selectCountry}
                      onChange={setSelectCountry}
                      label="Filter by Destination"
                      placeholder="Select a destination..."
                      searchPlaceholder="Type to filter destinations…"
                      extraOptions={countries}
                    />
                  </div>
                  {selectCountry ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleClearCountryFilter}
                      className="px-3 h-10 border border-input hover:bg-red-50 hover:text-red-600 shrink-0 mb-0"
                      title="Clear destination filter"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>

                {/* Activity type filter (Airport Transfers opens Transferz booking) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    Filter by activity type
                  </label>
                  <div className="relative flex gap-2" ref={activityTypeDropdownRef}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActivityTypeFilterOpen(!activityTypeFilterOpen)}
                      className="flex-1 justify-between border-input h-10"
                    >
                      {selectActivityTypeFilter || "Select an activity type…"}
                      <ChevronDown
                        className={`ml-2 h-4 w-4 transition-transform ${activityTypeFilterOpen ? "rotate-180" : ""}`}
                      />
                    </Button>
                    {selectActivityTypeFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleClearActivityTypeFilter}
                        className="px-3 h-10 border border-input hover:bg-red-50 hover:text-red-600"
                        title="Clear activity type filter"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}

                    {activityTypeFilterOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg top-full max-h-none overflow-visible">
                        <div>
                          {catalogActivityTypes.length > 0 ? (
                            catalogActivityTypes.map((activityType) => (
                              <button
                                key={activityType}
                                type="button"
                                onClick={() => handleActivityTypeFilterSelect(activityType)}
                                className={`w-full text-left px-4 py-2 hover:bg-muted ${selectActivityTypeFilter === activityType ? "bg-muted" : ""
                                  }`}
                              >
                                {activityType}
                                {/* {isAirportTransfersCatalogType(activityType) ? (
                                  <span className="block text-[11px] text-muted-foreground font-normal mt-0.5 leading-snug">
                                    Book a transfer via the configured provider
                                  </span>
                                ) : null} */}
                              </button>
                            ))
                          ) : (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              No tour types available
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className='tourList'>
                {loading ? (
                  <p className="text-sm text-center text-muted-foreground py-12">Loading tours…</p>
                ) : tours.length > 0 ? (
                  tours.map((tour) => (
                    <div
                      key={tour.id}
                      className="flex items-center space-x-4 p-4 border rounded-lg hover:shadow-md transition-shadow duration-200 relative mb-4"
                    >
                      {/* Left: Image */}
                      <div className="w-24 h-24 shrink-0 relative">
                        {tour.image &&
                        (tour.image.startsWith("http://") ||
                          tour.image.startsWith("https://") ||
                          tour.image.startsWith("/")) ? (
                          <Image
                            src={tour.image}
                            fill
                            alt="Tour Image"
                            className="relative rounded-sm object-cover"
                            unoptimized={tour.image.startsWith("http")}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                            No Image
                          </div>
                        )}
                      </div>

                      {/* Right: Details */}
                      <div className="flex-1 flex flex-col justify-between min-w-0 pr-28">
                        <div>
                          <h3 className="font-semibold text-lg">{tour.title || tour.name || "Untitled Tour"}</h3>
                          <p className="text-sm text-gray-500">
                            {tour.country}, {tour.location}
                          </p>
                          {tourGuideOperatorName(tour) ? (
                            <p className="text-sm text-foreground mt-0.5">
                              Guide / operator:{" "}
                              <span className="font-medium">
                                {tourGuideOperatorName(tour)}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-4 items-center">
                          <span>Start: {tour.start_time || "-"}</span>
                          <span>End: {tour.end_time || "-"}</span>
                        </div>
                        {tour.displayPrice != null && Number.isFinite(tour.displayPrice) && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-sm font-semibold text-black">
                              Tour price: ¥{Number(tour.displayPrice).toLocaleString()}
                            </p>
                            {tour.priceLabel ? (
                              <p className="text-xs text-gray-500">{tour.priceLabel}</p>
                            ) : (
                              <p className="text-xs text-gray-500">Total (catalog)</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Add Button */}
                      <button
                        // onClick={() => tourJobAdd(tour)}
                        onClick={() => tourJobCompare(tour)}
                        className="cursor-pointer absolute right-4 top-1/2 transform -translate-y-1/2 flex-1 bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold px-3 py-1 rounded-full text-sm transition"
                      >
                        Add to Itinerary
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-6">No tour found</div>
                )}
                {!loading && hasMoreCatalog && tours.length > 0 && (
                  <div className="flex justify-center pt-4 pb-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadMoreTours()}
                      disabled={loadingMore}
                      className="min-w-[160px]"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

      </DialogContent>
    </Dialog>
    <AlertDialog open={customTourWarnOpen} onOpenChange={setCustomTourWarnOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add without Tour Library link?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This activity is not linked to a Tour Library tour. Confirm booking and guide
              notifications will not work until you import from{" "}
              <strong>Agent → Tour Library → Add to itinerary</strong> (or pick a catalog tour above).
            </span>
            <span className="block text-muted-foreground">
              Custom lines also do not appear under Guide → Tour Library — only on this itinerary job board.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Select from library instead</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            onClick={(e) => {
              e.preventDefault();
              setCustomTourWarnOpen(false);
              void handleSave(true);
            }}
          >
            Add custom activity anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}

export default TourModal