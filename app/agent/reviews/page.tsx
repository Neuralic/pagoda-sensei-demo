"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeaveReviewModal } from "@/components/reviews/leave-review-modal";
import { Calendar, MapPin, JapaneseYen, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Image from "next/image";
import toast from "react-hot-toast";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { supabase } from "@/lib/supabase";

interface PendingReview {
  hiring_history_id: string;
  job_id: string;
  job_name: string;
  job_location: string;
  job_start_time: string;
  job_images: string[] | null;
  review_deadline: string;
  is_closed?: boolean;
  closed_at?: string;
  other_party_id: string;
  final_price: number;
  offer_accepted_at: string;
}

export default function ReviewsPage() {
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<PendingReview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Get current user ID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user", { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json?.ok && json.user?.id) {
          setCurrentUserId(json.user.id);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function fetchPendingReviews() {
      try {
        const res = await fetch("/api/reviews/pending");
        const data = await res.json();

        if (!mountedRef.current) return;

        if (data.ok && Array.isArray(data.pending_reviews)) {
          if (mountedRef.current) {
            setPendingReviews(data.pending_reviews);
          }
          
          // Get signed URLs for all job images
          const imagePaths: string[] = [];
          const jobImageMap: Record<string, string[]> = {};
          
          data.pending_reviews.forEach((job: PendingReview) => {
            if (job.job_images && Array.isArray(job.job_images) && job.job_images.length > 0) {
              job.job_images.forEach((img) => {
                if (typeof img === "string" && img && !img.startsWith("http") && !img.startsWith("/")) {
                  imagePaths.push(img);
                  if (!jobImageMap[job.job_id]) {
                    jobImageMap[job.job_id] = [];
                  }
                  jobImageMap[job.job_id].push(img);
                }
              });
            }
          });

          if (imagePaths.length > 0) {
            const signedUrls = await getSignedUrls(
              imagePaths.map((path) => ({ bucket: BUCKETS.jobs, path }))
            );

            const urlMap: Record<string, string> = {};
            imagePaths.forEach((path, index) => {
              const result = signedUrls[index];
              if (result?.signedUrl || result?.publicUrl) {
                urlMap[path] = result.signedUrl || result.publicUrl || "";
              }
            });

            if (mountedRef.current) {
              setImageUrls(urlMap);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching pending reviews:", error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    // Initial fetch
    fetchPendingReviews();

    // Real-time subscription for reviews (when a review is submitted, pending list should update)
    if (!currentUserId) return;

    const channel = supabase
      .channel('pending-reviews:updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reviews',
          filter: `reviewer_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh pending reviews when a new review is submitted
          fetchPendingReviews();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'job_hiring_history',
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh when job status changes (job closed, etc.)
          fetchPendingReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleReviewClick = (job: PendingReview) => {
    setSelectedJob(job);
    setModalOpen(true);
  };

  const handleReviewSubmitted = () => {
    // Refresh the list
    fetch("/api/reviews/pending")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.pending_reviews)) {
          setPendingReviews(data.pending_reviews);
        }
      });
  };


  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Pending Reviews</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Pending Reviews</h1>

      {pendingReviews.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <p>No pending reviews. All completed jobs have been reviewed!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingReviews.map((job) => {
            const isClosed = job.is_closed || false;
            const closedDate = job.closed_at ? new Date(job.closed_at) : null;
            const visibilityDate = closedDate ? new Date(closedDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
            const reviewsVisible = visibilityDate && visibilityDate <= new Date();
            const daysUntilVisible = visibilityDate && !reviewsVisible
              ? Math.ceil((visibilityDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;

            // Get the image URL (signed URL if available, otherwise use original)
            const getImageUrl = () => {
              if (!job.job_images || job.job_images.length === 0) {
                return "/assets/placeholder.svg";
              }
              const firstImage = job.job_images[0];
              if (typeof firstImage === "string") {
                // If it's already a full URL, use it
                if (firstImage.startsWith("http") || firstImage.startsWith("/")) {
                  return firstImage;
                }
                // Otherwise, use signed URL if available
                return imageUrls[firstImage] || "/assets/placeholder.svg";
              }
              return "/assets/placeholder.svg";
            };

            return (
              <Card key={job.job_id} className="overflow-hidden">
                <div className="relative h-48 w-full">
                  <Image
                    src={getImageUrl()}
                    alt={job.job_name}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      // Fallback to placeholder on error
                      const target = e.target as HTMLImageElement;
                      target.src = "/assets/placeholder.svg";
                    }}
                  />
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{job.job_name}</CardTitle>
                    {isClosed && (
                      <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Closed</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{job.job_location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(job.job_start_time)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <JapaneseYen className="h-4 w-4" />
                    <span>{job.final_price}</span>
                  </div>
                  {isClosed && visibilityDate && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-2">
                        {reviewsVisible
                          ? "Reviews are now visible"
                          : `Reviews will be visible in ${daysUntilVisible} day${daysUntilVisible !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <Button
                      onClick={() => handleReviewClick(job)}
                      className="w-full"
                      variant="default"
                    >
                      Leave Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedJob && (
        <LeaveReviewModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedJob(null);
          }}
          jobId={selectedJob.job_id}
          jobName={selectedJob.job_name}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}

