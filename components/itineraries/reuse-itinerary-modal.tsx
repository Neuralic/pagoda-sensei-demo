"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { CardItinerary } from "@/app/types";
import { parseSafariDate } from "@/lib/utils";

interface ReuseItineraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itinerary: CardItinerary | null;
  onCreated?: (itinerary: CardItinerary) => void;
}

function calculateDuration(startDate: string, endDate: string) {
  const start = parseSafariDate(startDate);
  const end = parseSafariDate(endDate);
  if (!start || !end) return "1 Days";
  const diffDays = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  return `${diffDays} Days`;
}

function editPathFor(pathname: string | null, itineraryId: string) {
  const base = pathname?.startsWith("/agency") ? "/agency/edit-itinerary" : "/agent/edit-itinerary";
  return `${base}?itineraryId=${encodeURIComponent(itineraryId)}`;
}

export function ReuseItineraryModal({
  open,
  onOpenChange,
  itinerary,
  onCreated,
}: ReuseItineraryModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !itinerary) return;
    setName(`${itinerary.title} (copy)`);
    setStartDate("");
    setEndDate("");
  }, [open, itinerary]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itinerary) return;
    if (!name.trim() || !startDate || !endDate) {
      toast.error("Please enter a name and trip dates");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be on or after start date");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/itineraries/${encodeURIComponent(itinerary.id)}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startDate,
          endDate,
          location: itinerary.location,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to duplicate itinerary");
      }

      const created = data.itinerary as {
        id: string;
        name: string;
        location: string;
        start_date: string;
        end_date: string;
        status?: string;
        created_at?: string | null;
      };

      const card: CardItinerary = {
        id: created.id,
        title: created.name,
        location: created.location,
        startDate: created.start_date,
        endDate: created.end_date,
        duration: calculateDuration(created.start_date, created.end_date),
        jobsCount: typeof data.copiedJobs === "number" ? data.copiedJobs : 0,
        unassignedCount: typeof data.copiedJobs === "number" ? data.copiedJobs : 0,
        activities: [],
        status: (created.status as CardItinerary["status"]) || "draft",
        created_at: created.created_at ?? null,
      };

      onCreated?.(card);
      onOpenChange(false);
      toast.success("Itinerary saved as a new draft");
      router.push(editPathFor(pathname, created.id));
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
            <Copy className="w-4 h-4" />
            Duplicate itinerary
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Save a copy as a new draft for another client. Activities and trip structure are
          kept (dates shifted). Bids, hires, and transfers are not copied. Client name/email
          on the intake form are cleared so you can enter the new client.
        </p>
        {itinerary ? (
          <p className="text-xs text-muted-foreground -mt-1">
            Source: <span className="font-medium text-foreground">{itinerary.title}</span>
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="reuse-name">
              New itinerary name
            </label>
            <Input
              id="reuse-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith Family — Japan 2027"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="reuse-start">
                Arrival date
              </label>
              <Input
                id="reuse-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="reuse-end">
                Departure date
              </label>
              <Input
                id="reuse-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
              disabled={submitting}
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            >
              {submitting ? "Saving…" : "Save as new draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
