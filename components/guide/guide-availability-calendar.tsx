"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  normalizeUnavailableDates,
  type GuideAvailabilityCalendar,
} from "@/lib/guide-availability";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Props = {
  value: string[];
  onChange: (dates: string[]) => void;
  configured?: boolean;
  disabled?: boolean;
  /** Hide title/help when rendered inside a modal */
  embedded?: boolean;
};

export function GuideAvailabilityCalendar({
  value,
  onChange,
  configured = false,
  disabled = false,
  embedded = false,
}: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const unavailableSet = useMemo(() => new Set(normalizeUnavailableDates(value)), [value]);

  const { cells, monthLabel } = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string; ymd: string | null }> = [];
    for (let i = 0; i < startPad; i++) {
      cells.push({ day: null, key: `pad-${i}`, ymd: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = ymd(viewYear, viewMonth, d);
      cells.push({ day: d, key, ymd: key });
    }
    const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return { cells, monthLabel };
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const toggle = (dateKey: string) => {
    if (disabled) return;
    const next = new Set(unavailableSet);
    if (next.has(dateKey)) next.delete(dateKey);
    else next.add(dateKey);
    onChange([...next].sort());
  };

  return (
    <div className="space-y-3">
      {!embedded && (
        <div>
          <Label>Availability calendar</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Click days when this guide is <strong>not</strong> available. Optional while editing the
            profile; <strong>required before the first booking</strong> (client brief §3.3).
            {configured ? (
              <span className="block text-green-700 dark:text-green-400 mt-1">Calendar saved.</span>
            ) : (
              <span className="block text-amber-700 dark:text-amber-400 mt-1">
                Not saved yet — use Update guide / Save to store the calendar.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-medium">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) =>
          c.day == null ? (
            <div key={c.key} className="aspect-square" />
          ) : (
            <button
              key={c.key}
              type="button"
              disabled={disabled}
              onClick={() => c.ymd && toggle(c.ymd)}
              className={`aspect-square rounded-md text-sm border transition-colors ${
                unavailableSet.has(c.ymd!)
                  ? "bg-red-100 border-red-400 text-red-900 line-through"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {c.day}
            </button>
          )
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {unavailableSet.size} day{unavailableSet.size === 1 ? "" : "s"} marked unavailable.
        {unavailableSet.size === 0 && configured
          ? " (All days treated as available until you mark exceptions.)"
          : ""}
      </p>
    </div>
  );
}

export function availabilityFromForm(
  unavailableDates: string[],
  previous?: GuideAvailabilityCalendar | null
): GuideAvailabilityCalendar {
  return {
    unavailableDates: normalizeUnavailableDates(unavailableDates),
    updatedAt: new Date().toISOString(),
  };
}
