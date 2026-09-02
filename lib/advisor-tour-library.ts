/** Catalog tour detail lives in Tour Library (modal opened via ?tourId=). */
export function advisorTourLibraryHref(
  tourId: string | number,
  opts?: { pathname?: string | null; role?: string | null }
): string {
  const path = opts?.pathname || "";
  const role = opts?.role || "";
  const base =
    path.startsWith("/agency") || role === "agency"
      ? "/agency/tour-library"
      : "/agent/tour-library";
  return `${base}?tourId=${encodeURIComponent(String(tourId))}`;
}

export function parseTourIdParam(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}
