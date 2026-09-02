import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { uploadManyToStorage, uploadToStorage } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large uploads (Vercel requirement)

export async function POST(request: Request) {
  try {
    // Check authentication
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ 
        error: 'Not authenticated. Please log in to upload files. If you are logged in, try refreshing the page.' 
      }, { status: 401 })
    }

    const form = await request.formData()

    const bucket = String(form.get('bucket') ?? '')
    if (!bucket) {
      return NextResponse.json({ error: 'Missing bucket' }, { status: 400 })
    }

    const folder = form.get('folder')?.toString() || undefined
    const createSignedUrl = form.get('signed')?.toString() === 'true'
    const expiresIn = Number(form.get('expiresIn') ?? 0) || undefined

    // Support both single and multiple inputs: 'file' and 'files'
    const fileEntries: File[] = []
    const single = form.get('file')
    if (single instanceof File) fileEntries.push(single)
    const multiples = form.getAll('files')
    for (const m of multiples) if (m instanceof File) fileEntries.push(m)

    if (!fileEntries.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Validate total request size (Vercel has 4.5MB limit for serverless functions)
    // We'll check individual file sizes and warn if total might be too large
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file (matches frontend validation)
    const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024 // 4.5MB Vercel limit
    let totalSize = 0
    for (const file of fileEntries) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ 
          error: `File "${file.name}" exceeds maximum size of 10MB` 
        }, { status: 400 })
      }
      totalSize += file.size
    }

    // Warn if approaching Vercel limit (but allow it - FormData overhead means actual limit is lower)
    if (totalSize > VERCEL_BODY_LIMIT * 0.9) {
      console.warn(`Upload request size (${(totalSize / 1024 / 1024).toFixed(2)}MB) approaching Vercel limit`)
    }

    // Upload
    if (fileEntries.length === 1) {
      const file = fileEntries[0] as File
      const result = await uploadToStorage(file, {
        bucket,
        folder,
        contentType: file.type,
        createSignedUrl,
        signedUrlExpiresIn: expiresIn,
      })
      return NextResponse.json({ files: [decorate(file, result)] })
    }

    const results = await uploadManyToStorage(fileEntries, {
      bucket,
      folder,
      createSignedUrl,
      signedUrlExpiresIn: expiresIn,
    })
    return NextResponse.json({ files: results.map((r, i) => decorate(fileEntries[i], r)) })
  } catch (e: unknown) {
    console.error('[upload] error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    // Provide more specific error messages
    if (msg.includes('413') || msg.includes('PayloadTooLarge') || msg.includes('request entity too large')) {
      return NextResponse.json({ 
        error: 'File size too large. Please reduce file size or upload fewer files at once.' 
      }, { status: 413 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function decorate(file: File, res: { path: string; publicUrl: string | null; signedUrl: string | null }) {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    path: res.path,
    publicUrl: res.publicUrl,
    signedUrl: res.signedUrl,
  }
}
