import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireSessionActor } from "@/lib/itinerary-access";
import { BUCKETS } from "@/lib/buckets";
import { badRequest } from "@/lib/api-response";

export const runtime = "nodejs";

type Item = { bucket: string; path: string; expiresIn?: number };

/**
 * Buckets a signed-in user may request URLs for.
 *
 * This endpoint had no authentication, no bucket restriction, and let the caller choose the
 * expiry — so anyone could mint a year-long URL for any object in any bucket. It now requires
 * a session, fixes the lifetime server-side, and only signs buckets the app renders.
 *
 * `documents` stays in the list because chat attachments and certification files genuinely go
 * through here. That leaves a signed-in user able to sign any document path they can name;
 * paths carry random segments so they are not guessable, and the leaks that made them
 * enumerable are closed. Closing it properly means per-object ownership checks at upload time,
 * which is a larger change than this one.
 */
const SIGNABLE_BUCKETS: ReadonlySet<string> = new Set([
  BUCKETS.avatars,
  BUCKETS.coverImages,
  BUCKETS.introPhotos,
  BUCKETS.introVideos,
  BUCKETS.itineraries,
  BUCKETS.jobs,
  BUCKETS.tours,
  BUCKETS.documents,
]);

/** Server-controlled lifetime. The caller used to set this and could ask for years. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Block traversal and absolute paths before they reach storage. */
function isSafeObjectPath(path: string): boolean {
  if (!path || path.length > 1024) return false;
  if (path.startsWith("/") || path.includes("..")) return false;
  return true;
}

type CacheEntry = { signedUrl: string | null; publicUrl: string | null; expiresAtMs: number };

// Best-effort in-memory cache per Node process.
// Helps a lot for pages that repeatedly request the same signed URLs (edit-itinerary, PDF, avatars).
const SIGN_CACHE = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 8000;

function cacheKey(bucket: string, path: string, expires: number) {
  return `${bucket}::${path}::${expires}`;
}

function getCached(bucket: string, path: string, expires: number): CacheEntry | null {
  const key = cacheKey(bucket, path, expires);
  const hit = SIGN_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAtMs) {
    SIGN_CACHE.delete(key);
    return null;
  }
  return hit;
}

function setCached(bucket: string, path: string, expires: number, entry: CacheEntry) {
  const key = cacheKey(bucket, path, expires);
  SIGN_CACHE.set(key, entry);
  // crude cap; avoid unbounded memory
  if (SIGN_CACHE.size > MAX_CACHE_ENTRIES) {
    const toDelete = Math.ceil(MAX_CACHE_ENTRIES * 0.15);
    let i = 0;
    for (const k of SIGN_CACHE.keys()) {
      SIGN_CACHE.delete(k);
      if (++i >= toDelete) break;
    }
  }
}

/** Max objects per request — one itinerary's worth of images, not a bucket crawl. */
const MAX_ITEMS_PER_REQUEST = 200;

export async function POST(req: Request) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const body = (await req.json().catch(() => ({}))) as {
      items?: Item[];
      requests?: Item[];
    };
    const items = body.items || body.requests || [];
    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      return badRequest(`Too many items — request at most ${MAX_ITEMS_PER_REQUEST} at a time.`);
    }

    const supabase = getSupabaseServer();

    // De-dupe requests but preserve response order. Anything outside the allow-list resolves
    // to nulls rather than an error, so one bad path cannot fail a whole page's images.
    const normalized = items.map((it) => {
      const bucket = String(it.bucket || "");
      const path = String(it.path || "");
      const allowed = SIGNABLE_BUCKETS.has(bucket) && isSafeObjectPath(path);
      return { bucket, path, expires: SIGNED_URL_TTL_SECONDS, allowed };
    });

    const uniqueKeys = new Map<string, { bucket: string; path: string; expires: number }>();
    for (const it of normalized) {
      if (!it.bucket || !it.path || !it.allowed) continue;
      const k = cacheKey(it.bucket, it.path, it.expires);
      if (!uniqueKeys.has(k)) uniqueKeys.set(k, it);
    }

    // Sign all unique URLs in parallel for better performance
    const resolvedByKey = new Map<string, { bucket: string; path: string; publicUrl: string | null; signedUrl: string | null }>();
    const signingPromises = Array.from(uniqueKeys.entries()).map(async ([key, it]) => {
      const bucket = String(it.bucket || "");
      const path = String(it.path || "");
      if (!bucket || !path) {
        resolvedByKey.set(key, { bucket, path, publicUrl: null, signedUrl: null });
        return;
      }

      const expires = it.expires;

      const cached = getCached(bucket, path, expires);
      if (cached) {
        resolvedByKey.set(key, { bucket, path, publicUrl: cached.publicUrl, signedUrl: cached.signedUrl });
        return;
      }

      // Always compute public URL and also provide a signed URL so the client can choose
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      let signedUrl: string | null = null;
      
      try {
        const { data: signed, error: sErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expires);
        if (!sErr) {
          signedUrl = signed?.signedUrl ?? null;
        } else {
          // Don't log 404 errors - they're expected when trying different buckets
          const errorStatus = (sErr as any).statusCode || (sErr as any).status;
          if (errorStatus !== "404" && errorStatus !== 404) {
            console.error("Error signing URL:", sErr);
          }
        }
      } catch (err) {
        // Silently handle errors for individual URLs
        console.error("Error signing URL:", err);
      }

      const entry = {
        publicUrl: pub?.publicUrl ?? null,
        signedUrl,
      };
      resolvedByKey.set(key, { bucket, path, ...entry });
      // Cache for slightly less than expiry to reduce edge misses
      setCached(bucket, path, expires, {
        ...entry,
        expiresAtMs: Date.now() + Math.max(1, expires - 30) * 1000,
      });
    });

    await Promise.all(signingPromises);

    const out = normalized.map((it) => {
      const bucket = it.bucket;
      const path = it.path;
      const expires = it.expires;
      if (!bucket || !path || !it.allowed) {
        return { bucket, path, publicUrl: null, signedUrl: null };
      }
      const key = cacheKey(bucket, path, expires);
      const r = resolvedByKey.get(key);
      return r ? { bucket, path, publicUrl: r.publicUrl, signedUrl: r.signedUrl } : { bucket, path, publicUrl: null, signedUrl: null };
    });

    return NextResponse.json({ items: out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to sign URLs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
