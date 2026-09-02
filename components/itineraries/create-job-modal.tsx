"use client";

import { useRef, useState } from "react";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TOUR_ACTIVITY_TYPES } from "@/lib/tour-activity-types";
import { ChevronDown, Search, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { uploadViaApi } from "@/lib/upload-client";
import { BUCKETS } from "@/lib/buckets";
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

type CreateJobModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityTitle?: string;
  itineraryId?: string;
  activityDateISO?: string | null;
  onSave?: (payload: {
    // Activity fields
    name: string;
    activityType: string;
    startTime: string;
    endTime: string;
    location: string;
    description: string;
    images: File[];
    // Job fields
    createJob: boolean;
    supplierPrice: number | null;
    languages: string[];
    groupSize: number;
    adults: number;
    children: number;
    infants: number;
    notes: string;
    advisorComments?: string;
  }) => void;
};

type Country = {
  name: string;
  flag: string;
  cca2: string;
  flags?: string[];
};

export function CreateJobModal({
  open,
  onOpenChange,
  activityTitle,
  itineraryId,
  activityDateISO,
  onSave,
}: CreateJobModalProps) {
  // Activity fields
  const [name, setName] = useState<string>("");
  const [activityType, setActivityType] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:30");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]); // Display URLs (signed or original)
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]); // Original paths for saving
  const [createJob, setCreateJob] = useState<boolean>(true);
  const [adults, setAdults] = useState<number>(1);
  const [children, setChildren] = useState<number>(0);
  const [infants, setInfants] = useState<number>(0);

  // Job fields
  const [supplierPrice, setSupplierPrice] = useState<string>("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [groupSize, setGroupSize] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");
  const [advisorComments, setAdvisorComments] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const isProcessingDropRef = useRef(false);
  
  // Refs to track current state for image handling
  const imagesRef = useRef<File[]>([]);
  const existingImagePathsRef = useRef<string[]>([]);
  const existingImagesRef = useRef<string[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  
  useEffect(() => {
    existingImagePathsRef.current = existingImagePaths;
  }, [existingImagePaths]);
  
  useEffect(() => {
    existingImagesRef.current = existingImages;
  }, [existingImages]);

  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  // const [selectedLanguages, setSelectedLanguages] = useState<{ code: string; name: string }[]>([]);
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);


  const handleLanguageToggle = (language: { code: string; name: string }) => {
    setLanguages((prev) => {
      if (prev.includes(language.code)) {
        // remove if already selected
        return prev.filter((code) => code !== language.code);
      } else {
        setLanguageOpen(false);
        // add if not selected
        const newLanguages = [...prev, language.code];
        return newLanguages;
      }
    });
  };

  const allLanguages = getLanguages();

  const filteredLanguages = allLanguages.filter((lang) =>
    lang.name.toLowerCase().includes(languageSearch.toLowerCase())
  );

  const selectedLanguages = allLanguages.filter((lang) =>
    languages.includes(lang.code)
  );

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) return;
    
    // Reset form for create
    setName("");
    setActivityType("");
    setStartTime("09:30");
    setEndTime("11:00");
    setLocation("");
    setDescription("");
    setImages([]);
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviews([]);
    setExistingImages([]);
    setExistingImagePaths([]);
    setCreateJob(true);
    setSupplierPrice("");
    setLanguages([]);
    setGroupSize(1);
    setNotes("");
    setIsDragging(false);
    setAdults(1);
    setChildren(0);
    setInfants(0);
  }, [open]);

  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const dec = () => setGroupSize((g) => Math.max(1, g - 1));
  const inc = () => setGroupSize((g) => g + 1);

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

  const handlePickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) {
      e.target.value = "";
      return;
    }
    
    // Use refs to get current state values synchronously
    const currentImages = imagesRef.current;
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
    setImagePreviews((prevPreviews) => [...prevPreviews, ...result.newPreviews]);
    setImages((prev) => [...prev, ...result.filesToAdd]);
    
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
    const currentImages = imagesRef.current;
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
    setImagePreviews((prevPreviews) => [...prevPreviews, ...result.newPreviews]);
    setImages((prev) => [...prev, ...result.filesToAdd]);
    
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
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index]);
    }
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const decAdults = () => setAdults((a) => Math.max(1, a - 1));
  const incAdults = () => setAdults((a) => a + 1);

  const decChildren = () => setChildren((c) => Math.max(0, c - 1));
  const incChildren = () => setChildren((c) => c + 1);
  const decInfants = () => setInfants((i) => Math.max(0, i - 1));
  const incInfants = () => setInfants((i) => i + 1);
  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) Upload new images if any
      let newImagePaths: string[] = [];
      if (images.length > 0) {
        const results = await uploadViaApi(images, {
          bucket: BUCKETS.jobs,
          folder: "images",
        });
        newImagePaths = results.map((r) => r.path);
      }
      
      // Combine existing image paths (that weren't removed) with newly uploaded ones
      const allImagePaths = [...existingImagePaths, ...newImagePaths];

      // 2) Post to API if itineraryId provided; otherwise just bubble up via onSave
      const payload = {
        // Activity
        name: name.trim(),
        activityType,
        startTime,
        endTime,
        location: location.trim(),
        description: description.trim(),
        images,
        // Job
        createJob,
        supplierPrice: supplierPrice ? Number(supplierPrice) : null,
        languages: languages,
        groupSize: adults + children + infants,
        adults,
        children,
        infants,
        notes: notes.trim(),
        advisorComments: advisorComments.trim(),
      };
      if (itineraryId) {
        // Create path
        const resp = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itineraryId,
            activityDateISO: activityDateISO ?? null,
            name: payload.name,
            activityType: payload.activityType,
            startTime: payload.startTime,
            endTime: payload.endTime,
            location: payload.location,
            description: payload.description || null,
            imagePaths: allImagePaths.length > 0 ? allImagePaths : [],
            supplierPrice: payload.supplierPrice,
            languages: payload.languages || null,
            groupSize: payload.groupSize || null,
            adults: payload.adults ?? null,
            children: payload.children ?? null,
            infants: payload.infants ?? null,
            notes: payload.notes || null,
            advisorComments: payload.advisorComments || null,
            createJob: payload.createJob,
          }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to create job");
        }
        toast.success("Created Successfully");
      }

      onSave?.(payload);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-full px-6 sm:px-8 lg:px-12 rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="text-center space-y-1">
          <h2 className="text-2xl md:text-3xl font-bold text-center">
            Create Your Clients Itinerary
          </h2>
          {activityTitle ? (
            <p className="text-sm text-muted-foreground">{activityTitle}</p>
          ) : null}
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Activity Type
            </label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="border-input">
                <SelectValue placeholder="Select One..." />
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Images
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-[#D4AA25] bg-[#FFF7E6]"
                  : "border-border hover:border-[#D4AA25]"
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                id="job-activity-images"
                type="file"
                accept="image/*"
                onChange={handlePickImages}
                className="hidden"
              />
              <label
                htmlFor="job-activity-images"
                className="cursor-pointer block"
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload an image or drag and drop the image
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF up to 1MB (max 5 images)
                </p>
                {existingImagePaths.length + images.length >= 5 && (
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
                      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted">
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
            {imagePreviews.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">New Images:</p>
                <div className="grid grid-cols-2 gap-3">
                  {imagePreviews.map((preview, index) => (
                    <div key={`new-${index}`} className="relative group">
                      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted">
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
                      {images[index] && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {images[index].name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Job fields (conditional) */}
          {createJob && (
            <div className="space-y-6">
              {/* Line pricing — for custom / partner-quoted services */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Supplier / partner price
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="e.g. 45000"
                  value={supplierPrice}
                  onChange={(e) => setSupplierPrice(e.target.value)}
                  className="border-input"
                />
                <p className="text-xs text-muted-foreground">
                  Net cost you agreed with a local partner. Itinerary markup is
                  applied on top.
                </p>
              </div>

              {/* ---------------- LANGUAGE REQUIREMENTS SECTION ---------------- */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Language Requirements
                </label>

                {/* Selected Language Badges */}
                {selectedLanguages.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
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
                    onClick={() => {
                      setLanguageOpen(!languageOpen);
                      setLanguageSearch("");
                    }}
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
                <label className="text-sm font-medium text-foreground">
                  Group Size
                </label>

                {/* Adults */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Adults(12+)</span>
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
                  Share instructions with the guide or operator for this activity.
                </p>
                <textarea
                  value={advisorComments}
                  onChange={(e) => setAdvisorComments(e.target.value)}
                  placeholder="Please enter your comments for the guide or the operator here"
                  className="w-full min-h-24 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-3 border-t mt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
