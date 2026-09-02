import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large uploads

export async function POST(request: Request) {
  try {
    // Check authentication
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated. Please log in to upload videos.' }, { status: 401 })
    }

    const form = await request.formData()
    const chunk = form.get('chunk')
    const uploadId = form.get('uploadId')?.toString()
    const chunkIndex = Number(form.get('chunkIndex') ?? -1)
    const totalChunks = Number(form.get('totalChunks') ?? -1)
    const bucket = form.get('bucket')?.toString()
    const path = form.get('path')?.toString()

    if (!chunk || !(chunk instanceof File) || !uploadId || chunkIndex < 0 || totalChunks < 1 || !bucket || !path) {
      return NextResponse.json({ error: 'Invalid chunk data' }, { status: 400 })
    }

    // Store chunk directly in Supabase Storage as a temporary file
    // This avoids in-memory storage issues across serverless instances
    const supabase = getSupabaseServer()
    const chunkPath = `${path}.chunk.${chunkIndex}`
    
    const chunkData = new Uint8Array(await chunk.arrayBuffer())
    
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(chunkPath, chunkData, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'application/octet-stream',
      })

    if (uploadError) {
      return NextResponse.json({ 
        error: `Failed to upload chunk ${chunkIndex + 1}: ${uploadError.message}` 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      received: chunkIndex + 1,
      total: totalChunks,
      chunkPath,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to upload chunk'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


