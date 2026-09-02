"use client";

import type React from "react";

import { type SidebarActivity } from "@/app/types";
import { TransferBookingPreviewModal } from "@/components/itineraries/transfer-booking-preview-modal";
import { JpyUsdPriceLabel } from "@/components/itineraries/jpy-usd-price-label";
import { TransferJourneyModifyModal } from "@/components/itineraries/transfer-journey-modify-modal";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUCKETS } from "@/lib/buckets";
import {
  normalizeJobImagePaths,
  normalizeStorageObjectPath,
  signJobOrTourImagePaths,
} from "@/lib/job-tour-image-sign";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { TOUR_ACTIVITY_TYPES } from "@/lib/tour-activity-types";
import {
  DEFAULT_ADVISOR_MARKUP_PCT,
  DEFAULT_PAGODA_MARKUP_PCT,
  effectiveLineMarkupPct,
  effectiveMarkupPct,
  pagodaPriceToAdvisor,
  resolveClientDisplayPrice,
} from "@/lib/advisor-markup";
import {
  cleanTransferDescriptionForForm,
  TRANSFERZ_REQUEST_CHANGES_THROUGH_AGENT,
  TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY,
} from "@/lib/transfer-booking-display";
import { transferzCustomerDisplayAmount } from "@/lib/transferz/commission";
import {
  formatTransferzFreeCancellationSummary,
  isTransferzJourneyCanceledStatus,
} from "@/lib/transferz/journey";
import { uploadViaApi } from "@/lib/upload-client";
import {
  jobTimeRangeLabel,
  utcTimestampFromActivityDateAndHHMM,
} from "@/lib/itinerary-activity-timestamps";
import { ChevronDown, Search, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import countries from "world-countries";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function tryParseJsonNotes(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatTransferProviderNotes(rawNotes: unknown): { isProvider: boolean; display: string } {
  const j = tryParseJsonNotes(rawNotes);
  if (!j) return { isProvider: false, display: "" };
  if (j.source !== "transferz") return { isProvider: false, display: "" };

  const cust = transferzCustomerDisplayAmount(j);
  const currency = j.currency != null ? String(j.currency) : "";
  const bookingCode = j.bookingCode != null ? String(j.bookingCode) : "";
  const journeyCode = j.journeyCode != null ? String(j.journeyCode) : "";
  const status = j.status != null ? String(j.status) : "";

  const payment = isRecord(j.payment) ? j.payment : null;
  const paymentStatus = payment?.status != null ? String(payment.status) : "";
  const cadence = payment?.cadence != null ? String(payment.cadence) : "monthly";

  const lines = [
    "This activity was created from a transfer booking.",
    cust != null && currency ? `Amount: ${cust} ${currency}` : null,
    bookingCode || journeyCode ? `Provider ref: ${bookingCode || "—"} / ${journeyCode || "—"}` : null,
    status ? `Provider status: ${status}` : null,
    `Payment: invoice (${cadence})${paymentStatus ? ` · ${paymentStatus}` : ""}`,
  ].filter(Boolean) as string[];

  return { isProvider: true, display: lines.join("\n") };
}

function getLanguages() {
  // Build a unique list of languages from the world-countries dataset
  const map = new Map<string, string>();
  const countriesList = countries as { languages?: Record<string, string> }[];
  countriesList.forEach((c) => {
    if (c.languages && typeof c.languages === "object") {
      Object.entries(c.languages).forEach(([code, name]) => {
        if (!map.has(code)) map.set(code, String(name));
      });
    }
  });
  return Array.from(map.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface EditActivitySidebarProps {
  activity?: SidebarActivity;
  /** Required to cancel Transferz bookings from this sidebar. */
  itineraryId?: string;
  /** Used as client thread name for Guide ↔ Advisor chat */
  itineraryName?: string | null;
  /** Itinerary owner (advisor) — required for Message Guide, especially when admin is editing. */
  advisorUserId?: string | null;
  /** Itinerary markup % override (null → account default). */
  itineraryMarkupPct?: number | null;
  /** Advisor account default markup %. */
  accountDefaultMarkupPct?: number | null;
  onSaved?: () => void;
  /** Merge saved fields into parent selection (keeps Notes for the guide after refresh). */
  onActivityUpdated?: (patch: Partial<SidebarActivity>) => void;
  onClose?: () => void;
}

export function EditActivitySidebar({
  activity,
  itineraryId,
  itineraryName,
  advisorUserId,
  itineraryMarkupPct = null,
  accountDefaultMarkupPct = null,
  onSaved,
  onActivityUpdated,
  onClose,
}: EditActivitySidebarProps) {
  const router = useRouter();
  const [messaging, setMessaging] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [transferPreviewOpen, setTransferPreviewOpen] = useState(false);
  const [transferCancelOpen, setTransferCancelOpen] = useState(false);
  const [cancelingTransferz, setCancelingTransferz] = useState(false);
  const [modifyTransferOpen, setModifyTransferOpen] = useState(false);

  const agencyIdForChat =
    (typeof advisorUserId === "string" && advisorUserId.trim()) ||
    sessionUserId ||
    null;

  // Session user (admin or advisor) — /api/user fails for admins (not in users table)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bootstrap", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json?.ok && json.user?.id) {
          setSessionUserId(String(json.user.id));
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMessageGuide = async () => {
    if (!activity?.guideId || !agencyIdForChat) {
      toast.error(
        !activity?.guideId
          ? "This tour has no linked guide to message."
          : "Missing advisor account for this chat. Refresh the page and try again."
      );
      return;
    }

    setMessaging(true);
    try {
      const { startGuideAdvisorChat } = await import("@/lib/start-guide-advisor-chat");
      const result = await startGuideAdvisorChat({
        guideId: activity.guideId,
        advisorUserId: agencyIdForChat,
        itineraryName,
        itineraryId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(result.href);
    } catch (error) {
      console.error("Error starting chat:", error);
      toast.error("Failed to start chat");
    } finally {
      setMessaging(false);
    }
  };

  // const getActivityType = () => {
  //   return activity?.activityType || "";
  // };

  const [formData, setFormData] = useState({
    name: "",
    activityType: "",
    startTime: "09:30",
    endTime: "11:00",
    location: "",
    description: "",
    imagePaths: [] as File[],
    imagePreviews: [] as string[],
    createJob: false,
    languages: [] as string[],
    groupSize: null as number | null,
    adults: null as number | null,
    children: null as number | null,
    infants: null as number | null,
    notes: "",
    advisorComments: "",
  });
  const [existingImages, setExistingImages] = useState<string[]>([]); // Display URLs (signed or original)
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]); // Original paths for saving
  const [supplierPrice, setSupplierPrice] = useState("");
  const [lineMarkupPct, setLineMarkupPct] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const isProcessingDropRef = useRef(false);

  // Language selection state
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const allLanguages = getLanguages();

  const [providerNotes, setProviderNotes] = useState<string>("");
  const [hasProviderNotes, setHasProviderNotes] = useState(false);

  // Refs to track current state for image handling
  const formDataRef = useRef(formData);
  const existingImagePathsRef = useRef<string[]>([]);
  const existingImagesRef = useRef<string[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    existingImagePathsRef.current = existingImagePaths;
  }, [existingImagePaths]);

  useEffect(() => {
    existingImagesRef.current = existingImages;
  }, [existingImages]);

  // Helper function to extract storage path from signed URL
  const extractPathFromSignedUrl = (url: string): string | null => {
    try {
      // Pattern: https://...supabase.co/storage/v1/object/sign/{bucket}/{path}?token=...
      // Or: https://...supabase.co/storage/v1/object/public/{bucket}/{path}
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Check for signed URL pattern: /storage/v1/object/sign/{bucket}/{path}
      const signMatch = pathname.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (signMatch) {
        const [, bucket, path] = signMatch;
        // Return the full path including bucket (e.g., "jobs/images/file.jpg")
        return `${bucket}/${path}`;
      }

      // Check for public URL pattern: /storage/v1/object/public/{bucket}/{path}
      const publicMatch = pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (publicMatch) {
        const [, bucket, path] = publicMatch;
        return `${bucket}/${path}`;
      }

      return null;
    } catch {
      return null;
    }
  };

  // Keep form state in sync when a different activity is selected
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // If no activity, reset form — but not mid-save (refresh can briefly clear selection)
      if (!activity) {
        if (savingRef.current) return;
        // Clean up image previews
        formDataRef.current.imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setFormData({
          name: "",
          activityType: "",
          startTime: "09:30",
          endTime: "11:00",
          location: "",
          description: "",
          imagePaths: [],
          imagePreviews: [],
          createJob: false,
          languages: [],
          groupSize: null,
          adults: null,
          children: null,
          infants: null,
          notes: "",
          advisorComments: "",
        });
        setExistingImages([]);
        setExistingImagePaths([]);
        setSupplierPrice("");
        setIsDragging(false);
        return;
      }

      // Parse languages - could be JSON string or array
      let parsedLanguages: string[] = [];
      if (activity.languages) {
        try {
          if (typeof activity.languages === 'string') {
            const parsed = JSON.parse(activity.languages);
            parsedLanguages = Array.isArray(parsed) ? parsed : [];
          } else if (Array.isArray(activity.languages)) {
            parsedLanguages = activity.languages;
          }
        } catch {
          parsedLanguages = [];
        }
      }

      const toTimeInput = (raw: string | null | undefined, fallback: string) => {
        if (typeof raw !== "string" || !raw.trim()) return fallback;
        const t = raw.trim();
        if (/^\d{2}:\d{2}$/.test(t)) return t;
        if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
        return fallback;
      };

      const isTransferRow = Boolean(activity.id?.startsWith("transferz-"));
      const transferPayload = activity.transferPayload ?? null;

      const savedForThis =
        lastSavedNotesRef.current?.id === activity.id ? lastSavedNotesRef.current : null;

      setFormData((prev) => ({
        ...prev,
        name: activity.title || "",
        activityType: activity.activityType || "",
        startTime: toTimeInput(
          (activity as { pickupStartLocalHHMM?: string | null }).pickupStartLocalHHMM,
          toTimeInput(activity.time?.split(" - ")[0], "09:30")
        ),
        endTime: toTimeInput(
          (activity as { pickupEndLocalHHMM?: string | null }).pickupEndLocalHHMM,
          toTimeInput(activity.time?.split(" - ")[1], "11:00")
        ),
        location: activity.location || "",
        description: isTransferRow
          ? cleanTransferDescriptionForForm(activity.description ?? "")
          : activity.description || "",
        languages: parsedLanguages,
        groupSize: activity.groupSize || null,
        adults: activity.adults ?? null,
        children: activity.children ?? null,
        infants: activity.infants ?? null,
        notes: (() => {
          if (isTransferRow && transferPayload) {
            if (!cancelled) {
              setHasProviderNotes(false);
              setProviderNotes("");
            }
            return "";
          }
          const provider = formatTransferProviderNotes(activity.notes);
          if (provider.isProvider) {
            if (!cancelled) {
              setHasProviderNotes(true);
              setProviderNotes(provider.display);
            }
            return "";
          }
          if (!cancelled) {
            setHasProviderNotes(false);
            setProviderNotes("");
          }
          return (
            activity.notes ||
            savedForThis?.notes ||
            ""
          );
        })(),
        advisorComments:
          activity.advisorComments ||
          savedForThis?.advisorComments ||
          "",
      }));
      setSupplierPrice(
        activity.supplierPrice != null && Number.isFinite(activity.supplierPrice)
          ? String(activity.supplierPrice)
          : ""
      );
      setLineMarkupPct(
        activity.lineMarkupPct != null && Number.isFinite(activity.lineMarkupPct)
          ? String(activity.lineMarkupPct)
          : ""
      );

      // Load gallery images — same signing path as PDF (jobs → tours → itineraries)
      const activityImages = Array.isArray(activity?.images)
        ? activity.images.filter((img): img is string => typeof img === "string" && img.length > 0)
        : [];

      if (activityImages.length > 0) {
        try {
          type ImageSlot = { savePath: string; displayUrl?: string; needsSign: boolean };
          const slots: ImageSlot[] = [];

          for (const img of activityImages) {
            if (img.startsWith("http://") || img.startsWith("https://")) {
              const extracted = extractPathFromSignedUrl(img);
              const savePath = extracted
                ? normalizeStorageObjectPath(
                    extracted.includes("/") ? extracted.split("/").slice(1).join("/") : extracted
                  )
                : img;
              slots.push({ savePath, displayUrl: img, needsSign: false });
            } else if (img.startsWith("/")) {
              slots.push({ savePath: img, displayUrl: img, needsSign: false });
            } else {
              const savePath = normalizeStorageObjectPath(img);
              slots.push({ savePath, needsSign: true });
            }
          }

          const pathsToSign = [...new Set(slots.filter((s) => s.needsSign).map((s) => s.savePath))];
          const signedMap =
            pathsToSign.length > 0 ? await signJobOrTourImagePaths(pathsToSign) : {};

          if (cancelled) return;

          const savePaths = slots.map((s) => s.savePath);
          const displayUrls = slots
            .map((s) => {
              if (s.displayUrl) return s.displayUrl;
              return signedMap[s.savePath] || "";
            })
            .filter((url) => url.length > 0);

          setExistingImagePaths(savePaths);
          setExistingImages(displayUrls);
        } catch (error) {
          console.error("Error loading activity images:", error);
          if (!cancelled) {
            const fallbackPaths = normalizeJobImagePaths(activityImages);
            setExistingImagePaths(fallbackPaths);
            setExistingImages(
              activityImages.filter(
                (img) =>
                  img.startsWith("http://") ||
                  img.startsWith("https://") ||
                  img.startsWith("/")
              )
            );
          }
        }
      } else {
        setExistingImages([]);
        setExistingImagePaths([]);
      }

      setIsDragging(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // Re-run when parent hydrates signed gallery URLs for the same activity.
  }, [activity?.id, activity?.images]);

  // Keep note textareas in sync when parent confirms saved values (same activity id)
  useEffect(() => {
    if (!activity?.id || savingRef.current) return;
    const savedForThis =
      lastSavedNotesRef.current?.id === activity.id ? lastSavedNotesRef.current : null;
    const nextNotes =
      activity.notes ||
      savedForThis?.notes ||
      "";
    const nextAdvisor =
      activity.advisorComments ||
      savedForThis?.advisorComments ||
      "";
    setFormData((prev) => {
      if (prev.notes === nextNotes && prev.advisorComments === nextAdvisor) return prev;
      // Don't overwrite in-progress typing with empty server values
      const notes =
        nextNotes.trim() || prev.notes.trim() ? nextNotes || prev.notes : nextNotes;
      const advisorComments =
        nextAdvisor.trim() || prev.advisorComments.trim()
          ? nextAdvisor || prev.advisorComments
          : nextAdvisor;
      if (prev.notes === notes && prev.advisorComments === advisorComments) return prev;
      return { ...prev, notes, advisorComments };
    });
  }, [activity?.id, activity?.notes, activity?.advisorComments]);

  // Language handlers
  const handleLanguageToggle = (language: { code: string; name: string }) => {
    setFormData((prev) => {
      const currentLanguages = prev.languages || [];
      if (currentLanguages.includes(language.code)) {
        // remove if already selected
        return {
          ...prev,
          languages: currentLanguages.filter((code) => code !== language.code),
        };
      } else {
        // add if not selected
        const newLanguages = [...currentLanguages, language.code];
        setFormData((prev) => ({
          ...prev,
          languages: newLanguages,
        }));
        setLanguageOpen(false);
        return { ...prev, languages: newLanguages };
      }
    });
  };

  const filteredLanguages = allLanguages.filter((lang) =>
    lang.name.toLowerCase().includes(languageSearch.toLowerCase())
  );

  const selectedLanguages = allLanguages.filter((lang) =>
    (formData.languages || []).includes(lang.code)
  );

  // Adults/Children handlers
  const decAdults = () => {
    setFormData((prev) => ({
      ...prev,
      adults: Math.max(1, (prev.adults || 1) - 1),
    }));
  };

  const incAdults = () => {
    setFormData((prev) => ({
      ...prev,
      adults: (prev.adults || 1) + 1,
    }));
  };

  const decChildren = () => {
    setFormData((prev) => ({
      ...prev,
      children: Math.max(0, (prev.children || 0) - 1),
    }));
  };

  const incChildren = () => {
    setFormData((prev) => ({
      ...prev,
      children: (prev.children || 0) + 1,
    }));
  };

  const decInfants = () => {
    setFormData((prev) => ({
      ...prev,
      infants: Math.max(0, (prev.infants || 0) - 1),
    }));
  };

  const incInfants = () => {
    setFormData((prev) => ({
      ...prev,
      infants: (prev.infants || 0) + 1,
    }));
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Helper function to process new image files with FIFO logic
  const processNewImages = (
    files: File[],
    currentImages: File[],
    currentExistingPaths: string[],
    currentExistingImages: string[]
  ) => {
    const MAX_IMAGES = 5;
    const currentTotal = currentExistingPaths.length + currentImages.length;
    const totalAfterAdd = currentTotal + files.length;

    // Apply FIFO: remove oldest existing images if needed
    let newExisting = [...currentExistingImages];
    let newExistingPaths = [...currentExistingPaths];
    if (totalAfterAdd > MAX_IMAGES) {
      const excess = totalAfterAdd - MAX_IMAGES;
      // Remove oldest existing images first (FIFO)
      if (excess > 0 && newExistingPaths.length > 0) {
        const removeFromExisting = Math.min(excess, newExistingPaths.length);
        newExisting = newExisting.slice(removeFromExisting);
        newExistingPaths = newExistingPaths.slice(removeFromExisting);
      }
    }

    // Calculate how many files we can actually add (after FIFO removal of existing images)
    const remainingSlots = MAX_IMAGES - (newExistingPaths.length + currentImages.length);
    if (remainingSlots <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return null;
    }

    // Take only as many files as we have slots
    const filesToAdd = files.slice(0, remainingSlots);
    const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file));

    return {
      filesToAdd,
      newPreviews,
      newExisting,
      newExistingPaths,
    };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) {
      e.target.value = "";
      return;
    }

    // Use refs to get current state values synchronously
    const currentImages = formDataRef.current.imagePaths;
    const currentExistingPaths = existingImagePathsRef.current;
    const currentExistingImages = existingImagesRef.current;

    const result = processNewImages(
      files,
      currentImages,
      currentExistingPaths,
      currentExistingImages
    );

    if (!result) {
      e.target.value = "";
      return;
    }

    // Update all states
    setExistingImagePaths(result.newExistingPaths);
    setExistingImages(result.newExisting);
    setFormData((prev) => ({
      ...prev,
      imagePaths: [...prev.imagePaths, ...result.filesToAdd],
      imagePreviews: [...prev.imagePreviews, ...result.newPreviews],
    }));

    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounterRef.current += 1;
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Use counter to handle nested elements properly
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0; // Reset counter

    // Prevent duplicate processing
    if (isProcessingDropRef.current) {
      return;
    }
    isProcessingDropRef.current = true;

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length === 0) {
      isProcessingDropRef.current = false;
      return;
    }

    // Use refs to get current state values synchronously
    const currentImages = formDataRef.current.imagePaths;
    const currentExistingPaths = existingImagePathsRef.current;
    const currentExistingImages = existingImagesRef.current;

    const result = processNewImages(
      files,
      currentImages,
      currentExistingPaths,
      currentExistingImages
    );

    if (!result) {
      isProcessingDropRef.current = false;
      return;
    }

    // Update all states
    setExistingImagePaths(result.newExistingPaths);
    setExistingImages(result.newExisting);
    setFormData((prev) => ({
      ...prev,
      imagePaths: [...prev.imagePaths, ...result.filesToAdd],
      imagePreviews: [...prev.imagePreviews, ...result.newPreviews],
    }));

    // Reset processing flag after state update
    setTimeout(() => {
      isProcessingDropRef.current = false;
    }, 100);
  };

  const removeExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
    setExistingImagePaths((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    if (formData.imagePreviews[index]) {
      URL.revokeObjectURL(formData.imagePreviews[index]);
    }

    setFormData((prev) => ({
      ...prev,
      imagePaths: prev.imagePaths.filter((_, i) => i !== index),
      imagePreviews: prev.imagePreviews.filter((_, i) => i !== index),
    }));
  };

  // Clean up object URLs when component unmounts or previews change
  useEffect(() => {
    const previews = formData.imagePreviews;
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [formData.imagePreviews]);

  const [saving, setSaving] = useState(false);
  /** Prevent form wipe if parent briefly clears selection during post-save refresh. */
  const savingRef = useRef(false);
  /** Last successfully saved notes — used if a refresh returns before DB values land. */
  const lastSavedNotesRef = useRef<{
    id: string;
    notes: string;
    advisorComments: string;
  } | null>(null);

  const handleSave = async () => {
    if (!activity?.id) {
      toast.error("No activity selected");
      return;
    }

    if (activity.id.startsWith("transferz-")) {
      toast.error(
        "Transfers booked through the provider are read-only here. Remove the line from the day to take it off the itinerary."
      );
      return;
    }

    setSaving(true);
    savingRef.current = true;
    try {
      // 1) Upload new images if any
      let newImagePaths: string[] = [];
      if (formData.imagePaths.length) {
        const results = await uploadViaApi(formData.imagePaths, {
          bucket: BUCKETS.jobs,
          folder: "images",
        });
        newImagePaths = results.map((r) => r.path);
      }

      // 2) Combine existing image paths (that weren't removed) with newly uploaded ones
      const allImagePaths = [...existingImagePaths, ...newImagePaths];

      const savedNotes = formData.notes?.trim() || "";
      const savedAdvisorComments = formData.advisorComments?.trim() || "";

      const normalizeHHMM = (raw: string) => {
        const m = String(raw || "")
          .trim()
          .match(/^(\d{1,2}):(\d{2})/);
        if (!m) return String(raw || "").trim();
        return `${m[1].padStart(2, "0")}:${m[2]}`;
      };
      const startTime = normalizeHHMM(formData.startTime);
      const endTime = normalizeHHMM(formData.endTime);

      // 3) Prepare update data - matching /api/jobs PATCH handler expectations
      const updateData = {
        id: activity.id,
        activityDateISO: activity.activityDateISO || undefined,
        name: formData.name.trim(),
        activityType: formData.activityType || undefined,
        startTime,
        endTime,
        location: formData.location.trim(),
        description: formData.description?.trim() || null,
        imagePaths: allImagePaths.length > 0 ? allImagePaths : null, // Note: /api/jobs expects imagePaths, not images
        languages: formData.languages && formData.languages.length > 0
          ? (Array.isArray(formData.languages) ? JSON.stringify(formData.languages) : formData.languages)
          : null,
        groupSize: (formData.adults || 0) + (formData.children || 0) + (formData.infants || 0), // Note: /api/jobs expects groupSize, not group_size
        adults: formData.adults || null,
        children: formData.children || null,
        infants: formData.infants ?? null,
        notes: savedNotes || null,
        advisorComments: savedAdvisorComments || null,
        supplierPrice: supplierPrice.trim() === "" ? null : Number(supplierPrice),
        lineMarkupPct: lineMarkupPct.trim() === "" ? null : Number(lineMarkupPct),
        // Clear any legacy per-line fixed sell override
        clientPrice: null,
      };
      // 4) Send update request to /api/jobs endpoint
      const resp = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        const errorMsg = data?.error || "Failed to update job";
        console.error("Update error:", errorMsg, { updateData, response: data });
        throw new Error(errorMsg);
      }

      const savedJob = (data?.job || null) as {
        notes?: string | null;
        advisorComments?: string | null;
        advisor_comments?: string | null;
        start_time?: string | null;
        end_time?: string | null;
      } | null;
      const confirmedNotes =
        typeof savedJob?.notes === "string"
          ? savedJob.notes
          : savedNotes;
      const confirmedAdvisorComments =
        typeof savedJob?.advisorComments === "string"
          ? savedJob.advisorComments
          : typeof savedJob?.advisor_comments === "string"
            ? savedJob.advisor_comments
            : savedAdvisorComments;

      lastSavedNotesRef.current = {
        id: activity.id,
        notes: confirmedNotes,
        advisorComments: confirmedAdvisorComments,
      };

      const persistedStart =
        typeof savedJob?.start_time === "string" ? savedJob.start_time : null;
      const persistedEnd =
        typeof savedJob?.end_time === "string" ? savedJob.end_time : null;
      const timeLabel =
        jobTimeRangeLabel(persistedStart, persistedEnd) ||
        `${startTime} - ${endTime}`;
      const startIso =
        persistedStart ||
        utcTimestampFromActivityDateAndHHMM(activity.activityDateISO, startTime);
      const endIso =
        persistedEnd ||
        utcTimestampFromActivityDateAndHHMM(activity.activityDateISO, endTime);
      let durationLabel = activity.duration;
      try {
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = endTime.split(":").map(Number);
        if (
          Number.isFinite(sh) &&
          Number.isFinite(sm) &&
          Number.isFinite(eh) &&
          Number.isFinite(em)
        ) {
          let durMin = eh * 60 + em - (sh * 60 + sm);
          if (durMin < 0) durMin += 24 * 60;
          durationLabel =
            durMin >= 60 ? `${(durMin / 60).toFixed(1)} Hours` : `${durMin} Min`;
        }
      } catch {
        /* keep previous */
      }

      // Floored at the guide's agent commission, matching advisorMarkupPctForLine on the
      // server — otherwise a line saved with markup 0 previews without Pagoda's commission.
      const agentFloorPct =
        activity.commissionAgentPct != null &&
        Number.isFinite(Number(activity.commissionAgentPct))
          ? Number(activity.commissionAgentPct)
          : DEFAULT_ADVISOR_MARKUP_PCT;
      const markupPct = Math.max(
        agentFloorPct,
        effectiveLineMarkupPct(
          updateData.lineMarkupPct,
          itineraryMarkupPct,
          accountDefaultMarkupPct
        )
      );
      const supplierNum =
        updateData.supplierPrice != null &&
        Number.isFinite(Number(updateData.supplierPrice))
          ? Number(updateData.supplierPrice)
          : null;
      // Optimistic preview only — the server reprices from this guide's live commission on
      // the refresh that follows. Use the percentage it already sent us so the number does
      // not visibly jump; the constant is only for a line the server has not priced yet.
      const pagodaPct =
        activity.pagodaMarkupPct != null && Number.isFinite(Number(activity.pagodaMarkupPct))
          ? Number(activity.pagodaMarkupPct)
          : DEFAULT_PAGODA_MARKUP_PCT;
      const pagodaToAdvisor =
        supplierNum != null ? pagodaPriceToAdvisor(supplierNum, pagodaPct) : null;
      const resolved =
        supplierNum != null
          ? resolveClientDisplayPrice({
              platformBasePrice: pagodaToAdvisor,
              supplierPrice: null,
              markupPct,
              pagodaMarkupPct: pagodaPct,
            })
          : activity.baseDisplayPrice != null &&
              Number.isFinite(Number(activity.baseDisplayPrice))
            ? resolveClientDisplayPrice({
                platformBasePrice: Number(activity.baseDisplayPrice),
                markupPct,
              })
            : null;

      // Parent selection first so a refresh cannot re-hydrate empty notes into the form
      onActivityUpdated?.({
        title: updateData.name,
        subtitle: updateData.activityType || activity.subtitle,
        activityType: updateData.activityType || activity.activityType,
        location: updateData.location,
        description: updateData.description ?? undefined,
        notes: confirmedNotes,
        advisorComments: confirmedAdvisorComments,
        adults: updateData.adults ?? undefined,
        children: updateData.children ?? undefined,
        infants: updateData.infants ?? undefined,
        supplierPrice: updateData.supplierPrice ?? undefined,
        lineMarkupPct: updateData.lineMarkupPct ?? undefined,
        time: timeLabel,
        duration: durationLabel,
        start_time: startIso ?? undefined,
        end_time: endIso ?? undefined,
        ...(resolved
          ? {
              displayPrice: resolved.displayPrice,
              baseDisplayPrice: resolved.baseDisplayPrice,
            }
          : {}),
        images: allImagePaths.length > 0 ? allImagePaths : activity.images,
      });

      // Keep note fields in the form explicitly (image-only cleanup must not drop them)
      setFormData((prev) => ({
        ...prev,
        notes: confirmedNotes,
        advisorComments: confirmedAdvisorComments,
        imagePaths: [],
        imagePreviews: [],
      }));

      await Promise.resolve(onSaved?.());
      toast.success("Updated successfully!");

      // Re-assert after refresh in case a parent re-render raced the form state
      setFormData((prev) => {
        const saved =
          lastSavedNotesRef.current?.id === activity.id
            ? lastSavedNotesRef.current
            : null;
        const notes =
          saved && typeof saved.notes === "string"
            ? saved.notes
            : confirmedNotes || prev.notes;
        const advisorComments =
          saved && typeof saved.advisorComments === "string"
            ? saved.advisorComments
            : confirmedAdvisorComments || prev.advisorComments;
        return { ...prev, notes, advisorComments };
      });

      // Update existing image paths to reflect what was saved
      const savedImagePaths = [...existingImagePaths, ...newImagePaths];
      setExistingImagePaths(savedImagePaths);

      // Re-sign the images for display
      if (savedImagePaths.length > 0) {
        try {
          const pathsToSign = savedImagePaths.filter(
            (img: string) =>
              typeof img === "string" &&
              img.length > 0 &&
              !img.startsWith("http://") &&
              !img.startsWith("https://")
          );

          if (pathsToSign.length > 0) {
            // First try with jobs bucket
            const signedResults = await getSignedUrls(
              pathsToSign.map((path: string) => ({
                bucket: BUCKETS.jobs,
                path,
              }))
            );

            // Find paths that failed (no signedUrl AND no publicUrl)
            const failedPaths: string[] = [];
            const pathToUrl: Record<string, string> = {};
            signedResults.forEach((result, index) => {
              const url = result.signedUrl || result.publicUrl;
              const pathKey = result.path || pathsToSign[index];
              if (url) {
                pathToUrl[pathKey] = url;
              } else {
                // Both signedUrl and publicUrl are null/empty - path doesn't exist in jobs bucket
                // Use the original path from the input array
                failedPaths.push(pathsToSign[index]);
              }
            });

            // Try tours bucket for failed paths (these are likely from tour library)
            if (failedPaths.length > 0) {
              try {
                const tourResults = await getSignedUrls(
                  failedPaths.map((path: string) => ({
                    bucket: BUCKETS.tours,
                    path,
                  }))
                );

                tourResults.forEach((result, index) => {
                  const url = result.signedUrl || result.publicUrl;
                  const pathKey = result.path || failedPaths[index];
                  if (url) {
                    pathToUrl[pathKey] = url;
                  }
                });
              } catch (error) {
                console.error("Error signing tour images:", error);
              }
            }

            const signedImages = savedImagePaths.map((img: string) => {
              if (
                typeof img === "string" &&
                !img.startsWith("http://") &&
                !img.startsWith("https://")
              ) {
                return pathToUrl[img] || img;
              }
              return img;
            });

            setExistingImages(signedImages);
          } else {
            setExistingImages(savedImagePaths);
          }
        } catch {
          setExistingImages(savedImagePaths);
        }
      } else {
        setExistingImages([]);
      }
    } catch (e) {
      console.error("Save error:", e);
      const errorMsg = e instanceof Error ? e.message : "Failed to update activity";
      toast.error(errorMsg);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };


  if (!activity) {
    return (
      <Card className="p-6 sticky top-6">
        {/* <p className="text-center text-muted-foreground">
          Select an activity to edit
        </p> */}
      </Card>
    );
  }

  const transferPreviewPayload: Record<string, unknown> | null = activity.id?.startsWith(
    "transferz-"
  )
    ? activity.transferPayload ?? tryParseJsonNotes(activity.notes)
    : null;
  const transferPreviewFullAddress =
    transferPreviewPayload &&
      typeof transferPreviewPayload.fullDestinationAddress === "string"
      ? transferPreviewPayload.fullDestinationAddress.trim()
      : null;

  const transferzRowId =
    activity.id?.startsWith("transferz-") && activity.id
      ? activity.id.replace(/^transferz-/, "")
      : null;
  const transferzCanceled = transferPreviewPayload
    ? isTransferzJourneyCanceledStatus(
      typeof transferPreviewPayload.journeyStatus === "string"
        ? transferPreviewPayload.journeyStatus
        : null
    )
    : false;
  const transferzPolicyLine = transferPreviewPayload
    ? formatTransferzFreeCancellationSummary(transferPreviewPayload.cancellationDetails)
    : null;

  const handleCancelTransferzSidebar = async () => {
    if (!itineraryId || !transferzRowId) return;
    setCancelingTransferz(true);
    try {
      const res = await fetch(
        `/api/itineraries/${encodeURIComponent(itineraryId)}/transferz-bookings/${encodeURIComponent(transferzRowId)}/cancel`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Cancel failed");
      }
      toast.success("Reservation canceled with the provider.");
      setTransferCancelOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelingTransferz(false);
    }
  };

  return (
    <>
      <Card className="p-6 sticky top-6 space-y-6 border-2 border-[#D4AA25] max-h-[calc(100vh-8rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold">Edit Activity</h3>
          {activity?.id && (
            <span className="text-xs px-2 py-1 bg-[#D4AA25]/10 text-[#D4AA25] rounded-md font-medium">
              Selected
            </span>
          )}
        </div>
        {activity?.title && (
          <div className="px-3 py-2 bg-[#D4AA25]/5 border-l-4 border-[#D4AA25] rounded-r-md">
            <p className="text-sm font-medium text-foreground truncate">
              {activity.title}
            </p>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Name</span>
          </label>
          <Input
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Activity name"
            className="w-full"
          />
        </div>

        {/* Activity Type */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Activity Type</span>
          </label>
          <Select
            value={formData.activityType}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, activityType: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={formData.activityType} />
            </SelectTrigger>
            <SelectContent>
              {TOUR_ACTIVITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Start
            </label>
            <Input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleInputChange}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Finish
            </label>
            <Input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleInputChange}
              className="w-full"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-sm font-medium text-foreground">
              <span>Location</span>
            </label>
            {activity?.id?.startsWith("transferz-") ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-8 text-xs"
                onClick={() => setTransferPreviewOpen(true)}
              >
                Preview booking
              </Button>
            ) : null}
          </div>
          <Input
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            placeholder="Search location or address"
            className="w-full"
          />
        </div>

        {activity?.id?.startsWith("transferz-") ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-3 space-y-3">
            {transferzPolicyLine?.trim() ? (
              <p className="text-xs text-muted-foreground leading-relaxed">{transferzPolicyLine.trim()}</p>
            ) : null}
            <p className="text-xs text-muted-foreground leading-relaxed">{TRANSFERZ_REQUEST_CHANGES_THROUGH_AGENT}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {TRANSFERZ_TRAVELLER_PAGE_VIEW_ONLY}{" "}
              <button
                type="button"
                className="text-[#D4AA25] underline underline-offset-2"
                onClick={() => setTransferPreviewOpen(true)}
              >
                Preview booking
              </button>{" "}
              for the link and full details.
            </p>
            {itineraryId && transferzRowId && !transferzCanceled ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
                  onClick={() => setModifyTransferOpen(true)}
                >
                  Modify with provider
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setTransferCancelOpen(true)}
                  disabled={cancelingTransferz}
                >
                  Cancel reservation
                </Button>
              </div>
            ) : null}
            {transferzCanceled ? (
              <p className="text-xs text-green-700 font-medium">
                Canceled with the provider. You can remove this line from the day list.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Removing this line from the day is only allowed after the provider shows the journey as
                canceled.
              </p>
            )}
          </div>
        ) : null}

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Description</span>
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Activity Description..."
            className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Images */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Images</span>
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${isDragging
              ? "border-[#D4AA25] bg-[#FFF7E6]"
              : "border-border hover:border-[#D4AA25]"
              }`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label htmlFor="image-upload" className="cursor-pointer block">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload an image or drag and drop the image you want to
                use for this activity
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG up to 1MB (max 5 images)
              </p>
              {existingImagePaths.length + formData.imagePaths.length >= 5 && (
                <p className="text-xs text-destructive mt-1">
                  Maximum 5 images reached. Adding new images will remove the oldest ones.
                </p>
              )}
            </label>
          </div>

          {/* Existing Images */}
          {existingImages.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Existing Images:</p>
              <div className="grid grid-cols-2 gap-3">
                {existingImages.map((imageUrl, index) => (
                  <div key={`existing-${index}`} className="relative group">
                    <div className="relative w-full aspect-4/3 overflow-hidden rounded-md border border-border bg-muted">
                      <img
                        src={imageUrl}
                        alt={`Existing ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExistingImage(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Image Previews */}
          {formData.imagePreviews.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">New Images:</p>
              <div className="grid grid-cols-2 gap-3">
                {formData.imagePreviews.map((preview, index) => (
                  <div key={`new-${index}`} className="relative group">
                    <div className="relative w-full aspect-4/3 overflow-hidden rounded-md border border-border bg-muted">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNewImage(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {formData.imagePaths[index] && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {formData.imagePaths[index].name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Language Requirements */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Language Requirements</span>
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
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLanguageOpen(!languageOpen)}
              className="w-full justify-between border-input h-10"
            >
              Select languages...
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform ${languageOpen ? "rotate-180" : ""
                  }`}
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
                          className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors flex items-center gap-2 ${isSelected ? "bg-muted" : ""
                            }`}
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

        {/* Group Size */}
        <div className="space-y-4">
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Group Size</span>
          </label>

          {/* Adults */}
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
                {formData.adults || 1}
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

          {/* Children */}
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
                {formData.children || 0}
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

          {/* Infants */}
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
                {formData.infants || 0}
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

        {/* Line pricing */}
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="text-sm font-medium text-foreground">Line pricing</div>
          {activity?.displayPrice != null ? (
            <p className="text-xs text-muted-foreground">
              Current client-facing price:{" "}
              <JpyUsdPriceLabel
                jpy={Number(activity.displayPrice)}
                className="text-foreground font-medium"
              />
              {activity.baseDisplayPrice != null ? (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (base{" "}
                  <JpyUsdPriceLabel jpy={Number(activity.baseDisplayPrice)} className="inline" />)
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Supplier / partner price
              </label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Partner net cost"
                value={supplierPrice}
                onChange={(e) => setSupplierPrice(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Net cost for this line (tickets, hotel, restaurant, or a custom quote). Leave blank
                on a Pagoda tour to keep the guide/library price. If you enter a number, the
                itinerary price is rebuilt from it.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Your commission on this line (%)
              </label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={500}
                step={1}
                placeholder={`Itinerary default (${effectiveMarkupPct(itineraryMarkupPct, accountDefaultMarkupPct)}%)`}
                value={lineMarkupPct}
                onChange={(e) => setLineMarkupPct(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use the itinerary markup. Set to 0 for no margin (e.g. Shinkansen
                tickets).
              </p>
            </div>
          </div>
        </div>

        {/* Notes for the advisor */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Notes for the advisor</span>
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Saved on this line for the advisor to read on the itinerary — not a chat message and no
            email is sent. Use the <strong>Message advisor</strong> button (bottom-right) to chat with
            them.
          </p>
          {hasProviderNotes && providerNotes && (
            <div className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                {providerNotes}
              </p>
            </div>
          )}
          <textarea
            name="notes"
            value={formData.notes || ""}
            onChange={handleInputChange}
            placeholder="e.g. Prefer Hikari after 10:00, window seats together…"
            className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={hasProviderNotes}
          />
        </div>

        {/* Notes for the guide */}
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
            <span>Notes for the guide</span>
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Share instructions with the guide or operator for this activity.
          </p>
          <textarea
            name="advisorComments"
            value={formData.advisorComments || ""}
            onChange={handleInputChange}
            placeholder="Please enter your comments for the guide or the operator here"
            className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Create Job Checkbox */}
        {/* <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="create-job"
          checked={formData.createJob}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, createJob: e.target.checked }))
          }
          className="w-4 h-4 rounded border-input"
        />
        <label
          htmlFor="create-job"
          className="text-sm font-medium text-foreground cursor-pointer"
        >
          Create job for activity!
        </label>
      </div> */}

        {/* Tour DM Button - Only show if activity was created from tour library */}
        {activity?.guideId && activity.guideId !== agencyIdForChat && (
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMessageGuide}
              disabled={messaging || !agencyIdForChat}
              className="bg-[#D4AA25] text-white hover:bg-[#D4AA25]/90 border-[#D4AA25] cursor-pointer"
              title="Message guide who uploaded this tour"
            >
              {messaging ? "Starting chat..." : "Message Guide"}
            </Button>
          </div>
        )}

        {activity?.id &&
          !activity.id.startsWith("transferz-") &&
          (activity.hasCommittedGuide || activity.guideId) && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                Confirm booking asks the guide to confirm this tour’s live price. If it has
                changed from the Tour Library, Pagoda needs that figure before the booking is
                official and they invoice us. The guide completes this from the email link — they
                do not need the itinerary published for that step. Use{" "}
                <strong>Confirm booking</strong> on the tour row in the day list.
              </p>
            </div>
          )}

        {/* Buttons */}
        <div className="flex gap-3 pt-4 border-t border-border">
          <Button
            variant="outline"
            className="flex-1 bg-transparent"
            onClick={() => {
              // Reset form to original activity state
              if (activity) {
                // Parse languages
                let parsedLanguages: string[] = [];
                if (activity.languages) {
                  try {
                    if (typeof activity.languages === 'string') {
                      const parsed = JSON.parse(activity.languages);
                      parsedLanguages = Array.isArray(parsed) ? parsed : [];
                    } else if (Array.isArray(activity.languages)) {
                      parsedLanguages = activity.languages;
                    }
                  } catch {
                    parsedLanguages = [];
                  }
                }

                setFormData({
                  name: activity.title || "",
                  activityType: activity.activityType || "",
                  startTime: (() => {
                    const toIn = (raw: string | null | undefined, fb: string) => {
                      if (typeof raw !== "string" || !raw.trim()) return fb;
                      const t = raw.trim();
                      if (/^\d{2}:\d{2}$/.test(t)) return t;
                      if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
                      return fb;
                    };
                    return toIn(
                      (activity as { pickupStartLocalHHMM?: string | null }).pickupStartLocalHHMM,
                      toIn(activity.time?.split(" - ")[0], "09:30")
                    );
                  })(),
                  endTime: (() => {
                    const toIn = (raw: string | null | undefined, fb: string) => {
                      if (typeof raw !== "string" || !raw.trim()) return fb;
                      const t = raw.trim();
                      if (/^\d{2}:\d{2}$/.test(t)) return t;
                      if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
                      return fb;
                    };
                    return toIn(
                      (activity as { pickupEndLocalHHMM?: string | null }).pickupEndLocalHHMM,
                      toIn(activity.time?.split(" - ")[1], "11:00")
                    );
                  })(),
                  location: activity.location || "",
                  description: activity.id?.startsWith("transferz-")
                    ? cleanTransferDescriptionForForm(activity.description ?? "")
                    : activity.description || "",
                  imagePaths: [],
                  imagePreviews: [],
                  createJob: false,
                  languages: parsedLanguages,
                  groupSize: activity.groupSize || null,
                  adults: activity.adults ?? null,
                  children: activity.children ?? null,
                  infants: activity.infants ?? null,
                  notes: (() => {
                    const isTr = Boolean(activity.id?.startsWith("transferz-"));
                    const tp = activity.transferPayload ?? null;
                    if (isTr && tp) return "";
                    const prov = formatTransferProviderNotes(activity.notes);
                    return prov.isProvider ? "" : activity.notes || "";
                  })(),
                  advisorComments: activity.advisorComments || "",
                });
                setSupplierPrice(
                  activity.supplierPrice != null ? String(activity.supplierPrice) : ""
                );
              }
              // Close the sidebar
              onClose?.();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </Card>
      <AlertDialog open={transferCancelOpen} onOpenChange={setTransferCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel transfer reservation</AlertDialogTitle>
            <AlertDialogDescription>
              This requests cancellation with the transfer provider for &quot;{activity.title}&quot;. Fees may
              apply outside the free-cancellation window.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelingTransferz}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancelTransferzSidebar();
              }}
              disabled={cancelingTransferz}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelingTransferz ? "Canceling…" : "Confirm cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {itineraryId && transferzRowId ? (
        <TransferJourneyModifyModal
          open={modifyTransferOpen}
          onOpenChange={setModifyTransferOpen}
          itineraryId={itineraryId}
          transferzRowId={transferzRowId}
          title={activity.title ?? ""}
          payload={transferPreviewPayload}
          onApplied={() => onSaved?.()}
        />
      ) : null}

      <TransferBookingPreviewModal
        open={transferPreviewOpen}
        onOpenChange={setTransferPreviewOpen}
        title={activity.title ?? ""}
        activityType={activity.activityType}
        locationLabel={activity.location}
        fullAddress={transferPreviewFullAddress}
        description={cleanTransferDescriptionForForm(activity.description ?? "")}
        payload={transferPreviewPayload}
        onRequestModify={
          itineraryId && transferzRowId && !transferzCanceled
            ? () => {
              setTransferPreviewOpen(false);
              setModifyTransferOpen(true);
            }
            : undefined
        }
      />
    </>
  );
}
