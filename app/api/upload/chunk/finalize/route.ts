import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export async function POST(request: Request) {
  try {
    // Check authentication
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated. Please log in to upload videos.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const uploadId = body.uploadId?.toString()
    const path = body.path?.toString()
    const bucket = body.bucket?.toString()
    const totalChunks = Number(body.totalChunks ?? 0)
    const contentType = body.contentType?.toString() || 'video/mp4'
    const createSignedUrl = body.createSignedUrl === true
    const expiresIn = Number(body.expiresIn ?? 0) || undefined

    if (!uploadId || !path || !bucket || totalChunks < 1) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Download all chunks from Supabase Storage
    const chunks: Uint8Array[] = []
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${path}.chunk.${i}`
      const { data: chunkData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(chunkPath)

      if (downloadError || !chunkData) {
        // Clean up any chunks we've downloaded so far
        for (let j = 0; j < i; j++) {
          const cleanupPath = `${path}.chunk.${j}`
          await supabase.storage.from(bucket).remove([cleanupPath])
        }
        return NextResponse.json({ 
          error: `Failed to download chunk ${i + 1}: ${downloadError?.message || 'Chunk not found'}` 
        }, { status: 500 })
      }

      const arrayBuffer = await chunkData.arrayBuffer()
      chunks.push(new Uint8Array(arrayBuffer))
    }

    // Combine all chunks
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    // Upload combined file to Supabase Storage
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, combined, {
        cacheControl: '3600',
        upsert: true,
        contentType: contentType,
      })

    if (upErr) {
      // Clean up chunks
      const chunkPaths = Array.from({ length: totalChunks }, (_, i) => `${path}.chunk.${i}`)
      await supabase.storage.from(bucket).remove(chunkPaths)
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    }

    // Clean up temporary chunk files
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) => `${path}.chunk.${i}`)
    await supabase.storage.from(bucket).remove(chunkPaths).catch(() => {
      // Ignore cleanup errors
    })

    // Get URLs
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl: string | null = pub?.publicUrl ?? null

    let signedUrl: string | null = null
    if (createSignedUrl) {
      const { data: signed, error: sErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn ?? 60 * 60 * 24 * 7)
      if (!sErr) signedUrl = signed?.signedUrl ?? null
    }

    return NextResponse.json({
      path,
      publicUrl,
      signedUrl,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to finalize upload'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

