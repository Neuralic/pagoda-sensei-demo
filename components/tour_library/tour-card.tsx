import React, { useEffect, useState } from "react"
import Link from "next/link";
import { Card } from "../ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Calendar, MapPin, Clock, Users, MapPinned, User, Edit, Trash2, Copy, Languages, Heart } from "lucide-react";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import ReactCountryFlag from "react-country-flag";
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
import { buildPublicProfilePath } from "@/lib/profile-refresh";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";
import { cn } from "@/lib/utils";

interface TourCardProps {
  id: string;
  title?: string;
  image: string;
  location: string;
  description: string;
  activity_type?: string;
  duration: string;
  people: number;
  stops: number;
  tour_date: string;
  highlights: string;
  postedDate: string;
  editButton?: boolean;
  onView: () => void;
  /** Agent/agency: add this catalog tour to an existing itinerary */
  onAddToItinerary?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Create a new tour from this one (duplicate). Shown when editButton is true. */
  onDuplicate?: () => void;
  country: string;
  /** Role-based: guide sees "Your price", agent sees "Total" (incl. VAT). */
  displayPrice?: number | null;
  priceLabel?: string;
  /** Per-person pricing (when set, displayPrice may be "from" 1 adult). */
  pricePerAdult?: number | null;
  pricePerChild?: number | null;
  pricePerInfant?: number | null;
  /** Supported languages (e.g. ["English", "Japanese"]) */
  languages?: string[];
  /** When true (agent/agency), show only calculated total — never show per-person guide prices. */
  showCalculatedPriceOnly?: boolean;
  /** Guide library: draft / banned visibility (published has no badge). */
  status?: "draft" | "published" | "banned";
  /** Linked guide profiles for this tour. */
  assignedGuides?: Array<{
    id: string;
    name: string;
    profileSlug?: string | null;
  }>;
  needsGuideProfile?: boolean;
  /** Advisor library: star / unstar this tour. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  bookingCount?: number;
  agent: {
    id: string;
    name: string;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    profile?: {
      id: string;
      userId: string;
      avatarPath: string;
      avatarUrl: string | null;
    } | null;
  };
}

const TourCard: React.FC<TourCardProps> = ({
  title,
  image,
  location,
  activity_type,
  duration,
  highlights,
  postedDate,
  onView,
  onAddToItinerary,
  onEdit,
  onDelete,
  onDuplicate,
  agent,
  country,
  editButton,
  displayPrice,
  priceLabel = "Price",
  pricePerAdult,
  pricePerChild,
  pricePerInfant,
  languages,
  showCalculatedPriceOnly = false,
  status,
  assignedGuides,
  needsGuideProfile,
  isFavorite,
  onToggleFavorite,
  bookingCount,
}) => {

  const [imageUrl, setImageUrl] = useState<string>("/assets/images/profile/placeholder.svg");
  const [imageLoading, setImageLoading] = useState(true);

  // Function to get signed URL for Supabase images
  const getSignedImageUrl = async (imgPath: string): Promise<string> => {
    if (!imgPath || imgPath.trim() === "") {
      return "/assets/images/profile/placeholder.svg";
    }

    // If it's already a full URL (http/https), use it directly
    if (imgPath.startsWith("http")) {
      return imgPath;
    }

    // If it's an absolute path (starts with /), use it directly
    if (imgPath.startsWith("/")) {
      return imgPath;
    }

    // For Supabase storage paths (like "images/..."), get signed URL
    if (imgPath.startsWith("images/")) {
      try {
        const signedUrls = await getSignedUrls([
          { bucket: BUCKETS.tours, path: imgPath }
        ]);

        if (signedUrls.length > 0 && signedUrls[0].signedUrl) {
          return signedUrls[0].signedUrl;
        }

        // Fallback to public URL if signed URL fails
        if (signedUrls.length > 0 && signedUrls[0].publicUrl) {
          return signedUrls[0].publicUrl;
        }
      } catch (error) {
        console.error("Error getting signed URL:", error);
      }
    }

    // Fallback for any other cases
    return "/assets/images/profile/placeholder.svg";
  };

  useEffect(() => {
    let mounted = true;

    const loadImage = async () => {
      if (!image) {
        setImageUrl("/assets/images/profile/placeholder.svg");
        setImageLoading(false);
        return;
      }

      try {
        setImageLoading(true);

        // Parse image field - handle both JSON string array and single string
        let imagePath: string | null = null;

        try {
          // Try to parse as JSON (array of paths)
          const parsed = JSON.parse(image);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Use the first image from the array
            imagePath = parsed[0];
          } else if (typeof parsed === 'string') {
            imagePath = parsed;
          }
        } catch {
          // If not JSON, treat as single string
          imagePath = image;
        }

        if (imagePath) {
          const url = await getSignedImageUrl(imagePath);

          if (mounted) {
            setImageUrl(url);
          }
        } else {
          if (mounted) {
            setImageUrl("/assets/images/profile/placeholder.svg");
          }
        }
      } catch (error) {
        console.error("Error loading image:", error);
        if (mounted) {
          setImageUrl("/assets/images/profile/placeholder.svg");
        }
      } finally {
        if (mounted) {
          setImageLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [image]);

  const getLanguageCountryCode = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    return LANGUAGE_FLAG_MAP[key];
  };
  return (
    <Card className="group overflow-hidden shadow-lg transition-shadow flex flex-col h-full rounded-xl">
      {/* Image Section with Overlay Content */}
      <div className="relative h-54 w-full overflow-hidden bg-muted rounded-md">
        {/* Image with proper signed URL handling */}
        <Image
          src={imageUrl}
          alt={title || "Tour Image"}
          fill
          className="object-cover"
          onError={(e) => {
            // Fallback to placeholder if image fails to load
            const target = e.target as HTMLImageElement;
            target.src = "/assets/images/profile/placeholder.svg";
            setImageUrl("/assets/images/profile/placeholder.svg");
          }}
        />

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

        {status && status !== "published" && (
          <div className="absolute top-2 left-2 z-10">
            <Badge
              variant="secondary"
              className={
                status === "draft"
                  ? "bg-amber-500/90 text-white border-0 text-xs"
                  : "bg-red-600/90 text-white border-0 text-xs"
              }
            >
              {status === "draft" ? "Draft" : status === "banned" ? "Unpublished" : status}
            </Badge>
          </div>
        )}

        {needsGuideProfile && (
          <div className={`absolute z-10 ${status && status !== "published" ? "top-10 left-2" : "top-2 left-2"}`}>
            <Badge variant="secondary" className="bg-amber-600/95 text-white border-0 text-xs">
              Needs guide profile
            </Badge>
          </div>
        )}

        {/* Loading state */}
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
            <div className="animate-pulse text-gray-500">Loading...</div>
          </div>
        )}

        {/* Title and Location positioned at bottom left */}
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <h3 className="font-semibold text-base line-clamp-2 mb-1">{title}</h3>
          <span>{country}</span>
        </div>

        {/* Action buttons positioned at top right - visible on hover */}
        <div className="absolute top-2 right-2 flex gap-2">
          {onToggleFavorite && (
            <Button
              type="button"
              className={cn(
                "cursor-pointer p-2 h-8 w-8 shadow-lg",
                isFavorite
                  ? "bg-white text-rose-500 hover:bg-white/90"
                  : "bg-black/40 text-white hover:bg-black/55"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite();
              }}
              title={isFavorite ? "Remove from favorites" : "Save to favorites"}
              aria-pressed={Boolean(isFavorite)}
              aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
            >
              <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
            </Button>
          )}
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Duplicate / Create from this tour */}
          {editButton && onDuplicate && (
            <Button
              className="cursor-pointer bg-emerald-500 hover:bg-emerald-600 text-white p-2 h-8 w-8 shadow-lg"
              onClick={onDuplicate}
              title="Create new tour from this one"
            >
              <Copy className="w-4 h-4" />
            </Button>
          )}
          {/* Delete button */}
          {onDelete && (
            <Button
              className="cursor-pointer bg-red-500 hover:bg-red-600 text-white p-2 h-8 w-8 shadow-lg"
              onClick={onDelete}
              title="Delete tour"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {/* Edit button */}
          {editButton && onEdit && (
            <Button
              className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white p-2 h-8 w-8 shadow-lg"
              onClick={onEdit}
              title="Edit tour"
            >
              <Edit className="w-4 h-4" />
            </Button>
          )}
          </div>
        </div>

      </div>
      {/* Content Section */}
      <div className="flex-1 p-4 space-y-3 my-3">
        {/* Info Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <MapPin className="w-3 h-3" />
            {location}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-xs">
            <Clock className="w-3 h-3" />
            {duration}
          </Badge>
        </div>

        {/* Activity Type Badge */}
        {activity_type && (
          <div className="relative bg-[#D6E7FE] text-[#48515E] px-2 py-1 rounded text-xs font-medium w-fit">
            {canonicalizeActivityTypeLabel(activity_type)}
          </div>
        )}
        {typeof bookingCount === "number" && bookingCount > 0 && (
          <p className="text-xs text-muted-foreground">{bookingCount} booked</p>
        )}

        {assignedGuides && assignedGuides.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Guide profile: </span>
            {assignedGuides.map((g, i) => {
              const path = buildPublicProfilePath(g.profileSlug);
              return (
                <span key={g.id}>
                  {i > 0 ? ", " : null}
                  {path ? (
                    <Link
                      href={path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D4AA25] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {g.name}
                    </Link>
                  ) : (
                    g.name
                  )}
                </span>
              );
            })}
          </div>
        ) : needsGuideProfile ? (
          <p className="text-xs text-amber-700">Link a published guide profile so proposals stay complete.</p>
        ) : null}

        {/* Supported Languages */}
        {languages && languages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Languages: </span>
            <div className="flex flex-wrap gap-1">
              {languages.map((lang) => {
                const code = getLanguageCountryCode(lang);
                return (
                  <span key={lang} className="inline-flex items-center gap-1">
                    {code ? (
                      <ReactCountryFlag title={lang} countryCode={code} svg className="!w-4 !h-3" />
                    ) : null}
                    <span className="text-xs">{lang}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Price: for agent show only calculated total; for guide show per-person + calculated */}
        {showCalculatedPriceOnly ? (
          displayPrice != null && Number.isFinite(displayPrice) ? (
            <div className="text-sm font-medium text-foreground">
              {priceLabel}: ¥{Number(displayPrice).toLocaleString()}
            </div>
          ) : null
        ) : (pricePerAdult != null || pricePerChild != null || pricePerInfant != null) ? (
          <div className="text-sm text-foreground space-y-1.5">
            <span className="font-medium block">Per person</span>
            <div className="space-y-0.5 text-muted-foreground flex flex-row gap-4">
              {pricePerAdult != null && (
                <div>Adults (12+): ¥{Math.round(Number(pricePerAdult)).toLocaleString()}</div>
              )}
              {pricePerChild != null && (
                <div>Children (3–11): ¥{Math.round(Number(pricePerChild)).toLocaleString()}</div>
              )}
              {pricePerInfant != null && (
                <div>Infants (0–2): ¥{Math.round(Number(pricePerInfant)).toLocaleString()}</div>
              )}
            </div>
            {displayPrice != null && Number.isFinite(displayPrice) && (
              <div className="text-xs text-muted-foreground pt-0.5">
                {priceLabel}: ¥{Number(displayPrice).toLocaleString()}
              </div>
            )}
          </div>
        ) : displayPrice != null && Number.isFinite(displayPrice) ? (
          <div className="text-sm font-medium text-foreground">
            {priceLabel}: ¥{Number(displayPrice).toLocaleString()}
          </div>
        ) : null}

        {/* Highlights */}
        <div className="mb-4">
          <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
            <span className="font-medium">Description:</span>{' '}
            <span className="whitespace-pre-line">{highlights}</span>
          </p>
        </div>

        {/* Date Range with Calendar Icon */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground my-5">
          <User className="w-3 h-3" />
          Made By {agent?.name}
        </div>

        <hr className="my-5" />

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span className="text-xs text-muted-foreground">
              Posted {postedDate}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onAddToItinerary && (
              <Button
                onClick={onAddToItinerary}
                variant="outline"
                className="border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10 font-medium cursor-pointer"
                size="lg"
              >
                Add to itinerary
              </Button>
            )}
            <Button
              onClick={onView}
              className="bg-[#D4AA25] hover:bg-[#C39A1F] text-white font-medium cursor-pointer"
              size="lg"
            >
              View
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default TourCard
