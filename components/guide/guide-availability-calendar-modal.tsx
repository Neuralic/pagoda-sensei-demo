"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuideAvailabilityCalendar } from "@/components/guide/guide-availability-calendar";
import { normalizeUnavailableDates } from "@/lib/guide-availability";

type Props = {
  value: string[];
  onChange: (dates: string[]) => void;
  configured?: boolean;
  disabled?: boolean;
};

/** Inline summary + button that opens the calendar in a modal. */
export function GuideAvailabilityCalendarModal({
  value,
  onChange,
  configured = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const count = normalizeUnavailableDates(value).length;

  const apply = () => {
    onChange(normalizeUnavailableDates(draft));
    setOpen(false);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label>Availability calendar</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Mark days when this guide is not available. Optional on profile save; required before
            the first booking.
          </p>
          <p className="text-sm mt-2">
            {count === 0 ? (
              <span>No days marked unavailable</span>
            ) : (
              <span>
                <strong>{count}</strong> day{count === 1 ? "" : "s"} marked unavailable
              </span>
            )}
            {configured ? (
              <span className="block text-green-700 dark:text-green-400 text-xs mt-1">
                Calendar will be stored when you save the profile.
              </span>
            ) : (
              <span className="block text-amber-700 dark:text-amber-400 text-xs mt-1">
                Open the calendar and save the profile to complete this step.
              </span>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-[#D4AA25] text-[#af8a10] gap-2 cursor-pointer"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Calendar className="h-4 w-4" />
          {configured ? "Edit calendar" : "Set availability"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Availability calendar</DialogTitle>
            <DialogDescription>
              Tap a day to mark it unavailable (shown in red). Leave days unmarked if the guide can
              work that day.
            </DialogDescription>
          </DialogHeader>

          <GuideAvailabilityCalendar
            embedded
            value={draft}
            onChange={setDraft}
            configured={configured}
            disabled={disabled}
          />

          <div className="flex flex-wrap justify-end gap-2 mt-4 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#D4AA25] text-black" onClick={apply}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
