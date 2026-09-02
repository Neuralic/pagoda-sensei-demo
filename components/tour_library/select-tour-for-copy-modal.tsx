"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, MapPin, Clock, Copy } from "lucide-react";
import Image from "next/image";
import { Tour } from "@/app/types";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";

interface SelectTourForCopyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tours: Tour[];
  onSelectTour: (tour: Tour) => void;
}

function getFirstImagePath(image: string): string | null {
  if (!image || !image.trim()) return null;
  try {
    const parsed = JSON.parse(image);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") return parsed[0];
    if (typeof parsed === "string") return parsed;
  } catch {
    return image;
  }
  return null;
}

export function SelectTourForCopyModal({
  open,
  onOpenChange,
  tours,
  onSelectTour,
}: SelectTourForCopyModalProps) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || tours.length === 0) return;
    let mounted = true;
    const loadUrls = async () => {
      const pathToTourId: Record<string, string> = {};
      tours.forEach((t) => {
        const path = getFirstImagePath(t.image);
        if (path) pathToTourId[path] = t.id;
      });
      const paths = Object.keys(pathToTourId);
      if (paths.length === 0) return;
      try {
        const results = await getSignedUrls(
          paths.map((path) => ({ bucket: BUCKETS.tours, path }))
        );
        const next: Record<string, string> = {};
        results.forEach((r, i) => {
          const path = paths[i];
          const tourId = pathToTourId[path];
          if (tourId && r?.signedUrl) next[tourId] = r.signedUrl;
          else if (tourId && r?.publicUrl) next[tourId] = r.publicUrl;
        });
        if (mounted) setImageUrls((prev) => ({ ...prev, ...next }));
      } catch (e) {
        console.error("Error loading tour images:", e);
      }
    };
    loadUrls();
    return () => { mounted = false; };
  }, [open, tours]);

  const handleSelect = (tour: Tour) => {
    onSelectTour(tour);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0
          [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]"
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <DialogHeader className="flex flex-col items-center justify-center text-center pt-8 pb-4 px-6 border-b">
          <h1 className="text-2xl font-bold">Create from existing tour</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select a tour to use as a base, then customize and save as a new tour
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tours.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No tours available to copy.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tours.map((tour) => (
                <div
                  key={tour.id}
                  className="border border-border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="relative h-40 w-full bg-muted shrink-0">
                    <Image
                      src={imageUrls[tour.id] || "/assets/images/profile/placeholder.svg"}
                      alt={tour.title || tour.name || "Tour"}
                      fill
                      className="object-cover"
                      onError={(e) => {
                        const t = e.target as HTMLImageElement;
                        t.src = "/assets/images/profile/placeholder.svg";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 text-white">
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {tour.title || tour.name || "Untitled tour"}
                      </h3>
                      <span className="text-xs opacity-90">{tour.country}</span>
                    </div>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {tour.location}
                      </span>
                      {tour.duration && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {tour.duration}
                        </span>
                      )}
                    </div>
                    {tour.activity_type && (
                      <div className="text-xs font-medium text-[#48515E] bg-[#D6E7FE] w-fit px-2 py-0.5 rounded">
                        {tour.activity_type}
                      </div>
                    )}
                    {tour.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3 flex-1">
                        {tour.description}
                      </p>
                    )}
                    {tour.displayPrice != null && Number.isFinite(tour.displayPrice) && (
                      <p className="text-sm font-medium">
                        {tour.priceLabel ?? "Price"}: ¥{Number(tour.displayPrice).toLocaleString()}
                      </p>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleSelect(tour)}
                      className="w-full mt-2 bg-[#D4AA25] hover:bg-[#C49A1F] text-white cursor-pointer gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Use this tour & customize
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
