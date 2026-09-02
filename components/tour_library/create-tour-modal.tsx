"use client";

import type React from "react";

import { Tour, TourItinerary } from "@/app/types";
import { DestinationSelect } from "@/components/shared/destination-select";
import { TourGuideProfilePicker } from "@/components/tour_library/tour-guide-profile-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BUCKETS } from "@/lib/buckets";
import { extractTimeFromString, getSignedImageUrl } from "@/lib/common-function";
import { TOUR_ACTIVITY_TYPES } from "@/lib/tour-activity-types";
import { uploadViaApi } from "@/lib/upload-client";
import { ChevronDown, Search, Upload, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import countries from "world-countries";

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

interface CreateItineraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItineraryCreated?: (tour: TourItinerary) => void;
  /** When set, form is pre-filled from this tour (create from existing / duplicate). */
  sourceTour?: Tour | null;
}

const activityTypes = [...TOUR_ACTIVITY_TYPES];

export function CreateTourModal({
  open,
  onOpenChange,
  onItineraryCreated,
  sourceTour = null,
}: CreateItineraryModalProps) {
  const [formData, setFormData] = useState({
    tourName: "",
    country: "",
    location: "",
    description: "",
    notes: "",
    languages: [] as string[],
    pricingModel: "per_person" as "per_person" | "group_rate",
    pricePerAdult: "" as string,
    pricePerChild: "" as string,
    pricePerInfant: "" as string,
    baseRate: "" as string,
    baseGroupSize: "" as string,
    maxGroupSize: "" as string,
    additionalPerPersonRate: "" as string,
  });
  const [imageFiles, setImageFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const imageFilesRef = useRef<Array<{ file: File; preview: string }>>([]);
  /** When creating from existing tour: storage paths to send (no re-upload). */
  const [existingImagePathsFromSource, setExistingImagePathsFromSource] = useState<string[]>([]);
  /** Previews for existing paths (signed URLs) for display. */
  const [existingImagePreviews, setExistingImagePreviews] = useState<Array<{ path: string; url: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<string>("09:30");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [activityOpen, setActivityOpen] = useState(false)
  const [selectActivity, setSelectActivity] = useState("")
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const allLanguages = getLanguages();
  const [guideIds, setGuideIds] = useState<string[]>([]);


  // Keep ref in sync with state
  useEffect(() => {
    imageFilesRef.current = imageFiles;
  }, [imageFiles]);

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setLanguageOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pre-fill form when opening with sourceTour (create from existing)
  useEffect(() => {
    if (!open || !sourceTour) {
      if (!open) {
        setExistingImagePathsFromSource([]);
        setExistingImagePreviews([]);
      }
      return;
    }
    let languagesArray: string[] = [];
    if (sourceTour.languages) {
      if (Array.isArray(sourceTour.languages)) {
        languagesArray = sourceTour.languages.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
      } else if (typeof sourceTour.languages === "string") {
        try {
          const parsed = JSON.parse(sourceTour.languages);
          languagesArray = Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === "string") : [];
        } catch {
          languagesArray = sourceTour.languages.split(",").map((l) => l.trim()).filter(Boolean);
        }
      }
    }
    const src = sourceTour as {
      pricingModel?: string | null;
      pricePerAdult?: number | null;
      pricePerChild?: number | null;
      pricePerInfant?: number | null;
      baseRate?: number | null;
      baseGroupSize?: number | null;
      maxGroupSize?: number | null;
      max_group_size?: number | null;
      additionalPerPersonRate?: number | null;
    };
    const isGroupRate = src.pricingModel === "group_rate";
    const srcMaxGroup =
      src.maxGroupSize ?? src.max_group_size ?? null;
    const hasPerPerson =
      src.pricePerAdult != null || src.pricePerChild != null || src.pricePerInfant != null;
    setFormData({
      tourName: `${(sourceTour.title || sourceTour.name || "Tour").trim()} (Copy)`,
      country: sourceTour.country || "",
      location: sourceTour.location || "",
      description: sourceTour.description || "",
      notes: sourceTour.notes || "",
      languages: languagesArray,
      pricingModel: isGroupRate ? "group_rate" : "per_person",
      pricePerAdult: hasPerPerson && src.pricePerAdult != null ? String(src.pricePerAdult) : "",
      pricePerChild: hasPerPerson && src.pricePerChild != null ? String(src.pricePerChild) : "",
      pricePerInfant: hasPerPerson && src.pricePerInfant != null ? String(src.pricePerInfant) : "",
      baseRate: isGroupRate && src.baseRate != null ? String(src.baseRate) : "",
      baseGroupSize: isGroupRate && src.baseGroupSize != null ? String(src.baseGroupSize) : "",
      maxGroupSize:
        isGroupRate && srcMaxGroup != null
          ? String(srcMaxGroup)
          : isGroupRate && src.baseGroupSize != null
            ? String(src.baseGroupSize)
            : "",
      additionalPerPersonRate: isGroupRate && src.additionalPerPersonRate != null ? String(src.additionalPerPersonRate) : "",
    });
    setStartTime(extractTimeFromString(sourceTour.start_time));
    setEndTime(extractTimeFromString(sourceTour.end_time));
    setSelectActivity(sourceTour.activity_type || "");

    if (sourceTour.image) {
      let imagePaths: string[] = [];
      try {
        const parsed = JSON.parse(sourceTour.image);
        if (Array.isArray(parsed)) {
          imagePaths = parsed.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
        } else if (typeof parsed === "string" && parsed.trim()) {
          imagePaths = [parsed.trim()];
        }
      } catch {
        if (typeof sourceTour.image === "string" && sourceTour.image.trim()) {
          imagePaths = [sourceTour.image.trim()];
        }
      }
      setExistingImagePathsFromSource(imagePaths);
      const loadPreviews = async () => {
        const previews = await Promise.all(
          imagePaths.map(async (path) => {
            try {
              const url = await getSignedImageUrl(path);
              return { path, url };
            } catch {
              return { path, url: "/assets/images/profile/placeholder.svg" };
            }
          })
        );
        setExistingImagePreviews(previews);
      };
      loadPreviews();
    } else {
      setExistingImagePathsFromSource([]);
      setExistingImagePreviews([]);
    }
    setImageFiles([]);
    imageFilesRef.current = [];
  }, [open, sourceTour]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLanguageToggle = (language: { code: string; name: string }) => {
    setFormData((prev) => {
      const currentLanguages = prev.languages || [];
      if (currentLanguages.includes(language.name)) {
        // Remove if already selected
        return { ...prev, languages: currentLanguages.filter((lang) => lang !== language.name) };
      } else {
        // Add if not selected
        const newLanguages = [...currentLanguages, language.name];
        setFormData((prev) => ({
          ...prev,
          languages: newLanguages
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
    formData.languages.includes(lang.name)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (
      !formData.tourName ||
      !formData.country ||
      !formData.location ||
      !formData.description ||
      !formData.notes ||
      !formData.languages
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    const pricingModel = formData.pricingModel;
    const pricePerAdultNum = formData.pricePerAdult.trim() === "" ? null : parseFloat(formData.pricePerAdult);
    const pricePerChildNum = formData.pricePerChild.trim() === "" ? null : parseFloat(formData.pricePerChild);
    const pricePerInfantNum = formData.pricePerInfant.trim() === "" ? null : parseFloat(formData.pricePerInfant);
    const baseRateNum = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
    const baseGroupSizeNum = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
    const maxGroupSizeNum = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
    const additionalPerPersonRateNum = formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);

    if (pricingModel === "group_rate") {
      if (baseRateNum == null || baseGroupSizeNum == null || baseRateNum < 0 || baseGroupSizeNum < 1) {
        toast.error("Group rate requires a base rate (¥) and base group size (at least 1).");
        setSubmitting(false);
        return;
      }
      if (maxGroupSizeNum == null || maxGroupSizeNum < 1) {
        toast.error("Enter maximum group size (total participants allowed).");
        setSubmitting(false);
        return;
      }
      if (maxGroupSizeNum < baseGroupSizeNum) {
        toast.error("Maximum group size must be at least as large as the base group size.");
        setSubmitting(false);
        return;
      }
      if (additionalPerPersonRateNum == null || additionalPerPersonRateNum < 0 || Number.isNaN(additionalPerPersonRateNum)) {
        toast.error("Enter additional price per person (¥) for each participant beyond the base group size (0 is allowed).");
        setSubmitting(false);
        return;
      }
    } else {
      const a = pricePerAdultNum ?? 0;
      const c = pricePerChildNum ?? 0;
      const i = pricePerInfantNum ?? 0;
      if (a < 0 || c < 0 || i < 0 || Number.isNaN(a) || Number.isNaN(c) || Number.isNaN(i)) {
        toast.error("Please enter valid per-person prices (0 or more for each).");
        setSubmitting(false);
        return;
      }
    }

    // Validate that at least one image is uploaded or we have existing paths from source tour
    if (imageFiles.length === 0 && existingImagePathsFromSource.length === 0) {
      toast.error("Please upload at least one image. Images are required to create a tour.");
      return;
    }



    setSubmitting(true);
    try {
      // 1) Image paths: use existing from source tour and/or upload new ones
      let imagePaths: string[] = [];
      if (existingImagePathsFromSource.length > 0) {
        imagePaths = [...existingImagePathsFromSource];
      }
      if (imageFiles.length > 0) {
        try {
          const uploadResults = await uploadViaApi(
            imageFiles.map((item) => item.file),
            {
              bucket: BUCKETS.tours,
              folder: "images",
            }
          );

          // Validate upload results
          if (!Array.isArray(uploadResults)) {
            throw new Error("Invalid upload response format");
          }

          // Extract valid paths (non-empty strings only)
          const validPaths = uploadResults
            .map((res) => res?.path)
            .filter((path): path is string => typeof path === 'string' && path.trim().length > 0);

          if (validPaths.length === 0 && imageFiles.length > 0) {
            throw new Error("Failed to upload images. Please try again.");
          }

          // Check if some uploads failed
          if (validPaths.length < imageFiles.length) {
            toast.error(`Warning: ${imageFiles.length - validPaths.length} image(s) failed to upload. Continuing with ${validPaths.length} image(s).`);
          }

          imagePaths = imagePaths.concat(validPaths);
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : "Failed to upload images";
          toast.error(errorMsg);
          throw new Error(`Image upload failed: ${errorMsg}`);
        }
      }

      // Ensure we have at least one path
      const validatedImagePaths = imagePaths
        .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        .slice(0, 5);

      if (validatedImagePaths.length === 0) {
        toast.error("At least one image is required to create a tour.");
        setSubmitting(false);
        return;
      }

      // ALWAYS create as published initially
      const status = "published";
      // Convert ISO to HH:mm (UTC-safe)
      const toTimestamp = (time: string) => `${time}:00`;
      // Convert languages array to JSON string for storage
      const languagesString = formData.languages.length > 0
        ? JSON.stringify(formData.languages)
        : null;

      if (guideIds.length === 0) {
        toast.error("Link at least one published guide profile to this tour.");
        setSubmitting(false);
        return;
      }

      const payload: Record<string, unknown> = {
        name: formData.tourName,
        country: formData.country,
        location: formData.location,
        description: formData.description,
        notes: formData.notes,
        languages: languagesString,
        activityType: selectActivity,
        startTime: toTimestamp(startTime || "09:30"),
        endTime: toTimestamp(endTime || "11:00"),
        imagePaths: validatedImagePaths.length > 0 ? validatedImagePaths : null,
        status: status,
        pricingModel,
        guideIds,
      };
      if (pricingModel === "group_rate") {
        payload.baseRate = baseRateNum ?? 0;
        payload.baseGroupSize = baseGroupSizeNum ?? 1;
        payload.maxGroupSize = maxGroupSizeNum ?? 1;
        payload.additionalPerPersonRate = additionalPerPersonRateNum ?? 0;
      } else {
        payload.pricePerAdult = pricePerAdultNum ?? 0;
        payload.pricePerChild = pricePerChildNum ?? 0;
        payload.pricePerInfant = pricePerInfantNum ?? 0;
      }

      const resp = await fetch("/api/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create tour");
      }

      toast.success("Tour created!");

      // Reset form and close modal
      setFormData({
        tourName: "",
        country: "",
        location: "",
        description: "",
        notes: "",
        languages: [],
        pricingModel: "per_person",
        pricePerAdult: "",
        pricePerChild: "",
        pricePerInfant: "",
        baseRate: "",
        baseGroupSize: "",
        maxGroupSize: "",
        additionalPerPersonRate: "",
      });
      setImageFiles([]);
      imageFilesRef.current = []; // Reset ref when form is submitted
      setExistingImagePathsFromSource([]);
      setExistingImagePreviews([]);
      setLanguageSearch("");
      onOpenChange(false);

      // Call the callback with the new tour
      if (onItineraryCreated && data.tour) {
        const newTour: TourItinerary = {
          id: String(data.tour.id),
          name: String(data.tour.name),
          country: String(data.tour.country),
          location: String(data.tour.location),
          startTime: String(data.tour.startTime),
          endTime: String(data.tour.endTime),
          description: String(data.tour.description),
          notes: String(data.tour.notes),
          languages: Array.isArray(data.tour.languages)
            ? data.tour.languages.join(", ")
            : String(data.tour.languages || ""),
          activityType: String(data.tour.selectActivity),
          jobsCount: 0,
          unassignedCount: 0,
          activities: [],
          status: "draft",
        };
        onItineraryCreated(newTour);
      }
      // Note: If no callback is provided, the parent component should handle refresh
      // We removed window.location.reload() to avoid race conditions
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    // Use ref to get current state synchronously (avoids race conditions)
    const currentImageCount = imageFilesRef.current.length + existingImagePathsFromSource.length;

    // Check if adding these files would exceed the limit
    if (currentImageCount + files.length > 5) {
      toast.error("You can only upload up to 5 images");
      // Reset input
      if (e.target) {
        e.target.value = "";
      }
      return;
    }

    // Validate all files
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select only image files");
        return;
      }

      if (file.size > 1 * 1024 * 1024) {
        toast.error("Each image should be less than 1MB");
        return;
      }
    }

    // Process all files with Promise.all to maintain order
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result && typeof result === 'string') {
            resolve({
              file,
              preview: result,
            });
          } else {
            reject(new Error(`Failed to read file: ${file.name}`));
          }
        };
        reader.onerror = () => {
          reject(new Error(`Error reading file: ${file.name}`));
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(processFiles)
      .then((newImageFiles) => {
        // Use functional update with ref to ensure we have the latest state
        setImageFiles((prev) => {
          const updated = [...prev, ...newImageFiles].slice(0, 5);
          // Update ref immediately to keep it in sync
          imageFilesRef.current = updated;
          return updated;
        });
      })
      .catch((error) => {
        const errorMsg = error instanceof Error ? error.message : "Failed to process image files";
        toast.error(errorMsg);
      });

    // Reset input
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // Update ref immediately to keep it in sync
      imageFilesRef.current = updated;
      return updated;
    });
  };

  const handleRemoveExistingImage = (index: number) => {
    setExistingImagePathsFromSource((prev) => prev.filter((_, i) => i !== index));
    setExistingImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Use ref to get current state synchronously (avoids race conditions)
    const currentImageCount = imageFilesRef.current.length + existingImagePathsFromSource.length;

    // Check if adding these files would exceed the limit
    if (currentImageCount + files.length > 5) {
      toast.error("You can only upload up to 5 images");
      return;
    }

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

    // Process all files with Promise.all to maintain order
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result && typeof result === 'string') {
            resolve({
              file,
              preview: result,
            });
          } else {
            reject(new Error(`Failed to read file: ${file.name}`));
          }
        };
        reader.onerror = () => {
          reject(new Error(`Error reading file: ${file.name}`));
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(processFiles)
      .then((newImageFiles) => {
        // Use functional update with ref to ensure we have the latest state
        setImageFiles((prev) => {
          const updated = [...prev, ...newImageFiles].slice(0, 5);
          // Update ref immediately to keep it in sync
          imageFilesRef.current = updated;
          return updated;
        });
      })
      .catch((error) => {
        const errorMsg = error instanceof Error ? error.message : "Failed to process image files";
        toast.error(errorMsg);
      });
  };

  // Reset form when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setFormData({
        tourName: "",
        country: "",
        location: "",
        description: "",
        notes: "",
        languages: [],
        pricingModel: "per_person",
        pricePerAdult: "",
        pricePerChild: "",
        pricePerInfant: "",
        baseRate: "",
        baseGroupSize: "",
        maxGroupSize: "",
        additionalPerPersonRate: "",
      });
      setImageFiles([]);
      imageFilesRef.current = []; // Reset ref when modal closes
      setExistingImagePathsFromSource([]);
      setExistingImagePreviews([]);
      setLanguageSearch("");
      setLanguageOpen(false);
    }
    onOpenChange(open);
  };

  // Find selected country for display


  // preferecture dropdown
  const [prefecture, setPrefecture] = useState("")

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPrefecture(e.target.value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-full px-6 sm:px-8 lg:px-14 rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={() => handleOpenChange(false)}
          className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader className="flex flex-col items-center justify-center text-center pt-2">
          <h1 className="text-3xl font-bold">{sourceTour ? "Create from existing tour" : "Create Tour Library"}</h1>
          <p className="text-sm text-muted-foreground -mt-2">
            {sourceTour ? "Edit the details below and save as a new tour" : "Start building a new tour package"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Itinerary Name */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Tour Name
            </label>
            <div className="mt-3">
              <Input
                name="tourName"
                placeholder="e.g. Japanese Cultural Adventure"
                value={formData.tourName}
                onChange={handleInputChange}
                required
                className="border-input"
              />
            </div>
          </div>

          <DestinationSelect
            value={formData.country}
            onChange={(country) => setFormData((prev) => ({ ...prev, country }))}
            required
          />

          {/* Location + Activity Type */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,12rem)_1fr] gap-4 items-start">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Location
              </label>
              <Input
                name="location"
                placeholder="Area or address"
                value={formData.location}
                onChange={handleInputChange}
                className="border-input"
              />
            </div>

            <div className="space-y-2 relative min-w-0">
              <label className="text-sm font-medium text-foreground">
                Activity Type
              </label>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActivityOpen(!activityOpen)}
                title={selectActivity || undefined}
                className="w-full justify-between gap-2 border-input h-10 min-w-0 overflow-hidden"
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {selectActivity || "Select One..."}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${activityOpen ? "rotate-180" : ""}`}
                />
              </Button>

              {activityOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-80 overflow-y-auto">
                  {activityTypes.map((activity) => (
                    <button
                      key={activity}
                      type="button"
                      onClick={() => {
                        setSelectActivity(activity)
                        setActivityOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors ${selectActivity === activity ? "bg-muted" : ""}`}
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={5}
              placeholder="Write your tour description here (150-200 words)."
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Peoples */}
          <div className="space-y-6">

            {/* Language Requirements */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Supported Languages
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



            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Notes for the agent
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Upload Images */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Upload Images <span className="text-red-500">*</span> {existingImagePreviews.length + imageFiles.length > 0 && `(${existingImagePreviews.length + imageFiles.length}/5)`}
            </label>
            {existingImagePreviews.length === 0 && imageFiles.length === 0 && (
              <p className="text-sm text-red-500">At least one image is required to create a tour.</p>
            )}

            {/* Existing images from source tour */}
            {existingImagePreviews.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {existingImagePreviews.map((imageItem, index) => (
                  <div
                    key={`existing-${index}`}
                    className="relative border-2 border-border rounded-lg overflow-hidden group aspect-video"
                  >
                    <Image
                      src={imageItem.url}
                      alt={`Tour image ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingImage(index)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                      aria-label="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded truncate max-w-[120px]">
                        From existing tour
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Image Previews Grid */}
            {imageFiles.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {imageFiles.map((imageItem, index) => (
                  <div
                    key={index}
                    className="relative border-2 border-border rounded-lg overflow-hidden group aspect-video"
                  >
                    <Image
                      src={imageItem.preview}
                      alt={`Tour image ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                      aria-label="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded truncate max-w-[120px]">
                        {imageItem.file.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Area - Show if less than 5 images */}
            {existingImagePreviews.length + imageFiles.length < 5 && (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer group ${existingImagePreviews.length + imageFiles.length === 0
                  ? 'border-red-300 bg-red-50/50 hover:border-red-400'
                  : 'border-border hover:border-[#D4AA25]'
                  }`}
              >
                <input
                  id="tour-images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
                <label
                  htmlFor="tour-images"
                  className="cursor-pointer block"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="p-3 bg-muted rounded-full group-hover:bg-[#D4AA25]/10 transition-colors">
                      <Upload className="w-6 h-6 text-muted-foreground group-hover:text-[#D4AA25] transition-colors" />
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                        Click to upload images or drag and drop <span className="text-red-500">*</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        PNG, JPG up to 1MB each (Max 5 images, at least 1 required)
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        ※ Dear operator, please note that if you want to add or replace images here, the old ones will be removed
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Pricing: per-person or group rate */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                Pricing & participant breakdown <span className="text-destructive">*</span>
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Choose how to price: <strong>Per person</strong> (separate rates for adults, children, infants) or <strong>Group rate</strong> (one base price for up to X people, then the same additional rate for each extra person, regardless of age). Agents still enter headcounts by age; for group rate, only the total headcount matters for pricing. Set a maximum group size so bookings cannot exceed it.
              </p>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pricingModel"
                  checked={formData.pricingModel === "per_person"}
                  onChange={() => setFormData((prev) => ({ ...prev, pricingModel: "per_person" }))}
                  className="border-input"
                />
                <span className="text-sm">Per person</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pricingModel"
                  checked={formData.pricingModel === "group_rate"}
                  onChange={() => setFormData((prev) => ({ ...prev, pricingModel: "group_rate" }))}
                  className="border-input"
                />
                <span className="text-sm">Group rate</span>
              </label>
            </div>

            {formData.pricingModel === "per_person" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="create-tour-price-adult">
                    Adults (12+) ¥
                  </label>
                  <Input
                    id="create-tour-price-adult"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 3000"
                    value={formData.pricePerAdult}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, pricePerAdult: e.target.value }))
                    }
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="create-tour-price-child">
                    Children (3–11) ¥
                  </label>
                  <Input
                    id="create-tour-price-child"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 1500"
                    value={formData.pricePerChild}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, pricePerChild: e.target.value }))
                    }
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="create-tour-price-infant">
                    Infants (0–2) ¥
                  </label>
                  <Input
                    id="create-tour-price-infant"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={formData.pricePerInfant}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, pricePerInfant: e.target.value }))
                    }
                    className="border-input"
                  />
                </div>
              </div>
            )}

            {formData.pricingModel === "group_rate" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm text-foreground" htmlFor="create-tour-base-rate">
                      Base rate (¥) for up to
                    </label>
                    <Input
                      id="create-tour-base-rate"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="e.g. 50000"
                      value={formData.baseRate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, baseRate: e.target.value }))
                      }
                      className="border-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-foreground" htmlFor="create-tour-base-group-size">
                      people
                    </label>
                    <Input
                      id="create-tour-base-group-size"
                      type="number"
                      min={1}
                      step={1}
                      placeholder="e.g. 5"
                      value={formData.baseGroupSize}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, baseGroupSize: e.target.value }))
                      }
                      className="border-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm text-foreground" htmlFor="create-tour-max-group-size">
                      Maximum group size (people)
                    </label>
                    <Input
                      id="create-tour-max-group-size"
                      type="number"
                      min={1}
                      step={1}
                      placeholder="e.g. 10"
                      value={formData.maxGroupSize}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, maxGroupSize: e.target.value }))
                      }
                      className="border-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      Total participants (adults + children + infants) cannot exceed this. Must be ≥ base group size.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-foreground" htmlFor="create-tour-additional-rate">
                      Additional per person beyond base (¥)
                    </label>
                    <Input
                      id="create-tour-additional-rate"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="e.g. 5000"
                      value={formData.additionalPerPersonRate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, additionalPerPersonRate: e.target.value }))
                      }
                      className="border-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      Same rate for each extra person (any age). Use 0 if there is no extra charge.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <TourGuideProfilePicker selectedGuideIds={guideIds} onChange={setGuideIds} />

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={
              submitting ||
              guideIds.length === 0 ||
              (existingImagePreviews.length === 0 && imageFiles.length === 0) ||
              (() => {
                if (formData.pricingModel === "group_rate") {
                  const baseRate = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
                  const baseGroupSize = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
                  const maxGroupSize = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
                  const add = formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);
                  if (baseRate == null || baseGroupSize == null || baseRate < 0 || baseGroupSize < 1) return true;
                  if (maxGroupSize == null || maxGroupSize < 1 || maxGroupSize < baseGroupSize) return true;
                  if (add == null || Number.isNaN(add) || add < 0) return true;
                  return false;
                }
                const a = formData.pricePerAdult.trim() === "" ? 0 : parseFloat(formData.pricePerAdult);
                const c = formData.pricePerChild.trim() === "" ? 0 : parseFloat(formData.pricePerChild);
                const i = formData.pricePerInfant.trim() === "" ? 0 : parseFloat(formData.pricePerInfant);
                return (
                  Number.isNaN(a) ||
                  Number.isNaN(c) ||
                  Number.isNaN(i) ||
                  a < 0 ||
                  c < 0 ||
                  i < 0
                );
              })()
            }
            className="w-full cursor-pointer bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Creating Tour…"
              : guideIds.length === 0
                ? "Link a guide profile to continue"
                : existingImagePreviews.length === 0 && imageFiles.length === 0
                  ? "Upload at least one image to continue"
                  : formData.pricingModel === "group_rate"
                    ? (() => {
                      const baseRate = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
                      const baseGroupSize = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
                      const maxGroupSize = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
                      const add = formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);
                      if (baseRate == null || baseGroupSize == null || baseRate < 0 || baseGroupSize < 1)
                        return "Enter base rate and base group size";
                      if (maxGroupSize == null || maxGroupSize < baseGroupSize)
                        return "Enter maximum group size (≥ base)";
                      if (add == null || Number.isNaN(add) || add < 0) return "Enter additional per person (¥)";
                      return "Create Tour";
                    })()
                    : (() => {
                      const a = formData.pricePerAdult.trim() === "" ? 0 : parseFloat(formData.pricePerAdult);
                      const c = formData.pricePerChild.trim() === "" ? 0 : parseFloat(formData.pricePerChild);
                      const i = formData.pricePerInfant.trim() === "" ? 0 : parseFloat(formData.pricePerInfant);
                      if (Number.isNaN(a) || Number.isNaN(c) || Number.isNaN(i) || a < 0 || c < 0 || i < 0)
                        return "Enter valid per-person prices";
                      return "Create Tour";
                    })()}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
