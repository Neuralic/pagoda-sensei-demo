"use client"

import { Tour, TourItinerary } from "@/app/types"
import { DestinationSelect } from "@/components/shared/destination-select"
import { TourGuideProfilePicker } from "@/components/tour_library/tour-guide-profile-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BUCKETS } from "@/lib/buckets"
import { extractTimeFromString, getSignedImageUrl } from "@/lib/common-function"
import { TOUR_ACTIVITY_TYPES } from "@/lib/tour-activity-types"
import { uploadViaApi } from "@/lib/upload-client"
import { ChevronDown, Search, Upload, X } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import countries from "world-countries"

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

interface UpdateTourModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tour: TourItinerary | Tour | null
  dataUpdate: number;
  setDataUpdate: (value: number) => void;
}

const activityTypes = [...TOUR_ACTIVITY_TYPES]

type TourRowPricing = {
  pricing_model?: string | null;
  price_per_adult?: number | null;
  price_per_child?: number | null;
  price_per_infant?: number | null;
  base_rate?: number | null;
  base_group_size?: number | null;
  max_group_size?: number | null;
  additional_per_person_rate?: number | null;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function UpdateTourModal({
  open,
  onOpenChange,
  tour,
  setDataUpdate,
  dataUpdate
}: UpdateTourModalProps) {
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
  })
  const [existingImages, setExistingImages] = useState<Array<{ path: string; url: string }>>([])
  const [newImageFiles, setNewImageFiles] = useState<Array<{ file: File; preview: string }>>([])
  const existingImagesRef = useRef<Array<{ path: string; url: string }>>([])
  const newImageFilesRef = useRef<Array<{ file: File; preview: string }>>([])

  const [submitting, setSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<string>("09:30");
  const [endTime, setEndTime] = useState<string>("11:00")
  const [activityOpen, setActivityOpen] = useState(false)
  const [selectActivity, setSelectActivity] = useState("")
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const allLanguages = getLanguages();
  const [guideIds, setGuideIds] = useState<string[]>([]);

  const isGroupRateTour = formData.pricingModel === "group_rate";

  // Keep refs in sync with state
  useEffect(() => {
    existingImagesRef.current = existingImages;
  }, [existingImages]);

  useEffect(() => {
    newImageFilesRef.current = newImageFiles;
  }, [newImageFiles]);

  // Populate form with existing data
  useEffect(() => {
    const loadTourData = async () => {
      if (tour) {
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

        const row = tour as Tour & TourRowPricing;
        const pricingModel: "per_person" | "group_rate" =
          row.pricing_model === "group_rate" ? "group_rate" : "per_person";
        const pa = numOrNull(row.pricePerAdult ?? row.price_per_adult);
        const pc = numOrNull(row.pricePerChild ?? row.price_per_child);
        const pi = numOrNull(row.pricePerInfant ?? row.price_per_infant);
        const br = numOrNull(row.base_rate);
        const bgs = numOrNull(row.base_group_size);
        const mgs = numOrNull(row.max_group_size);
        const apr = numOrNull(row.additional_per_person_rate);
        const hasPerPerson =
          pricingModel === "per_person" &&
          (pa != null || pc != null || pi != null);
        setFormData({
          tourName: tour.title || tour.name || "",
          country: tour.country || "",
          location: tour.location || "",
          description: tour.description || "",
          notes: tour.notes || "",
          languages: languagesArray,
          pricingModel,
          pricePerAdult: hasPerPerson && pa != null ? String(pa) : "",
          pricePerChild: hasPerPerson && pc != null ? String(pc) : "",
          pricePerInfant: hasPerPerson && pi != null ? String(pi) : "",
          baseRate: pricingModel === "group_rate" && br != null ? String(br) : "",
          baseGroupSize: pricingModel === "group_rate" && bgs != null ? String(bgs) : "",
          maxGroupSize: pricingModel === "group_rate" && mgs != null ? String(mgs) : "",
          additionalPerPersonRate: pricingModel === "group_rate" && apr != null ? String(apr) : "",
        })
        setStartTime(extractTimeFromString(tour.start_time))
        setEndTime(extractTimeFromString(tour.end_time))
        setSelectActivity(tour.activity_type || "")

        // Load existing images - handle both JSON string array and single string
        if (tour.image) {
          let imagePaths: string[] = []

          try {
            // Try to parse as JSON (array of paths)
            const parsed = JSON.parse(tour.image)
            if (Array.isArray(parsed)) {
              imagePaths = parsed
            } else if (typeof parsed === 'string') {
              imagePaths = [parsed]
            }
          } catch {
            // If not JSON, treat as single string
            imagePaths = [tour.image]
          }

          // Get signed URLs for all existing images
          const imagePromises = imagePaths
            .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
            .map(async (path) => {
              try {
                const url = await getSignedImageUrl(path)
                return { path, url }
              } catch (error) {
                console.error(`Failed to load image: ${path}`, error)
                // Return a placeholder if image fails to load
                return { path, url: "/assets/images/profile/placeholder.svg" }
              }
            })

          const loadedImages = await Promise.all(imagePromises)
          setExistingImages(loadedImages)
        } else {
          setExistingImages([])
        }

        // Reset new images when tour changes
        setNewImageFiles([])

        // Prefill linked guide profiles (from list enrichment or assignments API)
        const tourOwnerId =
          String(
            (tour as Tour & { user_id?: string; agent?: { id?: string } }).user_id ||
            (tour as Tour & { agent?: { id?: string } }).agent?.id ||
            ""
          ).trim() || null;
        const existingAssigned = (tour as Tour & { assignedGuides?: Array<{ id: string }> }).assignedGuides;
        if (Array.isArray(existingAssigned) && existingAssigned.length > 0) {
          setGuideIds(existingAssigned.map((g) => String(g.id)));
        } else if (tour.id) {
          try {
            const res = await fetch(
              `/api/operator/guide-tour-assignments?tourId=${encodeURIComponent(String(tour.id))}`
            );
            const data = await res.json().catch(() => null);
            if (data?.ok && Array.isArray(data.assignedGuideIds) && data.assignedGuideIds.length > 0) {
              setGuideIds(data.assignedGuideIds.map((id: string) => String(id)));
            } else {
              const qs = tourOwnerId
                ? `?operatorId=${encodeURIComponent(tourOwnerId)}`
                : "";
              const optRes = await fetch(`/api/tour/guide-options${qs}`);
              const optData = await optRes.json().catch(() => null);
              if (optData?.ok && optData.selfGuideId) {
                setGuideIds([String(optData.selfGuideId)]);
              } else {
                setGuideIds([]);
              }
            }
          } catch {
            setGuideIds([]);
          }
        } else {
          setGuideIds([]);
        }
      }
    }

    loadTourData()
  }, [tour])


  // Close language dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setLanguageOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleLanguageToggle = (language: { code: string; name: string }) => {
    setFormData((prev) => {
      const currentLanguages = prev.languages || [];
      if (currentLanguages.includes(language.name)) {
        // Remove if already selected
        return { ...prev, languages: currentLanguages.filter((lang) => lang !== language.name) };
      } else {
        // Add if not selected
        const newLanguages = [...currentLanguages, language.name];
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

    // Process all files with Promise.all to maintain order
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result && typeof result === 'string') {
            resolve({
              file,
              preview: result,
            })
          } else {
            reject(new Error(`Failed to read file: ${file.name}`));
          }
        }
        reader.onerror = () => {
          reject(new Error(`Error reading file: ${file.name}`));
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(processFiles).then((newFiles) => {
      // Use refs to get current state synchronously (avoids race conditions)
      const currentExisting = existingImagesRef.current;
      const currentNew = newImageFilesRef.current;

      // Calculate total images after adding new ones
      const currentTotal = currentExisting.length + currentNew.length
      const totalAfterAdd = currentTotal + newFiles.length

      // Calculate how many images to remove to maintain max 5 (FIFO - remove from front)
      const toRemove = Math.max(0, totalAfterAdd - 5)

      // Remove oldest existing images first (FIFO - first in, first out)
      let updatedExisting = currentExisting
      let updatedNew = [...currentNew, ...newFiles]

      // If we need to remove more than existing images, also remove from new images
      if (toRemove > currentExisting.length) {
        const remainingToRemove = toRemove - currentExisting.length
        updatedExisting = []
        updatedNew = updatedNew.slice(remainingToRemove)
      } else {
        updatedExisting = currentExisting.slice(toRemove)
      }

      // Ensure we don't exceed 5 total
      const finalTotal = updatedExisting.length + updatedNew.length
      if (finalTotal > 5) {
        updatedNew = updatedNew.slice(0, 5 - updatedExisting.length)
      }

      setExistingImages(updatedExisting)
      setNewImageFiles(updatedNew)
      // Update refs immediately to keep them in sync
      existingImagesRef.current = updatedExisting
      newImageFilesRef.current = updatedNew
    })
      .catch((error) => {
        const errorMsg = error instanceof Error ? error.message : "Failed to process image files";
        toast.error(errorMsg);
      })

    // Reset input
    if (e.target) {
      e.target.value = ""
    }
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
        toast.error("Please drop only image files")
        return
      }
      if (file.size > 1 * 1024 * 1024) {
        toast.error("Each image should be less than 1MB")
        return
      }
    }

    // Process all files with Promise.all to maintain order
    const processFiles = files.map((file) => {
      return new Promise<{ file: File; preview: string }>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result && typeof result === 'string') {
            resolve({
              file,
              preview: result,
            })
          } else {
            reject(new Error(`Failed to read file: ${file.name}`));
          }
        }
        reader.onerror = () => {
          reject(new Error(`Error reading file: ${file.name}`));
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(processFiles).then((newFiles) => {
      // Use refs to get current state synchronously (avoids race conditions)
      const currentExisting = existingImagesRef.current;
      const currentNew = newImageFilesRef.current;

      // Calculate total images after adding new ones
      const currentTotal = currentExisting.length + currentNew.length
      const totalAfterAdd = currentTotal + newFiles.length

      // Calculate how many images to remove to maintain max 5 (FIFO - remove from front)
      const toRemove = Math.max(0, totalAfterAdd - 5)

      // Remove oldest existing images first (FIFO - first in, first out)
      let updatedExisting = currentExisting
      let updatedNew = [...currentNew, ...newFiles]

      // If we need to remove more than existing images, also remove from new images
      if (toRemove > currentExisting.length) {
        const remainingToRemove = toRemove - currentExisting.length
        updatedExisting = []
        updatedNew = updatedNew.slice(remainingToRemove)
      } else {
        updatedExisting = currentExisting.slice(toRemove)
      }

      // Ensure we don't exceed 5 total
      const finalTotal = updatedExisting.length + updatedNew.length
      if (finalTotal > 5) {
        updatedNew = updatedNew.slice(0, 5 - updatedExisting.length)
      }

      setExistingImages(updatedExisting)
      setNewImageFiles(updatedNew)
      // Update refs immediately to keep them in sync
      existingImagesRef.current = updatedExisting
      newImageFilesRef.current = updatedNew
    })
      .catch((error) => {
        const errorMsg = error instanceof Error ? error.message : "Failed to process image files";
        toast.error(errorMsg);
      })
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tour) return toast.error("No tour selected")
    if (!formData.tourName || !formData.country || !formData.location) {
      toast.error("Please fill all required fields.")
      return
    }

    let pricePerAdultNum: number | null = null;
    let pricePerChildNum: number | null = null;
    let pricePerInfantNum: number | null = null;
    let baseRateNum: number | null = null;
    let baseGroupSizeNum: number | null = null;
    let maxGroupSizeNum: number | null = null;
    let additionalPerPersonRateNum: number | null = null;

    if (isGroupRateTour) {
      baseRateNum = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
      baseGroupSizeNum = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
      maxGroupSizeNum = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
      additionalPerPersonRateNum =
        formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);

      if (baseRateNum == null || baseGroupSizeNum == null || baseRateNum < 0 || baseGroupSizeNum < 1) {
        toast.error("Please enter valid group-rate pricing.");
        return;
      }
      if (Number.isNaN(baseRateNum) || Number.isNaN(baseGroupSizeNum)) {
        toast.error("Please enter valid group-rate pricing.");
        return;
      }
      if (maxGroupSizeNum != null && (Number.isNaN(maxGroupSizeNum) || maxGroupSizeNum < baseGroupSizeNum)) {
        toast.error("Max group size must be at least base group size.");
        return;
      }
      if (
        additionalPerPersonRateNum == null ||
        additionalPerPersonRateNum < 0 ||
        Number.isNaN(additionalPerPersonRateNum)
      ) {
        toast.error("Please enter a valid additional-per-person rate (0 or more).");
        return;
      }
    } else {
      pricePerAdultNum = formData.pricePerAdult.trim() === "" ? null : parseFloat(formData.pricePerAdult);
      pricePerChildNum = formData.pricePerChild.trim() === "" ? null : parseFloat(formData.pricePerChild);
      pricePerInfantNum = formData.pricePerInfant.trim() === "" ? null : parseFloat(formData.pricePerInfant);
      const a = pricePerAdultNum ?? 0;
      const c = pricePerChildNum ?? 0;
      const i = pricePerInfantNum ?? 0;
      if (a < 0 || c < 0 || i < 0 || Number.isNaN(a) || Number.isNaN(c) || Number.isNaN(i)) {
        toast.error("Please enter valid per-person prices (0 or more for each).");
        return;
      }
    }

    setSubmitting(true)
    try {
      // Start with existing image paths (excluding ones that were removed)
      let finalImagePaths = existingImages
        .map(img => img?.path)
        .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)

      // Upload new images if any
      if (newImageFiles.length > 0) {
        try {
          const uploadResults = await uploadViaApi(
            newImageFiles.map((item) => item.file),
            {
              bucket: BUCKETS.tours,
              folder: "images",
            }
          )

          // Validate upload results
          if (!Array.isArray(uploadResults)) {
            throw new Error("Invalid upload response format");
          }

          // Extract valid paths (non-empty strings only)
          const newPaths = uploadResults
            .map((res) => res?.path)
            .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)

          if (newPaths.length === 0 && newImageFiles.length > 0) {
            throw new Error("Failed to upload new images. Please try again.");
          }

          // Check if some uploads failed
          if (newPaths.length < newImageFiles.length) {
            toast.error(`Warning: ${newImageFiles.length - newPaths.length} image(s) failed to upload. Continuing with ${newPaths.length} new image(s).`);
          }

          finalImagePaths = [...finalImagePaths, ...newPaths]
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : "Failed to upload images";
          toast.error(errorMsg);
          throw new Error(`Image upload failed: ${errorMsg}`);
        }
      }

      // Ensure we don't exceed 5 images and validate paths
      finalImagePaths = finalImagePaths
        .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        .slice(0, 5)

      const toTimestamp = (time: string) => `${time}:00`

      // Convert languages array to JSON string for storage
      const languagesString = formData.languages.length > 0
        ? JSON.stringify(formData.languages)
        : null;

      if (guideIds.length === 0) {
        toast.error("Link at least one published guide profile to this tour.")
        setSubmitting(false)
        return
      }

      const payload: Record<string, unknown> = {
        name: formData.tourName,
        country: formData.country,
        location: formData.location,
        description: formData.description,
        notes: formData.notes,
        languages: languagesString,
        activityType: selectActivity,
        startTime: toTimestamp(startTime),
        endTime: toTimestamp(endTime),
        imagePaths: finalImagePaths.length > 0 ? finalImagePaths : null,
        guideIds,
      };

      if (isGroupRateTour) {
        payload.pricingModel = "group_rate";
        payload.baseRate = baseRateNum ?? 0;
        payload.baseGroupSize = baseGroupSizeNum ?? 1;
        payload.maxGroupSize = maxGroupSizeNum ?? baseGroupSizeNum ?? 1;
        payload.additionalPerPersonRate = additionalPerPersonRateNum ?? 0;
      } else {
        payload.pricingModel = "per_person";
        payload.pricePerAdult = pricePerAdultNum ?? 0;
        payload.pricePerChild = pricePerChildNum ?? 0;
        payload.pricePerInfant = pricePerInfantNum ?? 0;
      }

      const resp = await fetch(`/api/tour/${tour.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data?.ok) throw new Error(data?.error || "Failed to update tour")

      toast.success("Tour updated successfully!")

      setDataUpdate(dataUpdate + 1); // Trigger data refresh in parent
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-full px-6 sm:px-8 lg:px-14 rounded-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader className="text-center pt-2">
          <h1 className="text-3xl font-bold">Update Tour</h1>
          <p className="text-sm text-muted-foreground -mt-2">
            Modify details and update your tour
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Tour Name */}
          <div>
            <label className="text-sm font-medium">Tour Name</label>
            <Input
              name="tourName"
              value={formData.tourName}
              onChange={handleInputChange}
              required
            />
          </div>

          <DestinationSelect
            value={formData.country}
            onChange={(country) => setFormData((prev) => ({ ...prev, country }))}
            required
          />

          {/* Activity Type + Location */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,12rem)] gap-4 items-start">
            <div className="space-y-2 relative min-w-0">
              <label className="text-sm font-medium">Activity Type</label>
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
                      className={`w-full text-left px-4 py-2 hover:bg-muted ${selectActivity === activity ? "bg-muted" : ""
                        }`}
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Location</label>
              <Input
                name="location"
                placeholder="Area or address"
                value={formData.location}
                onChange={handleInputChange}
              />
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Start</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Finish</label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              className="w-full border border-input rounded-md px-3 py-2"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full border border-input rounded-md px-3 py-2"
            />
          </div>

          {/* Languages */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Supported Languages</label>

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

          {/* Images */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Tour Images {existingImages.length + newImageFiles.length > 0 && `(${existingImages.length + newImageFiles.length}/5)`}
            </label>

            {/* Existing Images Grid */}
            {existingImages.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {existingImages.map((imageItem, index) => (
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
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200" />
                    <div className="absolute top-1 right-1">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                        Existing
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New Images Grid */}
            {newImageFiles.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {newImageFiles.map((imageItem, index) => (
                  <div
                    key={`new-${index}`}
                    className="relative border-2 border-border rounded-lg overflow-hidden group aspect-video"
                  >
                    <Image
                      src={imageItem.preview}
                      alt={`New image ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-200" />
                    <div className="absolute top-1 right-1">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                        New
                      </span>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded truncate max-w-[120px]">
                        {imageItem.file.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Area - Always show, even when at 5 images */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-[#D4AA25] transition-colors cursor-pointer group"
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
                      Click to upload images or drag and drop
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      PNG, JPG up to 1MB each (Max 5 images total)
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      ※ Dear operator, please note that if you want to add or replace images here, the old ones will be removed
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                Pricing & participant breakdown
                <span className="text-destructive"> *</span>
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Choose a pricing model and update the values.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="pricingModel"
                    checked={formData.pricingModel === "per_person"}
                    onChange={() => setFormData((prev) => ({ ...prev, pricingModel: "per_person" }))}
                    className="text-[#D4AA25]"
                  />
                  Per person
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="pricingModel"
                    checked={formData.pricingModel === "group_rate"}
                    onChange={() => setFormData((prev) => ({ ...prev, pricingModel: "group_rate" }))}
                    className="text-[#D4AA25]"
                  />
                  Group rate
                </label>
              </div>
            </div>
            {formData.pricingModel === "per_person" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-price-adult">Adults (12+) ¥</label>
                  <Input
                    id="edit-tour-price-adult"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 10000"
                    value={formData.pricePerAdult}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pricePerAdult: e.target.value }))}
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-price-child">Children (3–11) ¥</label>
                  <Input
                    id="edit-tour-price-child"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 5000"
                    value={formData.pricePerChild}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pricePerChild: e.target.value }))}
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-price-infant">Infants (0–2) ¥</label>
                  <Input
                    id="edit-tour-price-infant"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={formData.pricePerInfant}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pricePerInfant: e.target.value }))}
                    className="border-input"
                  />
                </div>
              </div>
            )}

            {formData.pricingModel === "group_rate" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-base-rate">Base rate (¥)</label>
                  <Input
                    id="edit-tour-base-rate"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.baseRate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, baseRate: e.target.value }))}
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-base-group-size">Base group size</label>
                  <Input
                    id="edit-tour-base-group-size"
                    type="number"
                    min={1}
                    step={1}
                    value={formData.baseGroupSize}
                    onChange={(e) => setFormData((prev) => ({ ...prev, baseGroupSize: e.target.value }))}
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-max-group-size">Max group size</label>
                  <Input
                    id="edit-tour-max-group-size"
                    type="number"
                    min={1}
                    step={1}
                    value={formData.maxGroupSize}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxGroupSize: e.target.value }))}
                    className="border-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-foreground" htmlFor="edit-tour-additional-rate">Additional per person (¥)</label>
                  <Input
                    id="edit-tour-additional-rate"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.additionalPerPersonRate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, additionalPerPersonRate: e.target.value }))}
                    className="border-input"
                  />
                </div>
              </div>
            )}
          </div>

          <TourGuideProfilePicker
            selectedGuideIds={guideIds}
            onChange={setGuideIds}
            operatorId={
              String(
                (tour as Tour & { user_id?: string; agent?: { id?: string } } | null)?.user_id ||
                (tour as Tour & { agent?: { id?: string } } | null)?.agent?.id ||
                ""
              ).trim() || null
            }
          />

          <Button
            type="submit"
            disabled={
              submitting ||
              guideIds.length === 0 ||
              (formData.pricingModel === "group_rate" &&
                (() => {
                  const br = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
                  const bgs = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
                  const mgs = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
                  const apr = formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);
                  if (br == null || bgs == null || br < 0 || bgs < 1 || Number.isNaN(br) || Number.isNaN(bgs)) return true;
                  if (mgs != null && (Number.isNaN(mgs) || mgs < bgs)) return true;
                  if (apr == null || apr < 0 || Number.isNaN(apr)) return true;
                  return false;
                })()) ||
              (formData.pricingModel === "per_person" &&
                (() => {
                  const a = formData.pricePerAdult.trim() === "" ? 0 : parseFloat(formData.pricePerAdult);
                  const c = formData.pricePerChild.trim() === "" ? 0 : parseFloat(formData.pricePerChild);
                  const i = formData.pricePerInfant.trim() === "" ? 0 : parseFloat(formData.pricePerInfant);
                  return Number.isNaN(a) || Number.isNaN(c) || Number.isNaN(i) || a < 0 || c < 0 || i < 0;
                })())
            }
            className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
          >
            {submitting
              ? "Updating…"
              : guideIds.length === 0
                ? "Link a guide profile to continue"
                : formData.pricingModel === "group_rate"
                  ? (() => {
                    const br = formData.baseRate.trim() === "" ? null : parseFloat(formData.baseRate);
                    const bgs = formData.baseGroupSize.trim() === "" ? null : parseInt(formData.baseGroupSize, 10);
                    const mgs = formData.maxGroupSize.trim() === "" ? null : parseInt(formData.maxGroupSize, 10);
                    const apr = formData.additionalPerPersonRate.trim() === "" ? null : parseFloat(formData.additionalPerPersonRate);
                    if (br == null || bgs == null || br < 0 || bgs < 1 || Number.isNaN(br) || Number.isNaN(bgs)) return "Enter valid group-rate pricing";
                    if (mgs != null && (Number.isNaN(mgs) || mgs < bgs)) return "Max group size must be >= base group size";
                    if (apr == null || apr < 0 || Number.isNaN(apr)) return "Enter valid additional per-person rate";
                    return "Update Tour";
                  })()
                  : (() => {
                    const a = formData.pricePerAdult.trim() === "" ? 0 : parseFloat(formData.pricePerAdult);
                    const c = formData.pricePerChild.trim() === "" ? 0 : parseFloat(formData.pricePerChild);
                    const i = formData.pricePerInfant.trim() === "" ? 0 : parseFloat(formData.pricePerInfant);
                    if (Number.isNaN(a) || Number.isNaN(c) || Number.isNaN(i) || a < 0 || c < 0 || i < 0) return "Enter valid per-person prices";
                    return "Update Tour";
                  })()}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
