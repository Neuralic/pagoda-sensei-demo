import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Day } from "@/app/types";
import { Button } from "../ui/button";
import { useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  buildDayPdfDefaults,
  mergeDaySummaryWithActivities,
  type DaySummaryActivityLike,
} from "@/lib/itinerary-day-summary";
import { parseIntakeData } from "@/lib/itinerary-intake";
import {
  resolvePdfTitleSubtitle,
} from "@/lib/itinerary-pdf-defaults";

export type SavedItineraryPdfFields = {
  trips_summary: Record<string, { summary: string[] }>;
  arrival_location: Record<string, string>;
  arrival_heading: Record<string, string>;
  pdf_title: string;
  pdf_subtitle: string;
};

interface ViewPdfModalProps {
  pdfOpen: boolean;
  setPdfOpen: (open: boolean) => void;
  daysList: Day[];
  printExportPdf: () => void | Promise<void>;
  refreshJobs: () => void;
  /** Merge into edit page `itinerary` so PDF + day data update without a full refetch. */
  onItineraryFieldsSaved?: (patch: SavedItineraryPdfFields) => void;
  /** Booked jobs/transfers by day id (`day-YYYY-MM-DD`) — used to auto-fill summaries. */
  activitiesByDay?: Record<string, DaySummaryActivityLike[]>;
  /** Prefer this over `?itineraryId=` (admin edit uses a path param, not the query string). */
  itineraryId?: string;
  /** When admin, do not rewrite the advisor's (or admin's) profile website — only itinerary PDF fields. */
  editorRole?: "agent" | "admin" | "agency";
}

interface DayInputs {
  summary: string[];
}

const ViewPdfModal = ({
  pdfOpen,
  setPdfOpen,
  daysList,
  printExportPdf,
  refreshJobs,
  onItineraryFieldsSaved,
  activitiesByDay,
  itineraryId: itineraryIdProp,
  editorRole = "agent",
}: ViewPdfModalProps) => {
  const search = useSearchParams();
  const itineraryId = itineraryIdProp || search.get("itineraryId") || "";
  const skipProfileWebsite = editorRole === "admin";
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [arrivalLocation, setArrivalLocation] = useState<Record<string, string>>(
    {}
  );

  const [arrivalHeading, setArrivalHeading] = useState<Record<string, string>>(
    {}
  );

  const [formData, setFormData] = useState({
    website: "",
    title: "",
    subtitle: "",
  });

  const [inputs, setInputs] = useState<Record<string, DayInputs>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const seededOpenRef = useRef(false);
  const titleDirtyRef = useRef(false);
  const subtitleDirtyRef = useRef(false);
  const [itineraryMeta, setItineraryMeta] = useState<{
    name?: string | null;
    location?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    pdf_title?: string | null;
    pdf_subtitle?: string | null;
    intake_data?: unknown;
  } | null>(null);

  const titleSubtitleDefaults = useMemo(
    () =>
      resolvePdfTitleSubtitle(
        {
          name: itineraryMeta?.name,
          location: itineraryMeta?.location,
          start_date: itineraryMeta?.start_date,
          end_date: itineraryMeta?.end_date,
          pdf_title: null,
          pdf_subtitle: null,
          intake_data: itineraryMeta?.intake_data,
        },
        activitiesByDay
      ),
    [itineraryMeta, activitiesByDay]
  );

  const applySummariesFromActivities = (overwriteAll: boolean) => {
    if (!daysList?.length) return;
    const defaults = buildDayPdfDefaults(
      daysList.map((d) => d.id),
      activitiesByDay,
      parseIntakeData(itineraryMeta?.intake_data)?.destinationStays
    );
    setInputs((prev) => {
      const next: Record<string, DayInputs> = { ...prev };
      for (const day of daysList) {
        const existing = prev[day.id]?.summary ?? day.summary;
        if (overwriteAll) {
          next[day.id] = { summary: [...defaults[day.id].summary] };
        } else {
          next[day.id] = {
            summary: mergeDaySummaryWithActivities(
              existing,
              activitiesByDay?.[day.id]
            ),
          };
        }
      }
      return next;
    });
    setArrivalHeading((prev) => {
      const next = { ...prev };
      for (const day of daysList) {
        if (overwriteAll || !String(next[day.id] || day.arrivalHeading || "").trim()) {
          next[day.id] = defaults[day.id].arrivalHeading;
        }
      }
      return next;
    });
    setArrivalLocation((prev) => {
      const next = { ...prev };
      for (const day of daysList) {
        if (overwriteAll || !String(next[day.id] || day.arrivalLocation || "").trim()) {
          next[day.id] = defaults[day.id].arrivalLocation;
        }
      }
      return next;
    });
  };

  // Seed form when Edit Summary opens (and fill blank day fields from bookings / city stays)
  useEffect(() => {
    if (!pdfOpen) {
      seededOpenRef.current = false;
      titleDirtyRef.current = false;
      subtitleDirtyRef.current = false;
      return;
    }
    if (!daysList || daysList.length === 0) return;

    const defaults = buildDayPdfDefaults(
      daysList.map((d) => d.id),
      activitiesByDay,
      parseIntakeData(itineraryMeta?.intake_data)?.destinationStays
    );

    if (!seededOpenRef.current) {
      seededOpenRef.current = true;
      const initSummary: Record<string, DayInputs> = {};
      const initLocations: Record<string, string> = {};
      const initHeadings: Record<string, string> = {};

      daysList.forEach((day) => {
        initSummary[day.id] = {
          summary: mergeDaySummaryWithActivities(
            day.summary,
            activitiesByDay?.[day.id]
          ),
        };
        initLocations[day.id] =
          String(day.arrivalLocation || "").trim() ||
          defaults[day.id].arrivalLocation;
        initHeadings[day.id] =
          String(day.arrivalHeading || "").trim() ||
          defaults[day.id].arrivalHeading;
      });

      setArrivalLocation(initLocations);
      setArrivalHeading(initHeadings);
      setInputs(initSummary);
      return;
    }

    // If activities load after open, merge tour titles into day summaries
    setInputs((prev) => {
      let changed = false;
      const next: Record<string, DayInputs> = { ...prev };
      for (const day of daysList) {
        const existing = next[day.id]?.summary;
        const merged = mergeDaySummaryWithActivities(
          existing,
          activitiesByDay?.[day.id]
        );
        const same =
          existing?.length === merged.length &&
          existing.every((line, i) => line === merged[i]);
        if (!same) {
          next[day.id] = { summary: merged };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setArrivalHeading((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const day of daysList) {
        if (!String(next[day.id] || "").trim() && defaults[day.id].arrivalHeading) {
          next[day.id] = defaults[day.id].arrivalHeading;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setArrivalLocation((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const day of daysList) {
        if (!String(next[day.id] || "").trim() && defaults[day.id].arrivalLocation) {
          next[day.id] = defaults[day.id].arrivalLocation;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pdfOpen, daysList, activitiesByDay, itineraryMeta?.intake_data]);

  useEffect(() => {
    if (!itineraryId || !pdfOpen) return;

    let cancelled = false;
    async function load() {
      try {
        const profileRes = await fetch("/api/profile");
        const itineraryRes = await fetch(`/api/itineraries/${itineraryId}`);
        const results = await Promise.all([
          profileRes.json().catch(() => ({ ok: false, profile: null })),
          itineraryRes.json().catch(() => ({ ok: false, itinerary: null })),
        ]);
        const [profileData, itineraryData] = results;
        if (cancelled) return;

        if (profileData?.ok && profileData.profile) {
          setFormData((prev) => ({
            ...prev,
            website: profileData.profile.website || "",
          }));
        }

        if (itineraryData?.ok && itineraryData.itinerary) {
          const it = itineraryData.itinerary;
          setItineraryMeta({
            name: it.name,
            location: it.location,
            start_date: it.start_date,
            end_date: it.end_date,
            pdf_title: it.pdf_title,
            pdf_subtitle: it.pdf_subtitle,
            intake_data: it.intake_data,
          });
          const resolved = resolvePdfTitleSubtitle(it, activitiesByDay);
          setFormData((prev) => ({
            ...prev,
            title: String(it.pdf_title || "").trim() || resolved.title,
            subtitle: String(it.pdf_subtitle || "").trim() || resolved.subtitle,
          }));
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // Seed once per open; activities used at load time. Subtitle updates when activities arrive via effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryId, pdfOpen]);

  // When activities load after open, refresh unsaved/unedited title & subtitle from standards.
  useEffect(() => {
    if (!pdfOpen || !itineraryMeta) return;
    const savedTitle = String(itineraryMeta.pdf_title || "").trim();
    const savedSubtitle = String(itineraryMeta.pdf_subtitle || "").trim();
    const resolved = resolvePdfTitleSubtitle(
      {
        ...itineraryMeta,
        pdf_title: null,
        pdf_subtitle: null,
      },
      activitiesByDay
    );
    setFormData((prev) => ({
      ...prev,
      title:
        savedTitle ||
        (titleDirtyRef.current ? prev.title : resolved.title),
      subtitle:
        savedSubtitle ||
        (subtitleDirtyRef.current ? prev.subtitle : resolved.subtitle),
    }));
  }, [pdfOpen, itineraryMeta, activitiesByDay]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "title") titleDirtyRef.current = true;
    if (name === "subtitle") subtitleDirtyRef.current = true;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (dayId: string, value: string) => {
    setArrivalLocation((prev) => ({
      ...prev,
      [dayId]: value,
    }));
  };

  const handleArrivalChange = (dayId: string, value: string) => {
    setArrivalHeading((prev) => ({
      ...prev,
      [dayId]: value,
    }));
  };

  const handleChange = (dayId: string, index: number, value: string) => {
    setInputs((prev) => {
      const dayData = prev[dayId] || { summary: [""] };
      const updated = [...dayData.summary];
      updated[index] = value;
      return {
        ...prev,
        [dayId]: { summary: updated },
      };
    });
  };

  const addLocation = (dayId: string) => {
    setInputs((prev) => {
      const dayData = prev[dayId] || { summary: [""] };
      return {
        ...prev,
        [dayId]: { summary: [...dayData.summary, ""] },
      };
    });
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        const json = await res.json();
        if (json.ok && json.user?.id) {
          setCurrentUserId(json.user.id);
        }
      } catch (e) {
        console.error("User fetch error:", e);
      }
    };
    fetchUser();
  }, []);

  const handleSaveProfile = async () => {
    if (!itineraryId) {
      toast.error("Missing itinerary id — cannot save summary.");
      return;
    }
    if (!currentUserId) {
      toast.error("Could not load your user session.");
      return;
    }
    if (!skipProfileWebsite && !formData.website.trim()) {
      toast.error("Website is required for the proposal profile.");
      return;
    }

    const payload = {
      summaries: inputs,
      arrivalLocations: arrivalLocation,
      arrivalHeadings: arrivalHeading,
      profile: formData,
      itineraryId,
      skipProfileUpdate: skipProfileWebsite,
    };

    try {
      const res = await fetch(`/api/pdf/${currentUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to update summary");
        return;
      }
      onItineraryFieldsSaved?.({
        trips_summary: inputs,
        arrival_location: arrivalLocation,
        arrival_heading: arrivalHeading,
        pdf_title: formData.title,
        pdf_subtitle: formData.subtitle,
      });
      refreshJobs();
      setPdfOpen(false);
      toast.success("Updated successfully!");
    } catch (err) {
      console.error("Error updating:", err);
      toast.error("Failed to update summary");
    }
  };

  return (
    <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
      <DialogContent className="sm:max-w-2xl w-full px-4 sm:px-8 lg:px-8 rounded-2xl min-h-[70vh] max-h-[90vh] overflow-y-auto">
        <div className="userProfile">
          <h2 className="text-xl font-bold mb-4">
            {skipProfileWebsite ? "Proposal cover" : "Profile"}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {skipProfileWebsite
              ? "These title fields and day summaries are saved on this itinerary. Advisor account details are not changed here."
              : "Dear Agent, please note that the information you upload here will automatically create the summary page for your itinerary or proposal that will be shared with your client."}
          </p>
          <ul>
            <li className="mb-6 p-4 border rounded shadow-sm flex flex-col gap-3">
              {skipProfileWebsite ? null : (
                <div>
                  <label className="block mb-1 font-medium">Website:</label>
                  <input
                    type="text"
                    name="website"
                    placeholder="Enter website"
                    className="w-full border rounded px-3 py-2"
                    value={formData.website}
                    onChange={handleProfileChange}
                  />
                </div>
              )}

              <div>
                <label className="block mb-1 font-medium">Title:</label>
                <input
                  type="text"
                  name="title"
                  placeholder={titleSubtitleDefaults.title || "Enter title"}
                  className="w-full border rounded px-3 py-2"
                  value={formData.title}
                  onChange={handleProfileChange}
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Subtitle:</label>
                <input
                  type="text"
                  name="subtitle"
                  placeholder={titleSubtitleDefaults.subtitle || "Enter subtitle"}
                  className="w-full border rounded px-3 py-2"
                  value={formData.subtitle}
                  onChange={handleProfileChange}
                />
              </div>
            </li>
          </ul>
        </div>

        <div className="daysTitle">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold">Trip Days</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 cursor-pointer"
              onClick={() => {
                applySummariesFromActivities(true);
                toast.success("Day details filled from booked activities");
              }}
            >
              Fill from activities
            </Button>
          </div>
          <ul>
            {daysList.map((day) => (
              <li
                key={day.id}
                className="mb-6 p-4 border rounded shadow-sm flex flex-col gap-2"
              >
                <div>
                  <strong>{day.label}</strong> - {day.title}
                </div>

                <div>
                  <label className="block mb-1 font-medium">
                    Today&apos;s main event:
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your day plan"
                    className="w-full border rounded px-3 py-2"
                    value={arrivalHeading[day.id] || ""}
                    onChange={(e) => handleArrivalChange(day.id, e.target.value)}
                  />
                </div>

                <div>
                  <label className="block mb-1 font-medium">Insert Location:</label>
                  <input
                    type="text"
                    placeholder="Enter location"
                    className="w-full border rounded px-3 py-2"
                    value={arrivalLocation[day.id] || ""}
                    onChange={(e) => handleLocationChange(day.id, e.target.value)}
                  />
                </div>

                {(inputs[day.id]?.summary || [""]).map((loc, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Todays activity"
                      className="w-full border rounded px-3 py-2"
                      value={loc}
                      onChange={(e) => handleChange(day.id, idx, e.target.value)}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addLocation(day.id)}
                  className="mt-2 bg-gray-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                >
                  Add More
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full flex flex-col sm:flex-row justify-center gap-2 mt-6">
          <Button
            onClick={handleSaveProfile}
            className="cursor-pointer w-1/2 bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg shadow-md transition-all"
          >
            Update
          </Button>

          <Button
            onClick={async () => {
              if (previewLoading) return;
              setPreviewLoading(true);
              try {
                await Promise.resolve(printExportPdf());
              } finally {
                setPreviewLoading(false);
              }
            }}
            disabled={previewLoading}
            className="cursor-pointer w-1/2 bg-[#D4AA25] hover:bg-[#C49A1F] text-white px-6 py-2 rounded-lg shadow-md transition-all disabled:opacity-70"
          >
            {previewLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Preparing…
              </span>
            ) : (
              "Preview"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewPdfModal;
