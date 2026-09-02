"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"
import { uploadViaApi } from "@/lib/upload-client"
import { BUCKETS } from "@/lib/buckets"
import { useEffect } from "react"
import { getSignedUrls } from "@/lib/storage-sign-client"
import Image from "next/image"

const MAX_IMAGES = 10

export default function IntroPhotos() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<{ name: string; url: string | null; path: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load existing intro photos on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        const data = await res.json()
        const paths: string[] | undefined = data?.profile?.intro_photos_paths
        if (!cancelled && Array.isArray(paths) && paths.length) {
          const signed = await getSignedUrls(paths.map((p: string) => ({ bucket: BUCKETS.introPhotos, path: p })))
          setImages(signed.map((s) => ({ name: s.path.split('/').pop() || s.path, url: s.signedUrl || s.publicUrl, path: s.path })))
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

  async function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const currentCount = images.length
      const newCount = files.length
      const totalCount = currentCount + newCount

      if (totalCount > MAX_IMAGES) {
        throw new Error(`You can only upload up to ${MAX_IMAGES} photos. You currently have ${currentCount} and are trying to add ${newCount}. Please remove some photos first or select fewer files.`)
      }

      const results = await uploadViaApi(files, {
        bucket: BUCKETS.introPhotos,
        folder: "profiles/intro-photos",
        signed: true,
        expiresIn: 60 * 60 * 24 * 7,
      })

      // Append new images to existing ones instead of replacing
      const newImages = results.map((r) => ({ name: r.name, url: r.signedUrl || r.publicUrl, path: r.path }))
      const updatedImages = [...images, ...newImages]

      // Save all image paths to profile
      await fetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ intro_photos_paths: updatedImages.map((img) => img.path) }),
      })

      setImages(updatedImages)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed"
      setError(msg)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleDeleteImage(indexToDelete: number) {
    try {
      const imageToDelete = images[indexToDelete]
      const updatedImages = images.filter((_, index) => index !== indexToDelete)

      // Update profile with remaining image paths
      await fetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ intro_photos_paths: updatedImages.map((img) => img.path) }),
      })

      setImages(updatedImages)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete image"
      setError(msg)
    }
  }

  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Tour Gallery</h2>

      <div className="border-2 border-dashed border-border rounded-lg p-6 md:p-12 text-center">
        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {images.map((img, index) => (
              <div key={img.path} className="relative w-full h-28 rounded overflow-hidden group">
                <Image
                  src={img.url ?? ''}
                  alt={img.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
                <button
                  onClick={() => handleDeleteImage(index)}
                  className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {images.length === 0 && (
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        )}
        
        <h3 className="text-lg font-semibold text-foreground mb-2">Upload Tour Photos</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add up to {MAX_IMAGES} photos that will be displayed on your public profile (Max 20MB each)
          {images.length > 0 && (
            <span className="block mt-1 font-medium text-foreground">
              {images.length}/{MAX_IMAGES} photos uploaded
            </span>
          )}
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <Button 
          onClick={handlePick} 
          disabled={uploading || images.length >= MAX_IMAGES} 
          className="cursor-pointer"
        >
          {uploading ? "Uploading…" : images.length >= MAX_IMAGES ? "Maximum photos reached" : "Choose Photos"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onFilesChange}
        />
      </div>
    </Card>
  )
}
