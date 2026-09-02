"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
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
import { Calendar, X } from "lucide-react";
import toast from "react-hot-toast";
import { CountrySelect } from "@/components/shared/country-select";
import { CardItinerary } from "@/app/types";
import { parseSafariDate } from "@/lib/utils";
import {
  emptyIntakeData,
  intakeDataForApi,
  normalizeBuildMode,
  parseIntakeData,
  validateIntakeForPagodaBuild,
  type ItineraryBuildMode,
  type ItineraryIntakeData,
} from "@/lib/itinerary-intake";
import { ItineraryIntakeFields } from "@/components/itineraries/itinerary-intake-fields";
import {
  INSTANT_AIRPORT_TRANSFERS_TYPE,
  isAirportTransfersCatalogType,
} from "@/lib/tour-activity-types";

function isProfileRequiredError(data: { code?: string; error?: string } | null): boolean {
  if (!data) return false;
  if (data.code === "PROFILE_REQUIRED") return true;
  const msg = (data.error || "").toLowerCase();
  return msg.includes("profile not found") || msg.includes("complete your profile");
}

function settingsHrefForPath(pathname: string | null): string {
  if (pathname?.startsWith("/agency")) return "/settings";
  if (pathname?.startsWith("/agent")) return "/agent/settings";
  return "/settings";
}

interface CreateItineraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItineraryCreated?: (itinerary: CardItinerary) => void;
  itinerary?: CardItinerary | null; // For edit mode
}

// Helper function to calculate duration (Safari-compatible)
const calculateDuration = (startDate: string, endDate: string) => {
  const start = parseSafariDate(startDate);
  const end = parseSafariDate(endDate);
  if (!start || !end) return "1 Days";
  const diffDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  return `${diffDays} Days`;
};

export function CreateItineraryModal({
  open,
  onOpenChange,
  onItineraryCreated,
  itinerary,
}: CreateItineraryModalProps) {
  const isEditMode = !!itinerary;
  const router = useRouter();
  const pathname = usePathname();
  const [formData, setFormData] = useState({
    itineraryName: "",
    country: "Japan",
    startDate: "",
    endDate: "",
    arrivalTransfer: false,
    arrivalFlightNumber: "",
    arrivalTime: "",
    departureTransfer: false,
    departureFlightNumber: "",
    departureTime: "",
  });
  const [buildMode, setBuildMode] = useState<ItineraryBuildMode>("pagoda_build");
  const [intake, setIntake] = useState<ItineraryIntakeData>(emptyIntakeData);
  const [submitting, setSubmitting] = useState(false);
  const [profileRequiredOpen, setProfileRequiredOpen] = useState(false);

  // Load itinerary data when in edit mode
  useEffect(() => {
    if (isEditMode && itinerary && open) {
      // Fetch full itinerary data including airport transfer fields
      const loadItineraryData = async () => {
        try {
          const resp = await fetch(`/api/itineraries/${itinerary.id}`, {
            cache: "no-store",
          });
          const data = await resp.json().catch(() => null);
          
          if (resp.ok && data?.ok && data?.itinerary) {
            const it = data.itinerary;
            setFormData({
              itineraryName: it.name || itinerary.title || "",
              country: it.location || itinerary.location || "",
              startDate: it.start_date || itinerary.startDate || "",
              endDate: it.end_date || itinerary.endDate || "",
              arrivalTransfer: it.arrival_transfer || false,
              arrivalFlightNumber: it.arrival_flight_number || "",
              arrivalTime: it.arrival_flight_time || "",
              departureTransfer: it.departure_transfer || false,
              departureFlightNumber: it.departure_flight_number || "",
              departureTime: it.departure_flight_time || "",
            });
            setBuildMode(normalizeBuildMode(it.build_mode));
            setIntake(parseIntakeData(it.intake_data));
          } else {
            // Fallback to basic itinerary data if API fails
            setFormData({
              itineraryName: itinerary.title || "",
              country: itinerary.location || "",
              startDate: itinerary.startDate || "",
              endDate: itinerary.endDate || "",
              arrivalTransfer: false,
              arrivalFlightNumber: "",
              arrivalTime: "",
              departureTransfer: false,
              departureFlightNumber: "",
              departureTime: "",
            });
          }
        } catch (error) {
          console.error("Error loading itinerary data:", error);
          // Fallback to basic data
          setFormData({
            itineraryName: itinerary.title || "",
            country: itinerary.location || "",
            startDate: itinerary.startDate || "",
            endDate: itinerary.endDate || "",
            arrivalTransfer: false,
            arrivalFlightNumber: "",
            arrivalTime: "",
            departureTransfer: false,
            departureFlightNumber: "",
            departureTime: "",
          });
        }
      };

      loadItineraryData();
    } else if (!isEditMode && open) {
      // Reset form when opening in create mode
      setFormData({
        itineraryName: "",
        country: "Japan",
        startDate: "",
        endDate: "",
        arrivalTransfer: false,
        arrivalFlightNumber: "",
        arrivalTime: "",
        departureTransfer: false,
        departureFlightNumber: "",
        departureTime: "",
      });
      setBuildMode("pagoda_build");
      setIntake(emptyIntakeData());
    }
  }, [isEditMode, itinerary, open]);

  // New itineraries should identify the signed-in advisor automatically.
  useEffect(() => {
    if (!open || isEditMode) return;

    let cancelled = false;
    const loadAdvisorName = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || cancelled) return;

        const advisorName = [data.user?.name, data.user?.lastName]
          .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
          .map((part) => part.trim())
          .join(" ");
        if (!advisorName) return;

        setIntake((prev) => ({
          ...prev,
          advisorName: prev.advisorName?.trim() || advisorName,
        }));
      } catch {
        // The form remains editable if account details cannot be loaded.
      }
    };

    void loadAdvisorName();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (
      !formData.itineraryName ||
      !formData.country ||
      !formData.startDate ||
      !formData.endDate
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    const startDate = parseSafariDate(formData.startDate);
    const endDate = parseSafariDate(formData.endDate);
    if (!startDate || !endDate) {
      toast.error("Please enter valid dates.");
      return;
    }
    if (endDate < startDate) {
      toast.error("Departure date cannot be before Arrival date.");
      return;
    }

    // Validate transfer details if requested
    if (formData.arrivalTransfer) {
      if (!formData.arrivalFlightNumber.trim() || !formData.arrivalTime) {
        toast.error("Please provide arrival flight number and time.");
        return;
      }
    }
    if (formData.departureTransfer) {
      if (!formData.departureFlightNumber.trim() || !formData.departureTime) {
        toast.error("Please provide departure flight number and time.");
        return;
      }
    }

    if (buildMode === "pagoda_build") {
      const intakeErr = validateIntakeForPagodaBuild(intake);
      if (intakeErr) {
        toast.error(intakeErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEditMode && itinerary) {
        // Get old itinerary data to compare dates
        let oldStartDate = "";
        let oldEndDate = "";
        try {
          const oldItResp = await fetch(`/api/itineraries/${itinerary.id}`, {
            cache: "no-store",
          });
          const oldItData = await oldItResp.json().catch(() => null);
          if (oldItResp.ok && oldItData?.ok && oldItData?.itinerary) {
            oldStartDate = oldItData.itinerary.start_date || "";
            oldEndDate = oldItData.itinerary.end_date || "";
          }
        } catch (error) {
          console.error("Error fetching old itinerary data:", error);
        }

        // Update existing itinerary
        // Build highlights to record transfer details
        const highlights: string[] = [];
        if (formData.arrivalTransfer) {
          highlights.push(
            `Arrival airport transfer: flight ${formData.arrivalFlightNumber.trim()} at ${formData.arrivalTime}`
          );
        }
        if (formData.departureTransfer) {
          highlights.push(
            `Departure airport transfer: flight ${formData.departureFlightNumber.trim()} at ${formData.departureTime}`
          );
        }

        const resp = await fetch(`/api/itineraries/${itinerary.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.itineraryName,
            location: formData.country,
            start_date: formData.startDate,
            end_date: formData.endDate,
            highlights: highlights.length ? highlights : null,
            arrival_transfer: formData.arrivalTransfer,
            arrival_flight_number: formData.arrivalFlightNumber.trim() || undefined,
            arrival_flight_time: formData.arrivalTime || undefined,
            departure_transfer: formData.departureTransfer,
            departure_flight_number: formData.departureFlightNumber.trim() || undefined,
            departure_flight_time: formData.departureTime || undefined,
            build_mode: buildMode,
            intake_data: intakeDataForApi(intake),
          }),
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to update itinerary");
        }

        // Update airport transfer jobs and delete jobs outside new date range
        await updateAirportTransferJobs(
          itinerary.id,
          formData.startDate,
          formData.endDate,
          formData.country,
          formData.arrivalTransfer,
          formData.arrivalFlightNumber,
          formData.arrivalTime,
          formData.departureTransfer,
          formData.departureFlightNumber,
          formData.departureTime,
          oldStartDate,
          oldEndDate
        );

        toast.success("Itinerary updated!");

        // Reset form and close modal
        setFormData({
          itineraryName: "",
          country: "Japan",
          startDate: "",
          endDate: "",
          arrivalTransfer: false,
          arrivalFlightNumber: "",
          arrivalTime: "",
          departureTransfer: false,
          departureFlightNumber: "",
          departureTime: "",
        });
        setBuildMode("pagoda_build");
        setIntake(emptyIntakeData());
        onOpenChange(false);

        // Call the callback with the updated itinerary
        if (onItineraryCreated && data.itinerary) {
          const updatedItinerary: CardItinerary = {
            id: String(data.itinerary.id),
            title: String(data.itinerary.name),
            location: String(data.itinerary.location),
            startDate: String(data.itinerary.start_date),
            endDate: String(data.itinerary.end_date),
            duration: calculateDuration(
              String(data.itinerary.start_date),
              String(data.itinerary.end_date)
            ),
            jobsCount: itinerary.jobsCount || 0,
            unassignedCount: itinerary.unassignedCount || 0,
            activities: itinerary.activities || [],
            status: data.itinerary.status || itinerary.status || "draft",
            image: itinerary.image,
          };
          onItineraryCreated(updatedItinerary);
        } else {
          // Refresh the page to show the updated itinerary if no callback provided
          window.location.reload();
        }
      } else {
        // Create new itinerary
        const status = "draft";

        // Build highlights to record transfer details
        const highlights: string[] = [];
        if (formData.arrivalTransfer) {
          highlights.push(
            `Arrival airport transfer: flight ${formData.arrivalFlightNumber.trim()} at ${formData.arrivalTime}`
          );
        }
        if (formData.departureTransfer) {
          highlights.push(
            `Departure airport transfer: flight ${formData.departureFlightNumber.trim()} at ${formData.departureTime}`
          );
        }

        const resp = await fetch("/api/itineraries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.itineraryName,
            location: formData.country,
            startDate: formData.startDate,
            endDate: formData.endDate,
            status: status,
            highlights: highlights.length ? highlights : null,
            // explicit transfer fields for backend persistence
            arrivalTransfer: formData.arrivalTransfer,
            arrivalFlightNumber: formData.arrivalFlightNumber.trim() || undefined,
            arrivalTime: formData.arrivalTime || undefined,
            departureTransfer: formData.departureTransfer,
            departureFlightNumber: formData.departureFlightNumber.trim() || undefined,
            departureTime: formData.departureTime || undefined,
            buildMode,
            intakeData: intakeDataForApi(intake),
          }),
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
          if (isProfileRequiredError(data)) {
            onOpenChange(false);
            setProfileRequiredOpen(true);
            return;
          }
          throw new Error(data?.error || "Failed to create itinerary");
        }

        toast.success(
          buildMode === "pagoda_build"
            ? "Request submitted! The Pagoda team will build your proposal and email you when it's ready."
            : "Draft itinerary created!"
        );

        // Reset form and close modal
        setFormData({
          itineraryName: "",
          country: "Japan",
          startDate: "",
          endDate: "",
          arrivalTransfer: false,
          arrivalFlightNumber: "",
          arrivalTime: "",
          departureTransfer: false,
          departureFlightNumber: "",
          departureTime: "",
        });
        setBuildMode("pagoda_build");
        setIntake(emptyIntakeData());
        onOpenChange(false);

        // Call the callback with the new itinerary
        if (onItineraryCreated && data.itinerary) {
          const newItinerary: CardItinerary = {
            id: String(data.itinerary.id),
            title: String(data.itinerary.name),
            location: String(data.itinerary.location),
            startDate: String(data.itinerary.start_date),
            endDate: String(data.itinerary.end_date),
            duration: calculateDuration(
              String(data.itinerary.start_date),
              String(data.itinerary.end_date)
            ),
            jobsCount: 0,
            unassignedCount: 0,
            activities: [],
            status: "draft",
          };
          onItineraryCreated(newItinerary);
        } else {
          // Refresh the page to show the new itinerary if no callback provided
          window.location.reload();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (isProfileRequiredError({ error: msg })) {
        onOpenChange(false);
        setProfileRequiredOpen(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Reset form when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setFormData({
        itineraryName: "",
        country: "Japan",
        startDate: "",
        endDate: "",
        arrivalTransfer: false,
        arrivalFlightNumber: "",
        arrivalTime: "",
        departureTransfer: false,
        departureFlightNumber: "",
        departureTime: "",
      });
    }
    onOpenChange(open);
  };

  // Helper function to update airport transfer jobs and clean up jobs outside date range
  const updateAirportTransferJobs = async (
    itineraryId: string,
    startDate: string,
    endDate: string,
    location: string,
    arrivalTransfer: boolean,
    arrivalFlightNumber: string,
    arrivalTime: string,
    departureTransfer: boolean,
    departureFlightNumber: string,
    departureTime: string,
    oldStartDate?: string,
    oldEndDate?: string
  ) => {
    try {
      // Helper to convert date + time to ISO timestamp
      const toTimestamp = (dateISO: string, timeHHMM: string): string | null => {
        if (!timeHHMM) {
          console.warn("toTimestamp: timeHHMM is empty or falsy");
          return null;
        }
        const timeStr = String(timeHHMM).trim();
        if (!timeStr) {
          console.warn("toTimestamp: time string is empty after trim");
          return null;
        }
        
        // Handle different time formats: "HH:MM", "HH:MM:SS", etc.
        let trimmed = timeStr;
        // If it's in HH:MM:SS format, extract just HH:MM
        if (timeStr.includes(":")) {
          const parts = timeStr.split(":");
          if (parts.length >= 2) {
            trimmed = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
          }
        }
        
        if (!/^\d{2}:\d{2}$/.test(trimmed)) {
          console.warn(`toTimestamp: time format invalid - expected HH:MM, got: ${timeStr} (trimmed: ${trimmed})`);
          return null;
        }

        let base: Date;
        try {
          base = new Date(dateISO.trim() + "T00:00:00Z");
          if (isNaN(base.getTime())) return null;
        } catch {
          return null;
        }

        const [h, m = "0"] = trimmed.split(":");
        const hours = Number(h);
        const minutes = Number(m);

        if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

        base.setUTCHours(hours, minutes, 0, 0);
        return base.toISOString();
      };

      // Helper to extract date from ISO timestamp (YYYY-MM-DD)
      const extractDate = (isoTimestamp: string): string => {
        try {
          const date = new Date(isoTimestamp);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, "0");
          const day = String(date.getUTCDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        } catch {
          return "";
        }
      };

      // Fetch all existing jobs for this itinerary
      const jobsResp = await fetch(`/api/jobs?itineraryId=${encodeURIComponent(itineraryId)}`, {
        cache: "no-store",
      });
      const jobsData = await jobsResp.json().catch(() => null);
      let existingJobs = jobsData?.ok && Array.isArray(jobsData.jobs) ? jobsData.jobs : [];

      // If dates changed, only delete *airport transfer* jobs that are outside range AND disabled.
      // Regular tour/jobs should not be deleted; they may simply fall outside the new range.
      if (oldStartDate && oldEndDate && (oldStartDate !== startDate || oldEndDate !== endDate)) {
        const newStartDateObj = new Date(startDate + "T00:00:00Z");
        const newEndDateObj = new Date(endDate + "T23:59:59Z");
        const jobsToDelete: string[] = [];

        for (const job of existingJobs) {
          // Check if job date is outside new range
          if (job.start_time) {
            const jobDate = extractDate(job.start_time);
            const jobDateObj = new Date(jobDate + "T00:00:00Z");
            const isOutsideRange = jobDateObj < newStartDateObj || jobDateObj > newEndDateObj;

            // Check if this is an airport transfer job
            const isAirportTransfer =
              isAirportTransfersCatalogType(job.activity_type || "") &&
              (job.name?.includes("Arrival") || job.name?.includes("Departure"));

            if (isAirportTransfer) {
              // For airport transfer jobs outside the new range:
              // - If transfers are disabled, delete them
              // - If transfers are enabled, they'll be updated to new dates below
              const isArrivalJob = job.name?.includes("Arrival");
              const isDepartureJob = job.name?.includes("Departure");
              
              if (isOutsideRange && ((isArrivalJob && !arrivalTransfer) || (isDepartureJob && !departureTransfer))) {
                // Mark for deletion
                jobsToDelete.push(job.id);
                console.log(`Marking airport transfer job ${job.id} (${job.name}) for deletion - outside new date range and transfer disabled`);
              }
              // If transfer is enabled, the job will be updated below with new dates
            }
          }
        }

        // Delete all marked jobs
        for (const jobId of jobsToDelete) {
          try {
            const deleteResp = await fetch(`/api/jobs/${jobId}`, {
              method: "DELETE",
            });
            const deleteData = await deleteResp.json().catch(() => null);
            if (deleteResp.ok && deleteData?.ok) {
              console.log(`Successfully deleted job ${jobId}`);
            } else {
              console.error(`Failed to delete job ${jobId}:`, deleteData?.error);
            }
          } catch (error) {
            console.error(`Error deleting job ${jobId}:`, error);
          }
        }

        // Refetch jobs after deletion to get updated list
        if (jobsToDelete.length > 0) {
          const refreshedJobsResp = await fetch(`/api/jobs?itineraryId=${encodeURIComponent(itineraryId)}`, {
            cache: "no-store",
          });
          const refreshedJobsData = await refreshedJobsResp.json().catch(() => null);
          existingJobs = refreshedJobsData?.ok && Array.isArray(refreshedJobsData.jobs) ? refreshedJobsData.jobs : [];
        }
      }

      // Find existing airport transfer jobs
      const arrivalJob = existingJobs.find(
        (j: any) => isAirportTransfersCatalogType(j.activity_type || "") && j.name?.includes("Arrival")
      );
      const departureJob = existingJobs.find(
        (j: any) => isAirportTransfersCatalogType(j.activity_type || "") && j.name?.includes("Departure")
      );

      // Handle arrival transfer job
      if (arrivalTransfer && arrivalFlightNumber && arrivalTime) {
        console.log(`Processing arrival transfer: date=${startDate}, time=${arrivalTime}, time type=${typeof arrivalTime}`);
        
        // Ensure time is in HH:MM format (API expects exactly this format)
        let formattedTime = String(arrivalTime).trim();
        // Extract HH:MM from HH:MM:SS if needed
        if (formattedTime.includes(":")) {
          const parts = formattedTime.split(":");
          if (parts.length >= 2) {
            formattedTime = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
          }
        }
        
        // Validate time format matches API expectation (HH:MM)
        if (!/^\d{2}:\d{2}$/.test(formattedTime)) {
          console.error(`Invalid time format for arrival: ${arrivalTime} (formatted: ${formattedTime}). Expected HH:MM format.`);
        } else {
          console.log(`Using formatted arrival time: ${formattedTime} for date: ${startDate}`);
          if (arrivalJob) {
            // Update existing arrival job
            console.log(`Updating arrival transfer job ${arrivalJob.id} to date ${startDate}`);
            const updateResp = await fetch("/api/jobs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: arrivalJob.id,
                name: `Airport Transfer - Arrival (Flight ${arrivalFlightNumber.trim()})`,
                activityType: INSTANT_AIRPORT_TRANSFERS_TYPE,
                location: location,
                description: `Airport transfer service for arrival flight ${arrivalFlightNumber.trim()} arriving at ${formattedTime}.`,
                activityDateISO: startDate,
                startTime: formattedTime,
                endTime: formattedTime,
              }),
            });
            const updateData = await updateResp.json().catch(() => null);
            if (updateResp.ok && updateData?.ok) {
              console.log(`Successfully updated arrival transfer job ${arrivalJob.id}`);
            } else {
              console.error(`Failed to update arrival transfer job:`, updateData?.error, {
                requestBody: {
                  id: arrivalJob.id,
                  activityDateISO: startDate,
                  startTime: formattedTime,
                  endTime: formattedTime,
                }
              });
              // Don't throw - log error but continue
            }
          } else {
            // Create new arrival job
            console.log(`Creating new arrival transfer job for date ${startDate}`);
            const createResp = await fetch("/api/jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                itineraryId: itineraryId,
                name: `Airport Transfer - Arrival (Flight ${arrivalFlightNumber.trim()})`,
                activityType: INSTANT_AIRPORT_TRANSFERS_TYPE,
                activityDateISO: startDate,
                startTime: formattedTime,
                endTime: formattedTime,
                location: location,
                description: `Airport transfer service for arrival flight ${arrivalFlightNumber.trim()} arriving at ${formattedTime}.`,
                createJob: true,
              }),
            });
            const createData = await createResp.json().catch(() => null);
            if (createResp.ok && createData?.ok) {
              console.log(`Successfully created arrival transfer job`);
            } else {
              console.error(`Failed to create arrival transfer job:`, createData?.error, {
                requestBody: {
                  activityDateISO: startDate,
                  startTime: formattedTime,
                  endTime: formattedTime,
                }
              });
              // Don't throw - log error but continue
            }
          }
        }
      } else if (arrivalJob) {
        // Delete arrival job if transfer is disabled
        console.log(`Deleting arrival transfer job ${arrivalJob.id} - transfer disabled`);
        const deleteResp = await fetch(`/api/jobs/${arrivalJob.id}`, {
          method: "DELETE",
        });
        const deleteData = await deleteResp.json().catch(() => null);
        if (deleteResp.ok && deleteData?.ok) {
          console.log(`Successfully deleted arrival transfer job ${arrivalJob.id}`);
        } else {
          console.error(`Failed to delete arrival transfer job:`, deleteData?.error);
        }
      }

      // Handle departure transfer job
      if (departureTransfer && departureFlightNumber && departureTime) {
        console.log(`Processing departure transfer: date=${endDate}, time=${departureTime}, time type=${typeof departureTime}`);
        
        // Ensure time is in HH:MM format
        let formattedTime = String(departureTime).trim();
        // Extract HH:MM from HH:MM:SS if needed
        if (formattedTime.includes(":")) {
          const parts = formattedTime.split(":");
          if (parts.length >= 2) {
            formattedTime = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
          }
        }
        
        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(formattedTime)) {
          console.error(`Invalid time format for departure: ${departureTime} (formatted: ${formattedTime})`);
        } else {
          console.log(`Using formatted departure time: ${formattedTime}`);
          if (departureJob) {
            // Update existing departure job
            console.log(`Updating departure transfer job ${departureJob.id} to date ${endDate}`);
            const updateResp = await fetch("/api/jobs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: departureJob.id,
                name: `Airport Transfer - Departure (Flight ${departureFlightNumber.trim()})`,
                activityType: INSTANT_AIRPORT_TRANSFERS_TYPE,
                location: location,
                description: `Airport transfer service for departure flight ${departureFlightNumber.trim()} departing at ${formattedTime}.`,
                activityDateISO: endDate,
                startTime: formattedTime,
                endTime: formattedTime,
              }),
            });
            const updateData = await updateResp.json().catch(() => null);
            if (updateResp.ok && updateData?.ok) {
              console.log(`Successfully updated departure transfer job ${departureJob.id}`);
            } else {
              console.error(`Failed to update departure transfer job:`, updateData?.error, {
                requestBody: {
                  id: departureJob.id,
                  activityDateISO: endDate,
                  startTime: formattedTime,
                  endTime: formattedTime,
                }
              });
              // Don't throw - log error but continue
            }
          } else {
            // Create new departure job
            console.log(`Creating new departure transfer job for date ${endDate}`);
            const createResp = await fetch("/api/jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                itineraryId: itineraryId,
                name: `Airport Transfer - Departure (Flight ${departureFlightNumber.trim()})`,
                activityType: INSTANT_AIRPORT_TRANSFERS_TYPE,
                activityDateISO: endDate,
                startTime: formattedTime,
                endTime: formattedTime,
                location: location,
                description: `Airport transfer service for departure flight ${departureFlightNumber.trim()} departing at ${formattedTime}.`,
                createJob: true,
              }),
            });
            const createData = await createResp.json().catch(() => null);
            if (createResp.ok && createData?.ok) {
              console.log(`Successfully created departure transfer job`);
            } else {
              console.error(`Failed to create departure transfer job:`, createData?.error, {
                requestBody: {
                  activityDateISO: endDate,
                  startTime: formattedTime,
                  endTime: formattedTime,
                }
              });
              // Don't throw - log error but continue
            }
          }
        }
      } else if (departureJob) {
        // Delete departure job if transfer is disabled
        console.log(`Deleting departure transfer job ${departureJob.id} - transfer disabled`);
        const deleteResp = await fetch(`/api/jobs/${departureJob.id}`, {
          method: "DELETE",
        });
        const deleteData = await deleteResp.json().catch(() => null);
        if (deleteResp.ok && deleteData?.ok) {
          console.log(`Successfully deleted departure transfer job ${departureJob.id}`);
        } else {
          console.error(`Failed to delete departure transfer job:`, deleteData?.error);
        }
      }
    } catch (error) {
      console.error("Error updating airport transfer jobs:", error);
      // Don't throw - allow itinerary update to succeed even if job update fails
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl w-full px-6 sm:px-8 lg:px-10 rounded-2xl max-h-[90vh] overflow-y-auto p-6 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]"
      >
        {/* Close Button */}
        <button
          onClick={() => handleOpenChange(false)}
          className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader className="flex flex-col items-center justify-center text-center pt-2">
          <h1 className="text-3xl font-bold">
            {isEditMode ? "Edit Itinerary" : "Create Draft Itinerary"}
          </h1>
          <p className="text-sm text-muted-foreground -mt-2">
            {isEditMode
              ? "Update your trip itinerary details"
              : "Tell us about your client's trip — then build yourself or ask Pagoda to create the proposal"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Itinerary Name */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Itinerary Name
            </label>
            <div className="mt-3">
              <Input
                name="itineraryName"
                placeholder="e.g. Japanese Cultural Adventure"
                value={formData.itineraryName}
                onChange={handleInputChange}
                required
                className="border-input"
              />
            </div>
          </div>

          <CountrySelect
            label="Country"
            value={formData.country}
            onChange={(country) =>
              setFormData((prev) => ({ ...prev, country }))
            }
            required
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 shrink-0" /> Arrival date
              </label>
              <Input
                name="startDate"
                type="date"
                value={formData.startDate}
                onChange={handleInputChange}
                required
                className="border-input"
              />
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="arrivalTransfer"
                    checked={formData.arrivalTransfer}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4"
                  />
                  Request airport transfer (arrival)
                </label>
                {formData.arrivalTransfer && (
                  <div className="grid grid-cols-1 gap-2">
                    <Input
                      name="arrivalFlightNumber"
                      placeholder="Flight number (e.g. BA2490)"
                      value={formData.arrivalFlightNumber}
                      onChange={handleInputChange}
                      className="border-input"
                    />
                    <Input
                      name="arrivalTime"
                      type="time"
                      value={formData.arrivalTime}
                      onChange={handleInputChange}
                      className="border-input"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 shrink-0" /> Departure Date
              </label>
              <Input
                name="endDate"
                type="date"
                value={formData.endDate}
                onChange={handleInputChange}
                required
                className="border-input"
              />
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="departureTransfer"
                    checked={formData.departureTransfer}
                    onChange={handleCheckboxChange}
                    className="h-4 w-4"
                  />
                  Request airport transfer (departure)
                </label>
                {formData.departureTransfer && (
                  <div className="grid grid-cols-1 gap-2">
                    <Input
                      name="departureFlightNumber"
                      placeholder="Flight number (e.g. BA2489)"
                      value={formData.departureFlightNumber}
                      onChange={handleInputChange}
                      className="border-input"
                    />
                    <Input
                      name="departureTime"
                      type="time"
                      value={formData.departureTime}
                      onChange={handleInputChange}
                      className="border-input"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <ItineraryIntakeFields
            buildMode={buildMode}
            onBuildModeChange={setBuildMode}
            intake={intake}
            onIntakeChange={(patch) => {
              setIntake((prev) => ({ ...prev, ...patch }));
              if (patch.primaryDestination) {
                setFormData((prev) => ({
                  ...prev,
                  country: patch.primaryDestination || prev.country,
                }));
              }
            }}
            arrivalDate={formData.startDate}
            departureDate={formData.endDate}
            onDatesChange={(patch) =>
              setFormData((prev) => ({
                ...prev,
                startDate: patch.arrivalDate ?? prev.startDate,
                endDate: patch.departureDate ?? prev.endDate,
              }))
            }
            disabled={submitting}
          />

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white font-semibold"
          >
            {submitting
              ? isEditMode
                ? "Updating…"
                : "Creating Draft…"
              : isEditMode
              ? "Update Itinerary"
              : "Create Draft"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={profileRequiredOpen} onOpenChange={setProfileRequiredOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complete your profile</AlertDialogTitle>
          <AlertDialogDescription>
            Before you can create an itinerary, please complete your profile.
            This only takes a minute and is required for bookings and account setup.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            onClick={() => {
              setProfileRequiredOpen(false);
              router.push(settingsHrefForPath(pathname));
            }}
          >
            Go to profile
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
