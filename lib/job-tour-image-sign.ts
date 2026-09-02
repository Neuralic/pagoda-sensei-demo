import { BUCKETS } from "@/lib/buckets";
import { getSignedUrls } from "@/lib/storage-sign-client";

/** Strip optional bucket prefix so `tours/images/x` and `jobs/images/x` resolve as `images/x`. */
export function normalizeStorageObjectPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, "");
  if (trimmed.startsWith(`${BUCKETS.tours}/`)) {
    return trimmed.slice(BUCKETS.tours.length + 1);
  }
  if (trimmed.startsWith(`${BUCKETS.jobs}/`)) {
    return trimmed.slice(BUCKETS.jobs.length + 1);
  }
  if (trimmed.startsWith(`${BUCKETS.itineraries}/`)) {
    return trimmed.slice(BUCKETS.itineraries.length + 1);
  }
  return trimmed;
}

/**
 * Resolve itinerary hero/cover path to a display URL.
 * Accepts signed/public http(s) URLs as-is; otherwise signs via itineraries → jobs → tours.
 */
export async function signItineraryHeroPath(
  image: string | null | undefined
): Promise<string | null> {
  if (!image || typeof image !== "string") return null;
  const trimmed = image.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }

  const path = normalizeStorageObjectPath(trimmed);
  if (!path) return null;

  const buckets = [BUCKETS.itineraries, BUCKETS.jobs, BUCKETS.tours];
  for (const bucket of buckets) {
    try {
      const [result] = await getSignedUrls([{ bucket, path }]);
      if (result?.signedUrl) return result.signedUrl;
    } catch {
      // try next bucket
    }
  }
  return null;
}

export function isResolvableStoragePath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("/")
  );
}

/** Normalize job/tour `images` (array, JSON string, or single path). */
export function normalizeJobImagePaths(images: unknown): string[] {
  const paths: string[] = [];

  const addPath = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (isResolvableStoragePath(trimmed)) {
      paths.push(normalizeStorageObjectPath(trimmed));
      return;
    }
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) parsed.forEach(addPath);
        else if (typeof parsed === "string") addPath(parsed);
      } catch {
        // ignore invalid JSON
      }
    }
  };

  if (!images) return [];
  if (Array.isArray(images)) images.forEach(addPath);
  else addPath(images);

  return [...new Set(paths)];
}

/**
 * Resolve storage paths to signed URLs.
 * Tries `jobs` first, then `tours`, then `itineraries`.
 * Only returns signed URLs — never a bare public URL (private buckets break those).
 */
export async function signJobOrTourImagePaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [
    ...new Set(
      paths
        .filter(isResolvableStoragePath)
        .map(normalizeStorageObjectPath)
        .filter(Boolean)
    ),
  ];
  if (!unique.length) return {};

  const jobResults = await getSignedUrls(
    unique.map((path) => ({ bucket: BUCKETS.jobs, path }))
  );

  const missingPaths = jobResults
    .filter((r) => !r.signedUrl)
    .map((r) => r.path)
    .filter((p): p is string => Boolean(p));

  let tourResults: Awaited<ReturnType<typeof getSignedUrls>> = [];
  if (missingPaths.length > 0) {
    tourResults = await getSignedUrls(
      missingPaths.map((path) => ({ bucket: BUCKETS.tours, path }))
    );
  }

  const stillMissing = tourResults
    .filter((r) => !r.signedUrl)
    .map((r) => r.path)
    .filter((p): p is string => Boolean(p));

  let itineraryResults: Awaited<ReturnType<typeof getSignedUrls>> = [];
  if (stillMissing.length > 0) {
    itineraryResults = await getSignedUrls(
      stillMissing.map((path) => ({ bucket: BUCKETS.itineraries, path }))
    );
  }

  const map: Record<string, string> = {};

  for (const r of jobResults) {
    if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
  }
  for (const r of tourResults) {
    if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
  }
  for (const r of itineraryResults) {
    if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
  }

  return map;
}
