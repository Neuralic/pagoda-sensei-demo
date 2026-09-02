import { NextResponse } from 'next/server'
import { requireSessionActor } from "@/lib/itinerary-access";
import { getSupabaseServer } from '@/lib/supabaseServer'
import { BUCKETS } from '@/lib/buckets'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  // Middleware rejects anonymous callers; this keeps the route correct on its own.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const body = await request.json()
    
    const sourceBucket = body.sourceBucket || body.fromBucket
    const destinationBucket = body.destinationBucket || body.toBucket
    const paths = body.paths || body.path || []
    const destinationFolder = body.destinationFolder || body.folder

    if (!sourceBucket) {
      return NextResponse.json({ error: 'Missing sourceBucket' }, { status: 400 })
    }

    if (!destinationBucket) {
      return NextResponse.json({ error: 'Missing destinationBucket' }, { status: 400 })
    }

    // Validate buckets exist in BUCKETS constant
    const validBuckets = Object.values(BUCKETS)
    if (!validBuckets.includes(sourceBucket)) {
      return NextResponse.json({ error: `Invalid sourceBucket: ${sourceBucket}` }, { status: 400 })
    }
    if (!validBuckets.includes(destinationBucket)) {
      return NextResponse.json({ error: `Invalid destinationBucket: ${destinationBucket}` }, { status: 400 })
    }

    // Normalize paths to array
    const pathArray = Array.isArray(paths) ? paths : paths ? [paths] : []
    if (pathArray.length === 0) {
      return NextResponse.json({ error: 'No paths provided' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const results: Array<{ path: string; success: boolean; error?: string }> = []

    // Copy each file
    for (const sourcePath of pathArray) {
      if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
        results.push({ path: sourcePath, success: false, error: 'Invalid path' })
        continue
      }

      // Build destination path
      const destPath = destinationFolder
        ? `${destinationFolder.replace(/\/$/, '')}/${sourcePath.split('/').pop()}`
        : sourcePath

      try {
        // First, verify the source file exists by trying to get it
        const { data: sourceData, error: sourceError } = await supabase.storage
          .from(sourceBucket)
          .download(sourcePath)

        if (sourceError || !sourceData) {
          // Check if file already exists in destination bucket
          const { data: existing } = await supabase.storage
            .from(destinationBucket)
            .list(destPath.split('/').slice(0, -1).join('/') || '', {
              search: destPath.split('/').pop(),
            })
          
          if (existing && existing.length > 0) {
            results.push({ path: destPath, success: true })
          } else {
            const errorMsg = sourceError?.message || 'Source file not found'
            console.error(`Source file check failed for ${sourcePath}:`, errorMsg)
            results.push({ 
              path: destPath, 
              success: false, 
              error: `Source file not found: ${sourcePath}` 
            })
          }
          continue
        }

        // Convert blob to array buffer for upload
        const arrayBuffer = await sourceData.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)

        // Get content type if possible
        const { data: sourceInfo } = await supabase.storage
          .from(sourceBucket)
          .list(sourcePath.split('/').slice(0, -1).join('/') || '', {
            search: sourcePath.split('/').pop(),
          })
        
        const contentType = sourceInfo && sourceInfo.length > 0 
          ? sourceInfo[0].metadata?.mimetype || undefined
          : undefined

        // Upload to destination bucket
        const { error: uploadError } = await supabase.storage
          .from(destinationBucket)
          .upload(destPath, bytes, {
            cacheControl: '3600',
            upsert: true,
            contentType: contentType,
          })

        if (uploadError) {
          // Check if it's because file already exists (that's okay)
          if (uploadError.message?.includes('already exists') || uploadError.message?.includes('duplicate')) {
            results.push({ path: destPath, success: true })
          } else {
            console.error(`Upload failed for ${destPath}:`, uploadError.message)
            results.push({ 
              path: destPath, 
              success: false, 
              error: uploadError.message || 'Upload failed' 
            })
          }
        } else {
          results.push({ path: destPath, success: true })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Error copying ${sourcePath} to ${destPath}:`, msg)
        results.push({ path: destPath, success: false, error: msg })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length
    return NextResponse.json({
      success: failedCount === 0,
      copied: successCount,
      failed: failedCount,
      results,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Copy failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

