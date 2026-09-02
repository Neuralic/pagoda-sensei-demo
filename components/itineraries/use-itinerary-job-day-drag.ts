"use client";

import { useCallback, useState } from "react";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import toast from "react-hot-toast";
import type { JobRow } from "@/app/types";
import {
  isMovableItineraryJobId,
  shiftJobTimestampsToDate,
} from "@/lib/itinerary-job-day-move";

export type ItineraryDayMeta = {
  id: string;
  iso: string;
  dayNumber: number;
};

type UseItineraryJobDayDragArgs = {
  days: ItineraryDayMeta[];
  jobs: JobRow[];
  setJobs: React.Dispatch<React.SetStateAction<JobRow[]>>;
  /** Expand a day by its day.id (`day-YYYY-MM-DD`) when dropping into a collapsed day */
  ensureDayExpanded: (dayId: string) => void;
};

function dayIsoFromDroppableId(id: string): string | null {
  if (id.startsWith("day-drop:")) return id.slice("day-drop:".length) || null;
  if (id.startsWith("day-")) return id.slice(4) || null;
  return null;
}

export function useItineraryJobDayDrag({
  days,
  jobs,
  setJobs,
  ensureDayExpanded,
}: UseItineraryJobDayDragArgs) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [overDayIso, setOverDayIso] = useState<string | null>(null);
  const [movingJobId, setMovingJobId] = useState<string | null>(null);

  const findDayForJobId = useCallback(
    (jobId: string): ItineraryDayMeta | null => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job?.start_time) return null;
      const iso = job.start_time.slice(0, 10);
      return days.find((d) => d.iso === iso) ?? null;
    },
    [days, jobs]
  );

  const resolveTargetDay = useCallback(
    (overId: string): ItineraryDayMeta | null => {
      const fromDroppable = dayIsoFromDroppableId(overId);
      if (fromDroppable) {
        return days.find((d) => d.iso === fromDroppable) ?? null;
      }
      if (isMovableItineraryJobId(overId)) {
        return findDayForJobId(overId);
      }
      return null;
    },
    [days, findDayForJobId]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!isMovableItineraryJobId(id)) {
      setActiveJobId(null);
      return;
    }
    setActiveJobId(id);
  }, []);

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      if (!overId) {
        setOverDayIso(null);
        return;
      }
      const target = resolveTargetDay(overId);
      setOverDayIso(target?.iso ?? null);
      if (target) ensureDayExpanded(target.id);
    },
    [ensureDayExpanded, resolveTargetDay]
  );

  const onDragCancel = useCallback(() => {
    setActiveJobId(null);
    setOverDayIso(null);
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      setActiveJobId(null);
      setOverDayIso(null);

      if (!overId) return;

      if (!isMovableItineraryJobId(activeId)) {
        if (activeId.startsWith("transferz-")) {
          toast.error(
            "Airport transfers stay on their booked day. Change the date from the transfer details."
          );
        }
        return;
      }

      const sourceDay = findDayForJobId(activeId);
      const targetDay = resolveTargetDay(overId);
      if (!sourceDay || !targetDay) return;
      if (sourceDay.iso === targetDay.iso) return;

      const job = jobs.find((j) => j.id === activeId);
      if (!job?.start_time) {
        toast.error("This tour has no date/time yet, so it can’t be moved.");
        return;
      }

      const shifted = shiftJobTimestampsToDate(
        job.start_time,
        job.end_time,
        targetDay.iso
      );
      if (!shifted) {
        toast.error("Could not move this tour to that day.");
        return;
      }

      const previousJobs = jobs;
      setMovingJobId(activeId);
      ensureDayExpanded(targetDay.id);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === activeId
            ? { ...j, start_time: shifted.start_time, end_time: shifted.end_time }
            : j
        )
      );

      try {
        const res = await fetch("/api/jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: activeId, moveToDate: targetDay.iso }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setJobs(previousJobs);
          throw new Error(
            typeof data?.error === "string" ? data.error : "Failed to move tour"
          );
        }
        toast.success(`Moved to Day ${targetDay.dayNumber}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to move tour");
      } finally {
        setMovingJobId(null);
      }
    },
    [
      ensureDayExpanded,
      findDayForJobId,
      jobs,
      resolveTargetDay,
      setJobs,
    ]
  );

  const activeJob = activeJobId
    ? jobs.find((j) => j.id === activeJobId) ?? null
    : null;

  return {
    activeJobId,
    activeJob,
    overDayIso,
    movingJobId,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
