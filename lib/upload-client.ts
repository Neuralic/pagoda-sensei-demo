export type ClientUploadOptions = {
  bucket: string
  folder?: string
  signed?: boolean
  expiresIn?: number // seconds
}

export type ClientUploadedFile = {
  name: string
  size: number
  type: string
  path: string
  publicUrl: string | null
  signedUrl: string | null
}

export type ClientCopyOptions = {
  sourceBucket: string
  destinationBucket: string
  paths: string | string[]
  destinationFolder?: string
}

export type ClientCopyResult = {
  path: string
  success: boolean
  error?: string
}

export type ClientCopyResponse = {
  success: boolean
  copied: number
  failed: number
  results: ClientCopyResult[]
}

export async function uploadViaApi(
  files: File | File[] | FileList,
  opts: ClientUploadOptions
): Promise<ClientUploadedFile[]> {
  // Normalize files to array
  const fileArray: File[] = []
  if (files instanceof File) {
    fileArray.push(files)
  } else if (files instanceof FileList) {
    fileArray.push(...Array.from(files))
  } else {
    fileArray.push(...files)
  }

  if (fileArray.length === 0) {
    throw new Error('No files provided')
  }

  // Vercel has a 4.5MB body size limit for serverless functions
  // FormData has significant overhead (boundaries, field names, etc.), so we use 2.5MB as a safe threshold
  // This accounts for ~2MB of FormData overhead to ensure we stay well under the limit
  // Files over 2.5MB will always be uploaded individually
  const VERCEL_SAFE_LIMIT = 2.5 * 1024 * 1024 // 2.5MB (accounts for FormData overhead)
  const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0)
  const maxFileSize = Math.max(...fileArray.map(f => f.size))

  // Upload files one at a time if:
  // 1. Any single file exceeds safe limit (FormData overhead could push it over 4.5MB)
  // 2. Multiple files and total exceeds safe limit
  if (maxFileSize > VERCEL_SAFE_LIMIT || (fileArray.length > 1 && totalSize > VERCEL_SAFE_LIMIT)) {
    const results: ClientUploadedFile[] = []
    for (const file of fileArray) {
      const fd = new FormData()
      fd.append('bucket', opts.bucket)
      if (opts.folder) fd.append('folder', opts.folder)
      if (opts.signed) fd.append('signed', String(Boolean(opts.signed)))
      if (opts.expiresIn) fd.append('expiresIn', String(opts.expiresIn))
      fd.append('file', file)

      const res = await fetch('/api/upload', { 
        method: 'POST', 
        body: fd,
        credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
      })
      
      if (!res.ok) {
        let errorMessage = 'Upload failed'
        try {
          const data = await res.json()
          errorMessage = data?.error || errorMessage
          
          // Provide more specific error messages based on status code
          if (res.status === 401) {
            errorMessage = 'Authentication failed. Please log in and try again.'
          } else if (res.status === 413 || errorMessage.includes('too large') || errorMessage.includes('PayloadTooLarge')) {
            errorMessage = `File "${file.name}" is too large. Please reduce file size.`
          } else if (res.status === 400) {
            errorMessage = data?.error || `Invalid upload request for "${file.name}".`
          }
        } catch {
          // If JSON parsing fails, use status-based messages
          if (res.status === 413) {
            errorMessage = `File "${file.name}" is too large. Please reduce file size.`
          } else if (res.status === 401) {
            errorMessage = 'Authentication failed. Please log in and try again.'
          } else if (res.status >= 500) {
            errorMessage = 'Server error. Please try again later.'
          }
        }
        throw new Error(errorMessage)
      }
      
      const data = (await res.json()) as { files: ClientUploadedFile[] }
      results.push(...data.files)
    }
    return results
  }

  // Upload all files at once if total size is within safe limit
  const fd = new FormData()
  fd.append('bucket', opts.bucket)
  if (opts.folder) fd.append('folder', opts.folder)
  if (opts.signed) fd.append('signed', String(Boolean(opts.signed)))
  if (opts.expiresIn) fd.append('expiresIn', String(opts.expiresIn))

  if (fileArray.length === 1) {
    fd.append('file', fileArray[0])
  } else {
    fileArray.forEach((f) => fd.append('files', f))
  }

  const res = await fetch('/api/upload', { 
    method: 'POST', 
    body: fd,
    credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
  })
  
  if (!res.ok) {
    let errorMessage = 'Upload failed'
    try {
      const data = await res.json()
      errorMessage = data?.error || errorMessage
      
      // Provide more specific error messages based on status code
      if (res.status === 401) {
        errorMessage = 'Authentication failed. Please log in and try again.'
      } else if (res.status === 413 || errorMessage.includes('too large') || errorMessage.includes('PayloadTooLarge')) {
        errorMessage = 'File size too large. Please reduce file size or upload fewer files at once.'
      } else if (res.status === 400) {
        errorMessage = data?.error || 'Invalid upload request. Please check your files and try again.'
      }
    } catch {
      // If JSON parsing fails, use status-based messages
      if (res.status === 413) {
        errorMessage = 'File size too large. Please reduce file size or upload fewer files at once.'
      } else if (res.status === 401) {
        errorMessage = 'Authentication failed. Please log in and try again.'
      } else if (res.status >= 500) {
        errorMessage = 'Server error. Please try again later.'
      }
    }
    throw new Error(errorMessage)
  }
  
  const data = (await res.json()) as { files: ClientUploadedFile[] }
  return data.files
}

export async function copyFilesBetweenBuckets(
  opts: ClientCopyOptions
): Promise<ClientCopyResponse> {
  const res = await fetch('/api/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceBucket: opts.sourceBucket,
      destinationBucket: opts.destinationBucket,
      paths: Array.isArray(opts.paths) ? opts.paths : [opts.paths],
      destinationFolder: opts.destinationFolder,
    }),
    credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || 'Copy failed')
  }

  const data = (await res.json()) as ClientCopyResponse
  return data
}
