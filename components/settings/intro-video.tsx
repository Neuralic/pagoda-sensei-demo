"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { BUCKETS } from "@/lib/buckets"
import { getSignedUrls } from "@/lib/storage-sign-client"

export default function IntroVideo() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [videoName, setVideoName] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load existing intro video on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        const data = await res.json()
        const path: string | undefined = data?.profile?.intro_video_path
        if (!cancelled && typeof path === 'string' && path) {
          const [u] = await getSignedUrls([{ bucket: BUCKETS.introVideos, path }])
          setVideoUrl(u?.signedUrl || u?.publicUrl || null)
          setVideoName(path.split('/').pop() || 'video')
        }
      } catch {
        // ignore
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function handlePick() {
    inputRef.current?.click()
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    setUploadProgress(0)
    
    try {
      // Validation
      if (!file.type.startsWith("video/")) {
        throw new Error("Please select a video file")
      }
      const max = 100 * 1024 * 1024 // 100MB
      if (file.size > max) {
        throw new Error("Video must be 100MB or less")
      }
      if (file.size === 0) {
        throw new Error("Selected file is empty")
      }
      
      // Upload through server (bypasses RLS issues with direct client uploads)
      // For large files, we'll use chunked uploads
      const CHUNK_SIZE = 3 * 1024 * 1024 // 3MB chunks (under Vercel's 4.5MB limit)
      const useChunkedUpload = file.size > CHUNK_SIZE
      
      let uploadResult: { path: string; signedUrl: string | null; publicUrl: string | null }
      
      if (useChunkedUpload) {
        // Chunked upload for large files
        setUploadProgress(5)
        
        // Step 1: Initialize chunked upload
        const initRes = await fetch('/api/upload/chunk/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket: BUCKETS.introVideos,
            folder: 'profiles/intro-video',
            originalName: file.name,
            contentType: file.type,
            totalSize: file.size,
          }),
          credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
        })
        
        if (!initRes.ok) {
          const errorData = await initRes.json().catch(() => ({}))
          throw new Error(errorData?.error || 'Failed to initialize upload')
        }
        
        const { uploadId, path } = await initRes.json()
        if (!uploadId || !path) {
          throw new Error('Failed to initialize upload')
        }
        
        // Step 2: Upload chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
        let uploadedBytes = 0
        
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const chunk = file.slice(start, end)
          
          const chunkFormData = new FormData()
          chunkFormData.append('chunk', chunk)
          chunkFormData.append('uploadId', uploadId)
          chunkFormData.append('chunkIndex', String(chunkIndex))
          chunkFormData.append('totalChunks', String(totalChunks))
          chunkFormData.append('bucket', BUCKETS.introVideos)
          chunkFormData.append('path', path)
          
          const chunkRes = await fetch('/api/upload/chunk', {
            method: 'POST',
            body: chunkFormData,
            credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
          })
          
          if (!chunkRes.ok) {
            const errorData = await chunkRes.json().catch(() => ({}))
            throw new Error(errorData?.error || `Failed to upload chunk ${chunkIndex + 1}`)
          }
          
          uploadedBytes += chunk.size
          const progress = 10 + Math.round((uploadedBytes / file.size) * 75)
          setUploadProgress(progress)
        }
        
        // Step 3: Finalize upload
        setUploadProgress(90)
        const finalizeRes = await fetch('/api/upload/chunk/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            path,
            bucket: BUCKETS.introVideos,
            totalChunks,
            contentType: file.type,
            createSignedUrl: true,
            expiresIn: 60 * 60 * 24 * 7,
          }),
          credentials: 'include' // Required to send httpOnly cookies (userId) on all browsers/devices
        })
        
        if (!finalizeRes.ok) {
          const errorData = await finalizeRes.json().catch(() => ({}))
          throw new Error(errorData?.error || 'Failed to finalize upload')
        }
        
        const finalizeData = await finalizeRes.json()
        uploadResult = {
          path: finalizeData.path,
          publicUrl: finalizeData.publicUrl,
          signedUrl: finalizeData.signedUrl,
        }
      } else {
        // For smaller files, use the existing API route
        uploadResult = await new Promise<{ path: string; signedUrl: string | null; publicUrl: string | null }>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          const formData = new FormData()
          formData.append('file', file)
          formData.append('bucket', BUCKETS.introVideos)
          formData.append('folder', 'profiles/intro-video')
          formData.append('signed', 'true')
          formData.append('expiresIn', String(60 * 60 * 24 * 7))
          
          // Set timeout for large files (5 minutes)
          const timeout = 5 * 60 * 1000
          let timeoutId: NodeJS.Timeout | null = null
          
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId)
          }
          
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100)
              setUploadProgress(percentComplete)
              
              // Reset timeout on progress
              if (timeoutId) clearTimeout(timeoutId)
              timeoutId = setTimeout(() => {
                xhr.abort()
                cleanup()
                reject(new Error("Upload timeout: File is too large or connection is too slow"))
              }, timeout)
            }
          })
          
          xhr.addEventListener('load', () => {
            cleanup()
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const responseText = xhr.responseText
                if (!responseText) {
                  reject(new Error("Upload failed: Empty response from server"))
                  return
                }
                const data = JSON.parse(responseText) as { files?: Array<{ path: string; signedUrl: string | null; publicUrl: string | null }>; error?: string }
                
                if (data.error) {
                  reject(new Error(data.error))
                  return
                }
                
                if (data.files && data.files.length > 0 && data.files[0]?.path) {
                  resolve(data.files[0])
                } else {
                  reject(new Error("Upload failed: Invalid response format"))
                }
              } catch (parseErr) {
                console.error("Parse error:", parseErr)
                reject(new Error("Upload failed: Could not parse server response"))
              }
            } else {
              try {
                const errorData = JSON.parse(xhr.responseText || '{}')
                reject(new Error(errorData?.error || `Upload failed: Server returned ${xhr.status}`))
              } catch {
                reject(new Error(`Upload failed: ${xhr.statusText || `HTTP ${xhr.status}`}`))
              }
            }
          })
          
          xhr.addEventListener('error', () => {
            cleanup()
            reject(new Error("Upload failed: Network error. Please check your connection and try again."))
          })
          
          xhr.addEventListener('abort', () => {
            cleanup()
            reject(new Error("Upload cancelled"))
          })
          
          xhr.addEventListener('timeout', () => {
            cleanup()
            reject(new Error("Upload timeout: The upload took too long. Please try a smaller file or check your connection."))
          })
          
          // Set request timeout
          xhr.timeout = timeout
          
          // Ensure credentials (cookies) are sent with the request
          xhr.withCredentials = true
          
          try {
            xhr.open('POST', '/api/upload')
            xhr.send(formData)
          } catch (openErr) {
            cleanup()
            reject(new Error("Upload failed: Could not start upload request"))
          }
        })
      }
      
      if (!uploadResult?.path) {
        throw new Error("Upload failed: No file path returned")
      }
      
      setUploadProgress(90) // Show progress while updating profile
      
      // Update profile with new video path (replaces existing video if any)
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intro_video_path: uploadResult.path }),
      })
      
      if (!profileRes.ok) {
        const profileData = await profileRes.json().catch(() => ({}))
        throw new Error(profileData?.error || `Failed to update profile: ${profileRes.status}`)
      }
      
      // Verify the update was successful
      const profileData = await profileRes.json().catch(() => ({}))
      if (!profileData?.ok) {
        throw new Error(profileData?.error || "Failed to save video path to profile")
      }
      
      setUploadProgress(100)
      setVideoName(file.name)
      
      // Get fresh signed URL for the uploaded video
      try {
        const [freshUrl] = await getSignedUrls([{ bucket: BUCKETS.introVideos, path: uploadResult.path }])
        setVideoUrl(freshUrl?.signedUrl || freshUrl?.publicUrl || uploadResult.signedUrl || uploadResult.publicUrl || null)
      } catch (urlErr) {
        // If getting fresh URL fails, use the one from upload
        console.warn("Could not get fresh signed URL, using upload URL:", urlErr)
        setVideoUrl(uploadResult.signedUrl || uploadResult.publicUrl || null)
      }
      const { notifyProfileUpdated } = await import("@/lib/profile-refresh")
      notifyProfileUpdated()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed"
      setError(msg)
      console.error("Video upload error:", err)
      setUploadProgress(0)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 2000)
    }
  }

  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Intro Video</h2>

      <div className="border-2 border-dashed border-border rounded-lg p-6 md:p-12 text-center">
        {videoUrl ? (
          <video src={videoUrl} controls className="mx-auto mb-4 max-h-64 rounded" />
        ) : (
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">Upload Intro Video</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {videoUrl 
            ? "Upload a new video to replace the existing one (Max 100MB)"
            : "Add a short video that will be displayed on your public profile (Max 100MB)"
          }
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {videoName && <p className="text-sm text-foreground mb-2">Uploaded: {videoName}</p>}
        {uploading && (
          <div className="w-full max-w-md mx-auto mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-foreground">Uploading...</span>
              <span className="text-sm font-semibold text-foreground">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        <Button onClick={handlePick} disabled={uploading} className="cursor-pointer">
          {uploading ? "Uploading…" : "Choose Video"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </Card>
  )
}
