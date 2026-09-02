"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { MapPin, Clock, Users, Calendar, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { normalizeJobImagePaths, signJobOrTourImagePaths } from "@/lib/job-tour-image-sign";

interface JobDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  /** Optional pre-filled title for immediate display while loading */
  initialTitle?: string;
  /** Optional signed image URL from the card (avoids extra signing in modal) */
  imageUrl?: string;
}

interface JobData {
  id: string;
  name: string;
  location?: string | null;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  group_size?: number | string | null;
  languages?: string | string[] | null;
  images?: string[] | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function formatDuration(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    const min = Math.round((e - s) / 60000);
    if (min >= 60) return `${(min / 60).toFixed(1)} hours`;
    return `${min} min`;
  } catch {
    return "";
  }
}

export function JobDescriptionModal({
  isOpen,
  onClose,
  jobId,
  initialTitle,
  imageUrl: initialImageUrl,
}: JobDescriptionModalProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !jobId) {
      setJob(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/jobs?jobId=${encodeURIComponent(jobId)}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.job) {
          setError(data?.error || "Could not load job");
          setJob(null);
          return;
        }
        setJob(data.job as JobData);
      })
      .catch(() => {
        setError("Failed to load job details");
        setJob(null);
      })
      .finally(() => setLoading(false));
  }, [isOpen, jobId]);

  // Fetch signed URLs for all job images (storage paths only)
  useEffect(() => {
    const paths = normalizeJobImagePaths(job?.images);
    if (!paths.length) {
      setSignedImageUrls({});
      return;
    }
    let cancelled = false;
    signJobOrTourImagePaths(paths)
      .then((map) => {
        if (!cancelled) setSignedImageUrls(map);
      })
      .catch(() => {
        if (!cancelled) setSignedImageUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.images]);

  const handleGoToConversation = () => {
    onClose();
    router.push(`/guide/conversation?jobId=${encodeURIComponent(jobId)}`);
  };

  const languages = useMemo(() => {
    if (!job?.languages) return [];
    const raw = job.languages;
    if (Array.isArray(raw)) {
      return raw.map((l) => (typeof l === "string" ? l.trim() : String(l))).filter(Boolean);
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (Array.isArray(parsed)) {
            return parsed.map((l) => (typeof l === "string" ? l.trim() : String(l))).filter(Boolean);
          }
        } catch {
          // fall through to comma split
        }
      }
      return trimmed.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    return [];
  }, [job?.languages]);

  // Build display URL for each image: use initialImageUrl for first if provided, else signed or raw URL or placeholder
  const allImageUrls = useMemo(() => {
    if (!job?.images?.length) {
      if (initialImageUrl) return [initialImageUrl];
      return [];
    }
    return job.images.map((path, i) => {
      if (i === 0 && initialImageUrl) return initialImageUrl;
      if (typeof path !== "string" || !path) return "/assets/placeholder.svg";
      if (path.startsWith("http") || path.startsWith("/")) return path;
      return signedImageUrls[path] || "/assets/placeholder.svg";
    });
  }, [job?.images, initialImageUrl, signedImageUrls]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0 bg-background shadow-xl rounded-2xl border border-border">
        {loading && (
          <div className="py-16 px-3 text-center text-muted-foreground">
            Loading job details…
          </div>
        )}
        {error && !loading && (
          <div className="py-16 px-3 text-center text-destructive">{error}</div>
        )}
        {job && !loading && (
          <>
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-3 pt-3 pb-2 relative">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight pr-10">
                  {job.name || initialTitle || "Job"}
                </h2>
                <DialogClose className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </DialogClose>
              </div>
              <div className="px-3 pb-2">
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/40 border border-border/50">
                  {job.location && (
                    <div className="flex items-center gap-2.5 text-sm text-foreground">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span>{job.location}</span>
                    </div>
                  )}
                  {job.start_time && job.end_time && (
                    <div className="flex items-center gap-2.5 text-sm text-foreground">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Clock className="h-4 w-4" />
                      </div>
                      <span>{formatDuration(job.start_time, job.end_time)}</span>
                    </div>
                  )}
                  {(job.group_size != null && job.group_size !== "") && (
                    <div className="flex items-center gap-2.5 text-sm text-foreground">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                      </div>
                      <span>Up to {String(job.group_size)} people</span>
                    </div>
                  )}
                  {job.start_time && (
                    <div className="flex items-center gap-2.5 text-sm text-foreground col-span-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <span>
                        {formatDate(job.start_time)}
                        {job.end_time
                          ? ` · ${formatTime(job.start_time)} – ${formatTime(job.end_time)}`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {languages.length > 0 && (
                <div className="px-3 pb-2">
                  <div className="flex flex-wrap gap-2">
                    {languages.map((lang, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium"
                      >
                        {typeof lang === "string" ? lang : String(lang)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-3 pb-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Job description</h3>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-line rounded-xl border border-border/50 bg-muted/20 p-3">
                  {job.description?.trim()
                    ? job.description.trim()
                    : "No description provided."}
                </div>
              </div>

              {/* Gallery: all images */}
              {allImageUrls.length > 0 && (
                <div className="px-3 pb-3">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">
                    Photos {allImageUrls.length > 1 ? `(${allImageUrls.length})` : ""}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {allImageUrls.map((src, i) => (
                      <div
                        key={i}
                        className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted border border-border/50"
                      >
                        <Image
                          src={src}
                          alt={`${job.name || "Job"} photo ${i + 1}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, 33vw"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className="shrink-0 flex justify-end gap-3 px-3 py-3 border-t border-border bg-muted/20 rounded-b-2xl">
              <Button variant="outline" onClick={onClose} className="cursor-pointer">
                Close
              </Button>
              <Button
                onClick={handleGoToConversation}
                className="bg-[#D4AA25] hover:bg-[#D4AA25]/90 text-white cursor-pointer gap-2 shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Go to conversation
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
