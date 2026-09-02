/**
 * Structured server logs for confirm-booking and itinerary drag flows.
 *
 * In Vercel / server logs, grep:
 *   PagodaBooking
 *   PagodaItineraryDrag
 */

import { bookingLog, OPS_LOG_TAGS } from "@/lib/ops-log";

export const BOOKING_LOG_TAG = OPS_LOG_TAGS.booking;
export const DRAG_LOG_TAG = "PagodaItineraryDrag";

type LogLevel = "info" | "warn" | "error";

function writeDrag(tag: string, level: LogLevel, step: string, data: Record<string, unknown>) {
  const line = `[${tag}] ${step} ${JSON.stringify({
    ts: new Date().toISOString(),
    step,
    ...data,
  })}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logBooking(step: string, data: Record<string, unknown> = {}) {
  bookingLog.info(step, data);
}

export function warnBooking(step: string, data: Record<string, unknown> = {}) {
  bookingLog.warn(step, data);
}

export function errorBooking(
  step: string,
  err: unknown,
  data: Record<string, unknown> = {}
) {
  bookingLog.error(step, err, data);
}

export function logItineraryDrag(step: string, data: Record<string, unknown> = {}) {
  writeDrag(DRAG_LOG_TAG, "info", step, data);
}

export function warnItineraryDrag(step: string, data: Record<string, unknown> = {}) {
  writeDrag(DRAG_LOG_TAG, "warn", step, data);
}

export function errorItineraryDrag(
  step: string,
  err: unknown,
  data: Record<string, unknown> = {}
) {
  writeDrag(DRAG_LOG_TAG, "error", step, {
    ...data,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}
