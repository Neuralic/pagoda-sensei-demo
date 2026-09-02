"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import profileImage from "../../public/assets/images/profile/professional-headshot.svg";
import { supabase } from "@/lib/supabase";

interface ReviewProps {
  author: string;
  avatar: string;
  rating: number;
  timeAgo: string;
  text: string;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
  } | null;
  reviewer_avatar?: string | null;
}

function ReviewCard({ author, avatar, rating, timeAgo, text }: ReviewProps) {
  return (
    <Card className="h-full border shadow-sm hover:shadow-md transition-shadow duration-200 rounded-xl">
      <CardContent className="p-4 h-full flex flex-col rounded-xl">
        <div className="flex items-start gap-3 mb-3">
          <Image
            src={avatar || profileImage}
            alt={author}
            width={40}
            height={40}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-semibold text-sm md:text-base truncate">
                {author}
              </p>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 md:h-4 md:w-4 ${
                    i < rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed flex-1">
          {text || "No comment provided"}
        </p>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) {
    return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
  } else if (diffMonths > 0) {
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes > 0 ? `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago` : "Just now";
    }
  }
}

interface ReviewsSectionProps {
  userId?: string;
}

export function ReviewsSection({ userId }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<ReviewProps[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
  const fetchReviews = async () => {
    if (!userId) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/reviews?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();

      if (!mountedRef.current) return;

      if (!data.ok) {
        console.error("Failed to fetch reviews:", data.error);
        setReviews([]);
        return;
      }

      if (data.ok && Array.isArray(data.reviews)) {
          // Filter out reviews without a reviewer (shouldn't happen, but safety check)
          const validReviews = data.reviews.filter((r: ReviewData) => r.reviewer);

          // Get avatar paths (only paths, not URLs)
          const avatarPaths = validReviews
            .map((r: ReviewData) => r.reviewer_avatar)
            .filter((path: string | null | undefined): path is string => 
              Boolean(path) && 
              typeof path === 'string' && 
              !path.startsWith("http") && 
              !path.startsWith("/")
            );

          // Fetch signed URLs for all avatar paths
          let avatarUrlMap: Record<string, string> = {};
          if (avatarPaths.length > 0) {
            try {
              const signedUrls = await getSignedUrls(
                avatarPaths.map((path: string) => ({ bucket: BUCKETS.avatars, path }))
              );
              avatarPaths.forEach((path: string, idx: number) => {
                const result = signedUrls[idx];
                if (result?.signedUrl || result?.publicUrl) {
                  avatarUrlMap[path] = result.signedUrl || result.publicUrl || profileImage.src;
                } else {
                  avatarUrlMap[path] = profileImage.src;
                }
              });
            } catch (error) {
              console.error("Error fetching signed URLs for avatars:", error);
              // Continue with default avatars
            }
          }

          // Format reviews
          const formattedReviews: ReviewProps[] = validReviews.map((r: ReviewData) => {
            const firstName = r.reviewer?.first_name || "";
            const lastName = r.reviewer?.last_name || "";
            const authorName = [firstName, lastName].filter(Boolean).join(" ") || "Anonymous";

            // Determine avatar URL
            let avatarUrl = profileImage.src; // Default
            if (r.reviewer_avatar) {
              if (r.reviewer_avatar.startsWith("http") || r.reviewer_avatar.startsWith("/")) {
                // Already a URL
                avatarUrl = r.reviewer_avatar;
              } else if (avatarUrlMap[r.reviewer_avatar]) {
                // Use signed URL from map
                avatarUrl = avatarUrlMap[r.reviewer_avatar];
              }
            }

            return {
              author: authorName,
              avatar: avatarUrl,
              rating: r.rating,
              timeAgo: formatTimeAgo(r.created_at),
              text: r.comment || "",
            };
          });

          if (mountedRef.current) {
            setReviews(formattedReviews);
          }
        } else {
          if (mountedRef.current) {
            setReviews([]);
          }
        }
      } catch (error) {
        console.error("Error fetching reviews:", error);
        if (mountedRef.current) {
          setReviews([]);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    if (userId) {
      fetchReviews();
    } else {
      if (mountedRef.current) {
        setLoading(false);
      }
    }

    // Real-time subscription for new reviews
    if (!userId) return;

    const channel = supabase
      .channel(`reviews:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reviews',
          filter: `reviewee_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh reviews when a new one is added
          fetchReviews();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reviews',
          filter: `reviewee_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          // Refresh reviews when visibility changes
          const updated = payload.new as { is_visible?: boolean };
          if (updated?.is_visible) {
            fetchReviews();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="w-full rounded-xl">
        <Card className="border shadow-md rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg md:text-xl">Recent Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Loading reviews...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl">
      <Card className="border shadow-md rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg md:text-xl">Recent Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviews.map((review, idx) => (
                <ReviewCard key={`review-${idx}-${review.author}`} {...review} />
              ))}
            </div>
            ) : (
            <p className="text-gray-500 text-center py-4">
                No reviews yet
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
