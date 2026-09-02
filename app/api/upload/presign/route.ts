import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function buildPath(folder: string | undefined, filename: string) {
  return folder ? `${folder.replace(/\/$/, "")}/${filename}` : filename
}

export async function POST(request: Request) {
  try {
    // Check authentication
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated. Please log in to upload videos.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const bucket = String(body.bucket || '')
    const folder = body.folder?.toString() || undefined
    const filename = body.filename?.toString()
    const originalName = body.originalName?.toString() || 'upload'

    if (!bucket) {
      return NextResponse.json({ error: 'Missing bucket' }, { status: 400 })
    }

    // Generate file path
    const timestamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const base = filename || `${timestamp}-${rand}-${sanitizeFilename(originalName)}`
    const path = buildPath(folder, base)

    // Ensure bucket exists
    const supabase = getSupabaseServer()
    const { data } = await supabase.storage.getBucket(bucket)
    if (!data) {
      const { error: createErr } = await supabase.storage.createBucket(bucket, {
        public: true,
      })
      if (createErr && !createErr.message?.includes('already exists')) {
        return NextResponse.json({ error: `Failed to ensure bucket exists: ${createErr.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      path,
      bucket,
      uploadUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to generate upload path'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

