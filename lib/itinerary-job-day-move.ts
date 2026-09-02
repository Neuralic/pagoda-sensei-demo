/** YYYY-MM-DD */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Replace the calendar date of an ISO-like timestamp while preserving time + timezone suffix.
 * Handles values like `2026-07-10T09:30:00Z` and `2026-07-10T09:30:00+09:00`.
 */
export function replaceTimestampDate(iso: string, targetDate: string): string | null {
  if (!iso || !DATE_RE.test(targetDate)) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    return `${targetDate}${iso.slice(10)}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${targetDate}T${hh}:${mm}:${ss}.${ms}Z`;
}

export function addCalendarDays(dateISO: string, days: number): string | null {
  if (!DATE_RE.test(dateISO)) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function calendarDayDiff(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Shift an ISO-like timestamp by N calendar days, preserving time + timezone suffix. */
export function shiftTimestampByDays(iso: string, days: number): string | null {
  if (!iso || days === 0) return iso || null;
  const date = iso.slice(0, 10);
  if (!DATE_RE.test(date)) return null;
  const next = addCalendarDays(date, days);
  if (!next) return null;
  return replaceTimestampDate(iso, next);
}

/**
 * Remap day-* keys (and bare YYYY-MM-DD keys) by calendar day delta.
 * Used when duplicating trips_summary / arrival_location / arrival_heading.
 */
export function shiftDayKeyedRecord<T>(
  record: Record<string, T> | null | undefined,
  dayDelta: number
): Record<string, T> | null {
  if (!record || typeof record !== "object") return null;
  if (dayDelta === 0) return { ...record };
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    let datePart: string | null = null;
    let prefix = "";
    if (key.startsWith("day-") && DATE_RE.test(key.slice(4))) {
      prefix = "day-";
      datePart = key.slice(4);
    } else if (DATE_RE.test(key)) {
      datePart = key;
    }
    if (!datePart) {
      out[key] = value;
      continue;
    }
    const next = addCalendarDays(datePart, dayDelta);
    if (!next) {
      out[key] = value;
      continue;
    }
    out[`${prefix}${next}`] = value;
  }
  return out;
}

/**
 * Move a job onto `targetDate`, keeping wall-clock times and multi-day duration span.
 */
export function shiftJobTimestampsToDate(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  targetDate: string
): { start_time: string; end_time: string } | null {
  if (!startTime || !DATE_RE.test(targetDate)) return null;

  const startDate = startTime.slice(0, 10);
  if (!DATE_RE.test(startDate)) return null;

  const newStart = replaceTimestampDate(startTime, targetDate);
  if (!newStart) return null;

  if (!endTime) {
    return { start_time: newStart, end_time: newStart };
  }

  const endDate = endTime.slice(0, 10);
  const spanDays = DATE_RE.test(endDate) ? calendarDayDiff(startDate, endDate) : 0;
  const endTarget = addCalendarDays(targetDate, Math.max(0, spanDays)) ?? targetDate;
  const newEnd = replaceTimestampDate(endTime, endTarget);
  if (!newEnd) return null;

  return { start_time: newStart, end_time: newEnd };
}

export function isMovableItineraryJobId(id: string): boolean {
  return Boolean(id) && !id.startsWith("transferz-") && !id.startsWith("day-");
}
