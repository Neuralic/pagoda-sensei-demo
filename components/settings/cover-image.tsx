"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"
import { uploadViaApi } from "@/lib/upload-client"
import { BUCKETS } from "@/lib/buckets"
import { useEffect } from "react"
import { getSignedUrls } from "@/lib/storage-sign-client"
import Image from "next/image"

export default function CoverImage() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Load existing cover image on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        const data = await res.json()
        const path: string | undefined = data?.profile?.cover_image_path
        if (!cancelled && typeof path === 'string' && path) {
          const [u] = await getSignedUrls([{ bucket: BUCKETS.coverImages, path }])
          setPreviewUrl(u?.signedUrl || u?.publicUrl || null)
        }
      } catch {
        // ignore
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handlePick() {
    inputRef.current?.click()
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file")
      const [res] = await uploadViaApi(file, {
        bucket: BUCKETS.coverImages,
        folder: "profiles/cover",
        signed: true,
        expiresIn: 60 * 60 * 24 * 7,
      })
      // Save storage path to profile
      await fetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ cover_image_path: res.path }),
      })
    // Show preview via signed URL (preferred) or public URL
    setPreviewUrl(res.signedUrl || res.publicUrl || null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed"
      setError(msg)
    } finally {
      setUploading(false)
      // reset value so selecting the same file again triggers change
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Cover Image</h2>

      <div className="border-2 border-dashed border-border rounded-lg p-6 md:p-12 text-center">
        {previewUrl ? (
          <div className="relative w-full h-56 mx-auto mb-4 rounded overflow-hidden">
            <Image
              src={previewUrl}
              alt="Cover"
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ) : (
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">Upload Cover Image</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add a single image that will be displayed as your profile cover
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex items-center justify-center gap-2">
          <Button onClick={handlePick} disabled={uploading} className="cursor-pointer">
            {uploading ? "Uploading…" : "Choose Image"}
          </Button>
          {previewUrl && (
            <Button variant="outline" onClick={() => setPreviewUrl(null)} disabled={uploading}>
              Remove Preview
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </Card>
  )
}
