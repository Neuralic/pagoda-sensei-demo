"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";

function ImageItem({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-full h-32 md:h-40 rounded-lg overflow-hidden">
      <Image src={src} alt={alt} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
    </div>
  )
}

function VideoItem({ src }: { src: string }) {
  return (
    <div className="relative w-full h-32 md:h-40 rounded-lg overflow-hidden group rounded-xl">
      <video
        src={src}
        className="w-full h-full object-cover"
        controls
        preload="metadata"
      />
      <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
        <div className="bg-white/80 rounded-full p-2">
          <Play className="h-5 w-5 text-black" />
        </div>
      </div>
    </div>
  )
}

interface GallerySectionProps {
  profile?: {
    intro_video_path?: string | null;
    intro_photos_paths?: string[] | null;
  } | null;
}

export function GallerySection({ profile }: GallerySectionProps) {
  const videoPath = profile?.intro_video_path ?? null
  const photoPaths = useMemo(() => (Array.isArray(profile?.intro_photos_paths) ? profile?.intro_photos_paths : []), [profile])

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function signAll() {
      try {
        const promises: Promise<void>[] = []
        if (videoPath) {
          promises.push(
            getSignedUrls([{ bucket: BUCKETS.introVideos, path: videoPath }]).then((r) => {
              if (!cancelled) setVideoUrl(r[0]?.signedUrl || r[0]?.publicUrl || null)
            }) as unknown as Promise<void>
          )
        } else {
          setVideoUrl(null)
        }

        if (photoPaths && photoPaths.length) {
          promises.push(
            getSignedUrls(photoPaths.map((p) => ({ bucket: BUCKETS.introPhotos, path: p }))).then((res) => {
              if (!cancelled) setPhotoUrls(res.map((x) => x.signedUrl || x.publicUrl).filter(Boolean) as string[])
            }) as unknown as Promise<void>
          )
        } else {
          setPhotoUrls([])
        }

        await Promise.all(promises)
      } catch {
        if (!cancelled) {
          setVideoUrl(null)
          setPhotoUrls([])
        }
      }
    }
    signAll()
    return () => {
      cancelled = true
    }
  }, [videoPath, photoPaths])

  return (
    <Card className="border shadow-md mb-10 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-xl">Tour Gallery</CardTitle>
      </CardHeader>
      <CardContent>
        {(!videoUrl && photoUrls.length === 0) ? (
          <p className="text-sm md:text-base text-muted-foreground">No gallery uploaded yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {videoUrl && (
              <div className="">
                <VideoItem src={videoUrl} />
              </div>
            )}
            {photoUrls.map((url, idx) => (
              <ImageItem key={idx} src={url} alt={`Gallery photo ${idx + 1}`} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
