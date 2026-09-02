/** Fired after any profile section saves so completeness & public URL stay in sync. */
export const PROFILE_UPDATED_EVENT = "pagoda-profile-updated";

export function notifyProfileUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
  }
}

/** In-app path to a guide's public profile page. */
export function buildPublicProfilePath(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  return `/g/${slug.trim()}`;
}

/** Build a shareable /g/{slug} URL; uses current origin when env is unset (client only). */
export function buildPublicProfileUrl(
  slug: string | null | undefined,
  opts?: { published?: boolean; origin?: string }
): string | null {
  if (!slug?.trim()) return null;
  if (opts?.published === false) return null;
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    opts?.origin?.replace(/\/$/, "") ||
    "";
  if (!base) return `/g/${slug}`;
  return `${base}/g/${slug}`;
}
