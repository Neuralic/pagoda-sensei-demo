"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { ApiItinerary, Tour } from "@/app/types";
import { isItineraryArchived } from "@/lib/itinerary-timeframe";
import { extractTimeFromString } from "@/lib/common-function";
import { normalizeJobImagePaths } from "@/lib/job-tour-image-sign";

interface AddTourToItineraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour: Tour | null;
}

function enumerateDayOptions(start: string, end: string): Array<{ iso: string; label: string }> {
  const out: Array<{ iso: string; label: string }> = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return out;
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  let n = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ iso, label: `Day ${++n} · ${fmt.format(d)}` });
  }
  return out;
}

function editPathFor(pathname: string | null, itineraryId: string) {
  const base = pathname?.startsWith("/agency")
    ? "/agency/edit-itinerary"
    : "/agent/edit-itinerary";
  return `${base}?itineraryId=${encodeURIComponent(itineraryId)}`;
}

export function AddTourToItineraryModal({
  open,
  onOpenChange,
  tour,
}: AddTourToItineraryModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [itineraries, setItineraries] = useState<ApiItinerary[]>([]);
  const [itineraryId, setItineraryId] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setItineraryId("");
    setActivityDate("");
    setAdults(2);
    setChildren(0);
    setInfants(0);

    (async () => {
      try {
        const res = await fetch("/api/itineraries", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load itineraries");
        const list: ApiItinerary[] = Array.isArray(data.itineraries) ? data.itineraries : [];
        const active = list.filter(
          (it) =>
            !isItineraryArchived({ end_date: it.end_date, status: it.status }) &&
            it.status !== "banned"
        );
        if (!cancelled) setItineraries(active);
      } catch (e) {
        if (!cancelled) {
          setItineraries([]);
          toast.error(e instanceof Error ? e.message : "Failed to load itineraries");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selected = useMemo(
    () => itineraries.find((it) => it.id === itineraryId) ?? null,
    [itineraries, itineraryId]
  );

  const dayOptions = useMemo(() => {
    if (!selected?.start_date || !selected?.end_date) return [];
    return enumerateDayOptions(selected.start_date, selected.end_date);
  }, [selected]);

  // When itinerary changes, clear day — do not auto-pick Day 1
  useEffect(() => {
    setActivityDate("");
  }, [itineraryId]);

  // If the selected day is no longer valid for this itinerary, clear it
  useEffect(() => {
    if (!activityDate) return;
    if (dayOptions.length === 0 || !dayOptions.some((d) => d.iso === activityDate)) {
      setActivityDate("");
    }
  }, [dayOptions, activityDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tour?.id) return;
    if (!itineraryId) {
      toast.error("Choose an itinerary");
      return;
    }
    if (!activityDate) {
      toast.error("Choose a day for this tour");
      return;
    }

    const startTime = extractTimeFromString(tour.start_time) || "09:30";
    const endTime = extractTimeFromString(tour.end_time) || "17:00";
    const languages = Array.isArray(tour.languages)
      ? tour.languages
      : typeof tour.languages === "string" && tour.languages
        ? [tour.languages]
        : ["English"];
    const tourAny = tour as Tour & { imagePath?: string | null; rawImage?: string | null };
    // Prefer raw storage paths — never signed preview URLs
    const imagePaths = normalizeJobImagePaths(
      tourAny.imagePath || tourAny.rawImage || tour.image
    );

    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          which: "tour",
          itineraryId,
          activityDateISO: activityDate,
          name: (tour.title || tour.name || "Tour").trim(),
          activityType: (tour.activity_type || "Private Tour").trim(),
          startTime,
          endTime,
          location: (tour.location || "").trim(),
          description: tour.description || tour.highlights || null,
          imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
          languages: JSON.stringify(languages),
          adults,
          children,
          infants,
          groupSize: adults + children + infants,
          tourId: tour.id,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to add tour");
      }

      onOpenChange(false);
      toast.success(
        "Tour added to itinerary. The linked guide can see it on their job board (not Tour Library)."
      );
      router.push(editPathFor(pathname, itineraryId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add to itinerary
          </DialogTitle>
          <p className="pt-2 text-sm text-muted-foreground leading-relaxed">
            {tour?.title || tour?.name
              ? `Add “${tour.title || tour.name}” to one of your active itineraries.`
              : "Add this tour to one of your active itineraries."}
          </p>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading itineraries…</p>
        ) : itineraries.length === 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              You need an active draft or published itinerary first.
            </p>
            <Button
              type="button"
              className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
              onClick={() => {
                onOpenChange(false);
                router.push(
                  pathname?.startsWith("/agency") ? "/agency/itineraries" : "/agent/itineraries"
                );
              }}
            >
              Go to itineraries
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Itinerary</label>
              <Select value={itineraryId || undefined} onValueChange={setItineraryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select itinerary" />
                </SelectTrigger>
                <SelectContent>
                  {itineraries.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name} ({it.start_date} → {it.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Day</label>
              <Select
                value={activityDate || undefined}
                onValueChange={setActivityDate}
              >
                <SelectTrigger
                  className="w-full"
                  disabled={!itineraryId || dayOptions.length === 0}
                >
                  <SelectValue placeholder={itineraryId ? "Select day" : "Select itinerary first"} />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((d) => (
                    <SelectItem key={d.iso} value={d.iso}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="add-adults">
                  Adults
                </label>
                <Input
                  id="add-adults"
                  type="number"
                  min={0}
                  value={adults}
                  onChange={(e) => setAdults(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="add-children">
                  Children
                </label>
                <Input
                  id="add-children"
                  type="number"
                  min={0}
                  value={children}
                  onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="add-infants">
                  Infants
                </label>
                <Input
                  id="add-infants"
                  type="number"
                  min={0}
                  value={infants}
                  onChange={(e) => setInfants(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !itineraryId || !activityDate}
                className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
              >
                {submitting ? "Adding…" : "Add tour"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
