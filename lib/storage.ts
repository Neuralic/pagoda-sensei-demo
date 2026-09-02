import { getSupabaseServer } from "@/lib/supabaseServer"
import type { SupabaseClient } from "@supabase/supabase-js"

export type UploadOptions = {
  bucket: string
  folder?: string
  filename?: string
  contentType?: string
  createSignedUrl?: boolean
  signedUrlExpiresIn?: number // seconds
}

export type UploadedFile = {
  path: string
  publicUrl: string | null
  signedUrl: string | null
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function buildPath(folder: string | undefined, filename: string) {
  return folder ? `${folder.replace(/\/$/, "")}/${filename}` : filename
}

async function ensureBucketExists(supabase: SupabaseClient, bucket: string) {
  const { data } = await supabase.storage.getBucket(bucket)
  if (!data) {
    // Try to create as public; adjust if you want private buckets by default
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
    })
    if (createErr) {
      // If creation failed (e.g., already exists under race), ignore; upload will surface real errors otherwise
    }
  }
}

export async function uploadToStorage(
  file: File,
  opts: UploadOptions
): Promise<UploadedFile> {
  const supabase = getSupabaseServer()

  // Ensure bucket exists (requires service role key)
  await ensureBucketExists(supabase, opts.bucket)

  const arrayBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)

  const originalName = file.name || "upload"
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const base = opts.filename || `${timestamp}-${rand}-${sanitizeFilename(originalName)}`
  const path = buildPath(opts.folder, base)

  const { error: upErr } = await supabase.storage
    .from(opts.bucket)
    .upload(path, bytes, {
      cacheControl: "3600",
      upsert: true,
  contentType: opts.contentType || file.type || undefined,
    })

  if (upErr) {
    throw new Error(`Upload failed: ${upErr.message}`)
  }

  // Try to get public URL (works if bucket is public)
  const { data: pub } = supabase.storage.from(opts.bucket).getPublicUrl(path)
  const publicUrl: string | null = pub?.publicUrl ?? null

  let signedUrl: string | null = null
  if (opts.createSignedUrl) {
    const { data: signed, error: sErr } = await supabase.storage
      .from(opts.bucket)
      .createSignedUrl(path, opts.signedUrlExpiresIn ?? 60 * 60 * 24 * 7)
    if (!sErr) signedUrl = signed?.signedUrl ?? null
  }

  return { path, publicUrl, signedUrl }
}

export async function uploadManyToStorage(
  files: File[],
  opts: UploadOptions
): Promise<UploadedFile[]> {
  const results: UploadedFile[] = []
  for (const f of files) {
    const res = await uploadToStorage(f, opts)
    results.push(res)
  }
  return results
}
