/**
 * Matches `/api/jobs` POST: combine itinerary calendar day + HH:mm into an ISO timestamp (UTC interpretation).
 */
export function utcTimestampFromActivityDateAndHHMM(
  dateISO?: string | null,
  timeHHMM?: string | null
): string | null {
  if (!timeHHMM || typeof timeHHMM !== "string") return null;

  const trimmed = timeHHMM.trim();
  if (!trimmed || !/^\d{2}:\d{2}$/.test(trimmed)) return null;

  const now = new Date();

  let base: Date;
  if (dateISO && typeof dateISO === "string" && dateISO.trim()) {
    try {
      base = new Date(dateISO.trim() + "T00:00:00Z");
      if (isNaN(base.getTime())) {
        base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      }
    } catch {
      base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
  } else {
    base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const [h, m = "0"] = trimmed.split(":");
  const hours = Number(h);
  const minutes = Number(m);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  base.setUTCHours(hours, minutes, 0, 0);

  return base.toISOString();
}

/**
 * From stored local wall times (e.g. Transferz payload) → "HH:MM - HH:MM" for list/sidebar/PDF.
 * Accepts "H:MM" or "HH:MM" on each side.
 */
export function wallTimeRangeLabel(
  start?: string | null,
  end?: string | null
): string | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const a = start.trim().match(/^(\d{1,2}):(\d{2})$/);
  const b = end.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!a || !b) return null;
  const h1 = Number(a[1]);
  const m1 = Number(a[2]);
  const h2 = Number(b[1]);
  const m2 = Number(b[2]);
  if (
    Number.isNaN(h1) ||
    Number.isNaN(m1) ||
    Number.isNaN(h2) ||
    Number.isNaN(m2) ||
    h1 < 0 ||
    h1 > 23 ||
    m1 < 0 ||
    m1 > 59 ||
    h2 < 0 ||
    h2 > 23 ||
    m2 < 0 ||
    m2 > 59
  ) {
    return null;
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h1)}:${pad(m1)} - ${pad(h2)}:${pad(m2)}`;
}

/** Minutes between same-calendar-day HH:mm strings (e.g. duration for display). */
export function minutesBetweenLocalHHMM(
  start: string,
  end: string
): number | null {
  const a = start.trim().match(/^(\d{1,2}):(\d{2})$/);
  const b = end.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!a || !b) return null;
  const t1 = Number(a[1]) * 60 + Number(a[2]);
  const t2 = Number(b[1]) * 60 + Number(b[2]);
  if (t2 < t1) return null;
  return t2 - t1;
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

/**
 * Calendar day (YYYY-MM-DD) from a job timestamp.
 * Prefer the date prefix so naive UTC wall-clock values stay on the itinerary day.
 */
export function jobCalendarDateFromTimestamp(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * HH:MM wall clock as stored on the job (UTC fields).
 * Naive ISO strings (no Z) must not be parsed as the browser’s local timezone —
 * that shifts the left-hand itinerary time by the advisor’s offset after save/refresh.
 */
export function jobWallClockHHMM(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  const hasTz = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) {
    const m = s.match(/[T ](\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const m = s.match(/[T ](\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
  }
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export function jobTimeRangeLabel(
  startIso: string | null | undefined,
  endIso: string | null | undefined
): string | null {
  const a = jobWallClockHHMM(startIso);
  const b = jobWallClockHHMM(endIso);
  if (!a || !b) return null;
  return `${a} - ${b}`;
}
