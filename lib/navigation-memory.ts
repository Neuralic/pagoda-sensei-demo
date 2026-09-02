const LAST_ITINERARY_HREF_KEY = "pagoda_last_itinerary_href";

/** Same-origin app path only (query string allowed). */
export function isSafeAppPath(path: string | null | undefined): path is string {
  if (!path) return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return false;
  if (trimmed.includes("://")) return false;
  return true;
}

export function rememberItineraryHref(href: string) {
  if (typeof window === "undefined" || !isSafeAppPath(href)) return;
  try {
    sessionStorage.setItem(LAST_ITINERARY_HREF_KEY, href);
  } catch {
    // ignore quota / private mode
  }
}

export function readRememberedItineraryHref(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(LAST_ITINERARY_HREF_KEY);
    return isSafeAppPath(v) ? v : null;
  } catch {
    return null;
  }
}

export function conversationHomeFallback(role: string | null | undefined): string {
  if (role === "guide") return "/guide/landing";
  if (role === "agency") return "/agency/itineraries";
  if (role === "admin") return "/admin";
  return "/agent/itineraries";
}

/**
 * Prefer the page the user came from (itinerary), then last itinerary in this tab,
 * then the role home — never rely on history.back() after login/impersonation.
 */
export function resolveConversationBackHref(opts: {
  fromParam?: string | null;
  itineraryIdParam?: string | null;
  role?: string | null;
  pathname?: string | null;
}): string {
  if (isSafeAppPath(opts.fromParam)) return opts.fromParam;

  const itineraryId = String(opts.itineraryIdParam || "").trim();
  if (itineraryId) {
    const path = opts.pathname || "";
    const base = path.startsWith("/agency")
      ? "/agency/edit-itinerary"
      : path.startsWith("/admin")
        ? `/admin/itineraries/${encodeURIComponent(itineraryId)}/edit`
        : "/agent/edit-itinerary";
    if (base.includes("/admin/itineraries/")) return base;
    return `${base}?itineraryId=${encodeURIComponent(itineraryId)}`;
  }

  const remembered = readRememberedItineraryHref();
  if (remembered) return remembered;

  return conversationHomeFallback(opts.role);
}
