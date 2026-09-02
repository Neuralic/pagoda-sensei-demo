"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimeZone {
  city: string;
  timezone: string;
  abbreviation: string;
}

const TIME_ZONES: TimeZone[] = [
  { city: "Los Angeles", timezone: "America/Los_Angeles", abbreviation: "PST/PDT" },
  { city: "Chicago", timezone: "America/Chicago", abbreviation: "CST/CDT" },
  { city: "New York", timezone: "America/New_York", abbreviation: "EST/EDT" },
  { city: "Tokyo", timezone: "Asia/Tokyo", abbreviation: "JST" },
];

/** Built once — constructing an Intl.DateTimeFormat is expensive to repeat every second. */
const FORMATTERS: Record<string, Intl.DateTimeFormat> = Object.fromEntries(
  TIME_ZONES.map((tz) => [
    tz.city,
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  ])
);

export function TimezoneConverter() {
  const [times, setTimes] = useState<Record<string, string>>({});
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Nothing to tick while the popover is shut, and this sits in the global header — it was
    // rebuilding four Intl.DateTimeFormat objects and re-rendering the header once a second
    // on every page, for the whole session, whether or not anyone was looking at it.
    if (!isOpen) return;

    const updateTimes = () => {
      const newTimes: Record<string, string> = {};
      TIME_ZONES.forEach((tz) => {
        try {
          newTimes[tz.city] = FORMATTERS[tz.city].format(new Date());
        } catch {
          newTimes[tz.city] = "Error";
        }
      });
      setTimes(newTimes);
    };

    // Update immediately
    updateTimes();

    // Update every second
    const interval = setInterval(updateTimes, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors text-xs sm:text-sm font-medium text-gray-700"
          title="World Clock - View time in Los Angeles, Chicago, New York, and Tokyo"
        >
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden md:inline">Time Zones</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-3">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2 text-gray-900">
            <Clock className="h-4 w-4" />
            World Clock
          </h3>
          <div className="space-y-2">
            {TIME_ZONES.map((tz) => (
              <div
                key={tz.city}
                className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm text-gray-900">
                    {tz.city}
                  </span>
                  <span className="text-xs text-gray-500">{tz.abbreviation}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-semibold text-gray-900">
                    {times[tz.city] || "Loading..."}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

