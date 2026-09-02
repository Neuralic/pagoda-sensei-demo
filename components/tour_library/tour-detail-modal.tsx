import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";
import { Tour } from "@/app/types";
import { Bed, Clock, MapPin, X, ChevronLeft, ChevronRight, Copy, Languages, Plus } from "lucide-react";
import Image from "next/image";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import { Button } from "@/components/ui/button";
import ReactCountryFlag from "react-country-flag";
import { LANGUAGE_FLAG_MAP } from "@/lib/countries-map";
import { AssignedGuidesPanel } from "@/components/guide_tours/assigned-guides-panel";
import type { AssignedGuideSummary } from "@/lib/guide-tour-assignments";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";

interface TourDetailModalProps {
    isOpen: boolean;
    onClose: (open: boolean) => void;
    selectedTour: Tour | null;
    /** When set, show "Create new from this tour" and call with selectedTour when clicked. */
    onCreateFromTour?: (tour: Tour) => void;
    showCreateFromTour?: boolean;
    /** Agent/agency: add this catalog tour to an existing itinerary. */
    onAddToItinerary?: (tour: Tour) => void;
    /** When true (agent/agency), show only calculated total — never show per-person guide prices. */
    showCalculatedPriceOnly?: boolean;
    /** From tour list API when available */
    assignedGuides?: AssignedGuideSummary[];
}

function normalizeTourLanguages(languages: string | string[] | null | undefined): string[] {
    if (!languages) return [];
    if (Array.isArray(languages)) return languages;
    if (typeof languages === "string") {
        try {
            const parsed = JSON.parse(languages);
            return Array.isArray(parsed) ? parsed : languages.split(",").map((l) => l.trim()).filter(Boolean);
        } catch {
            return languages.split(",").map((l) => l.trim()).filter(Boolean);
        }
    }
    return [];
}

function getLanguageCountryCode(name: string): string | undefined {
    const key = name.trim().toLowerCase();
    return LANGUAGE_FLAG_MAP[key];
}

function isGroupRateTour(tour: Tour | null): boolean {
    if (!tour) return false;
    const m = (tour as Tour & { pricing_model?: string | null }).pricing_model;
    return m === "group_rate";
}

function formatYen(n: number): string {
    return `¥${Math.round(n).toLocaleString()}`;
}

function pickPrice(...vals: unknown[]): number | null {
    for (const v of vals) {
        if (v == null || v === "") continue;
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Guide prices: API may send camelCase or snake_case from Supabase. */
function getGuidePerPersonPrices(tour: Tour | null): {
    adult: number | null;
    child: number | null;
    infant: number | null;
} {
    if (!tour) return { adult: null, child: null, infant: null };
    const r = tour as Record<string, unknown>;
    return {
        adult: pickPrice(tour.pricePerAdult, r.price_per_adult),
        child: pickPrice(tour.pricePerChild, r.price_per_child),
        infant: pickPrice(tour.pricePerInfant, r.price_per_infant),
    };
}

function formatYenOrDash(n: number | null): string {
    return n != null && Number.isFinite(n) ? formatYen(n) : "—";
}

/** Agent list prices incl. VAT (from /api/tour/all). */
function getAgentDisplayPerPersonPrices(tour: Tour | null): {
    adult: number | null;
    child: number | null;
    infant: number | null;
} {
    if (!tour) return { adult: null, child: null, infant: null };
    const r = tour as Record<string, unknown>;
    return {
        adult: pickPrice(tour.displayPricePerAdult, r.displayPricePerAdult),
        child: pickPrice(tour.displayPricePerChild, r.displayPricePerChild),
        infant: pickPrice(tour.displayPricePerInfant, r.displayPricePerInfant),
    };
}

export const TourDetailModal: React.FC<TourDetailModalProps> = ({
    isOpen,
    onClose,
    selectedTour,
    onCreateFromTour,
    showCreateFromTour = false,
    onAddToItinerary,
    showCalculatedPriceOnly = false,
    assignedGuides,
}) => {
    const [imageUrls, setImageUrls] = useState<Array<{ path: string; url: string }>>([]);
    const [imageLoading, setImageLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

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

        const loadImages = async () => {
            if (!selectedTour?.image) {
                setImageUrls([]);
                setImageLoading(false);
                setSelectedImageIndex(0);
                return;
            }

            try {
                setImageLoading(true);

                // Parse image field - handle both JSON string array and single string
                let imagePaths: string[] = [];

                try {
                    // Try to parse as JSON (array of paths)
                    const parsed = JSON.parse(selectedTour.image);
                    if (Array.isArray(parsed)) {
                        imagePaths = parsed;
                    } else if (typeof parsed === 'string') {
                        imagePaths = [parsed];
                    }
                } catch {
                    // If not JSON, treat as single string
                    imagePaths = [selectedTour.image];
                }

                // Get signed URLs for all images
                const imagePromises = imagePaths.map(async (path) => {
                    const url = await getSignedImageUrl(path);
                    return { path, url };
                });

                const loadedImages = await Promise.all(imagePromises);

                if (mounted) {
                    setImageUrls(loadedImages);
                    setSelectedImageIndex(0);
                }
            } catch (error) {
                console.error("Error loading images:", error);
                if (mounted) {
                    setImageUrls([]);
                    setSelectedImageIndex(0);
                }
            } finally {
                if (mounted) {
                    setImageLoading(false);
                }
            }
        };

        loadImages();

        return () => {
            mounted = false;
        };
    }, [selectedTour?.image]);
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="!max-w-[700px]  max-h-[90vh] overflow-y-auto p-6
        [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar:hidden]"
            >
                {/* Close Button */}
                <button
                    onClick={() => onClose(false)}
                    className="absolute right-4 top-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
                >
                    <X className="w-5 h-5 cursor-pointer" />
                </button>
                <DialogHeader className="flex flex-col items-center justify-center text-center pt-2">
                    <h1 className="text-3xl font-bold">{selectedTour?.title}</h1>
                </DialogHeader>

                <div className="flex items-center gap-2 mt-3">
                    <div className="p-3 bg-[#C9E4FE] rounded-sm  overflow-hidden flex justify-center align-middle relative">
                        <Bed />
                    </div>
                    <div className="ml-2">
                        <p className="text-1xl font-bold">
                            {canonicalizeActivityTypeLabel(selectedTour?.activity_type)}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {selectedTour?.location}
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {selectedTour?.duration}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Supported Languages */}
                {(() => {
                    const tourLanguages = normalizeTourLanguages(selectedTour?.languages);
                    if (tourLanguages.length === 0) return null;
                    return (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Languages className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground">Supported languages:</span>
                            <div className="flex flex-wrap gap-2">
                                {tourLanguages.map((lang) => {
                                    const code = getLanguageCountryCode(lang);
                                    return (
                                        <span key={lang} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm">
                                            {code ? <ReactCountryFlag title={lang} countryCode={code} svg className="!w-5 !h-4" /> : null}
                                            {lang}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* Main Image Display */}
                {imageUrls.length > 0 ? (
                    <div className="mt-6 space-y-4">
                        {/* Featured/Selected Image */}
                        <div className="relative h-64 w-full overflow-hidden bg-muted rounded-md">
                            <Image
                                src={imageUrls[selectedImageIndex]?.url || "/assets/images/profile/placeholder.svg"}
                                alt={`Tour Image ${selectedImageIndex + 1}`}
                                fill
                                className="object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = "/assets/images/profile/placeholder.svg";
                                }}
                            />

                            {/* Gradient Overlay for Text Readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

                            {/* Image Counter */}
                            {imageUrls.length > 1 && (
                                <div className="absolute top-4 right-4">
                                    <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                                        {selectedImageIndex + 1} / {imageUrls.length}
                                    </span>
                                </div>
                            )}

                            {/* Navigation Arrows */}
                            {imageUrls.length > 1 && (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedImageIndex((prev) =>
                                                prev === 0 ? imageUrls.length - 1 : prev - 1
                                            );
                                        }}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                                        aria-label="Previous image"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedImageIndex((prev) =>
                                                prev === imageUrls.length - 1 ? 0 : prev + 1
                                            );
                                        }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                                        aria-label="Next image"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </>
                            )}

                            {/* Loading state */}
                            {imageLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                                    <div className="animate-pulse text-gray-500">Loading...</div>
                                </div>
                            )}
                        </div>

                        {/* Thumbnail Grid - Show if more than 1 image */}
                        {imageUrls.length > 1 && (
                            <div className="grid grid-cols-5 gap-2">
                                {imageUrls.map((imageItem, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedImageIndex(index)}
                                        className={`relative aspect-video overflow-hidden rounded-md border-2 transition-all ${selectedImageIndex === index
                                            ? "border-[#D4AA25] ring-2 ring-[#D4AA25]"
                                            : "border-border opacity-70 hover:opacity-100"
                                            }`}
                                    >
                                        <Image
                                            src={imageItem.url}
                                            alt={`Thumbnail ${index + 1}`}
                                            fill
                                            className="object-cover"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.src = "/assets/images/profile/placeholder.svg";
                                            }}
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    // Fallback when no images
                    <div className="relative mt-6 h-54 w-full overflow-hidden bg-muted rounded-md">
                        <Image
                            src="/assets/images/profile/placeholder.svg"
                            alt="Tour Image Placeholder"
                            fill
                            className="object-cover"
                        />
                        {imageLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                                <div className="animate-pulse text-gray-500">Loading...</div>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3 text-foreground">Description</h3>
                    <div className="prose prose-sm max-w-none">
                        {selectedTour?.description ? (
                            selectedTour.description.split('\n').map((paragraph, index) => (
                                paragraph.trim() ? (
                                    <p key={index} className="text-foreground leading-relaxed mb-3 last:mb-0 whitespace-pre-line">
                                        {paragraph.trim()}
                                    </p>
                                ) : null
                            ))
                        ) : (
                            <p className="text-muted-foreground italic">No description provided.</p>
                        )}
                    </div>
                </div>

                {/* Guide: structured pricing. Agents use showCalculatedPriceOnly block below. */}
                {!showCalculatedPriceOnly && isGroupRateTour(selectedTour) && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-foreground">Group rate (your guide prices)</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Total cost is based on <strong>headcount</strong> (adults + children + infants). Everyone beyond the base size uses the same additional rate per person — not split by age.
                        </p>
                        <dl className="text-sm text-foreground space-y-1.5">
                            {selectedTour?.base_rate != null && Number.isFinite(Number(selectedTour.base_rate)) && (
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Base rate</dt>
                                    <dd className="font-medium tabular-nums">{formatYen(Number(selectedTour.base_rate))}</dd>
                                </div>
                            )}
                            {selectedTour?.base_group_size != null && Number(selectedTour.base_group_size) >= 1 && (
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Covers up to</dt>
                                    <dd className="font-medium">{Number(selectedTour.base_group_size)} people</dd>
                                </div>
                            )}
                            {selectedTour?.additional_per_person_rate != null && Number.isFinite(Number(selectedTour.additional_per_person_rate)) && (
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Each additional person</dt>
                                    <dd className="font-medium tabular-nums">{formatYen(Number(selectedTour.additional_per_person_rate))}</dd>
                                </div>
                            )}
                            {selectedTour?.max_group_size != null && Number(selectedTour.max_group_size) > 0 && (
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Maximum group size</dt>
                                    <dd className="font-medium">{Number(selectedTour.max_group_size)} people</dd>
                                </div>
                            )}
                        </dl>
                    </div>
                )}

                {!showCalculatedPriceOnly && !isGroupRateTour(selectedTour) && (() => {
                    const pp = getGuidePerPersonPrices(selectedTour);
                    if (pp.adult == null && pp.child == null && pp.infant == null) return null;
                    return (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg space-y-3">
                            <div>
                                <p className="text-sm font-medium text-foreground">Per person pricing (your guide prices)</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Total for a booking is the sum of (adults × adult rate) + (children × child rate) + (infants × infant rate).
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Adults (12+)</span>
                                    <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(pp.adult)}</span>
                                    <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                </div>
                                <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Children (3–11)</span>
                                    <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(pp.child)}</span>
                                    <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                </div>
                                <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Infants (0–2)</span>
                                    <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(pp.infant)}</span>
                                    <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Agent: VAT-inclusive total. Guide: “from” total when no per-person rows (group or legacy). */}
                {showCalculatedPriceOnly && selectedTour?.displayPrice != null && Number.isFinite(selectedTour.displayPrice) ? (
                    <div className="mt-3 space-y-3">
                        <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                            <p className="text-sm text-muted-foreground">{selectedTour.priceLabel ?? "Total"}</p>
                            <p className="text-xl font-semibold text-foreground">¥{Number(selectedTour.displayPrice).toLocaleString()}</p>
                            {isGroupRateTour(selectedTour) && selectedTour?.base_group_size != null && Number(selectedTour.base_group_size) >= 1 && (
                                <p className="text-xs text-muted-foreground pt-1">
                                    From price covers up to {Number(selectedTour.base_group_size)} people; extra guests are priced per person.{" "}
                                    {selectedTour.max_group_size != null && Number(selectedTour.max_group_size) > 0 && (
                                        <>Max {Number(selectedTour.max_group_size)} people total.</>
                                    )}
                                </p>
                            )}
                        </div>
                        {!isGroupRateTour(selectedTour) &&
                            (() => {
                                const ap = getAgentDisplayPerPersonPrices(selectedTour);
                                if (ap.adult == null && ap.child == null && ap.infant == null) return null;
                                return (
                                    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                                        <p className="text-sm font-medium text-foreground">Per person (incl. fees)</p>
                                        <p className="text-xs text-muted-foreground">
                                            Use these rates to estimate cost by age group before booking.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Adults (12+)</span>
                                                <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(ap.adult)}</span>
                                                <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                            </div>
                                            <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Children (3–11)</span>
                                                <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(ap.child)}</span>
                                                <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                            </div>
                                            <div className="flex flex-col rounded-lg bg-background/80 px-3 py-2.5 border border-border/60">
                                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Infants (0–2)</span>
                                                <span className="text-base font-semibold tabular-nums text-foreground mt-1">{formatYenOrDash(ap.infant)}</span>
                                                <span className="text-[10px] text-muted-foreground mt-0.5">per person</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                    </div>
                ) : !showCalculatedPriceOnly &&
                  (() => {
                      const pp = getGuidePerPersonPrices(selectedTour);
                      return pp.adult == null && pp.child == null && pp.infant == null;
                  })() &&
                  ((selectedTour?.displayPrice != null && Number.isFinite(selectedTour.displayPrice)) ||
                    (selectedTour?.guidePrice != null && Number.isFinite(selectedTour.guidePrice))) ? (
                    <div className="mt-3 space-y-2">
                        {selectedTour?.displayPrice != null && Number.isFinite(selectedTour.displayPrice) && (
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="text-sm text-muted-foreground">{selectedTour.priceLabel ?? "Price"}</p>
                                <p className="text-xl font-semibold text-foreground">¥{Number(selectedTour.displayPrice).toLocaleString()}</p>
                                {isGroupRateTour(selectedTour) && selectedTour?.base_group_size != null && Number(selectedTour.base_group_size) >= 1 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        From total for up to {Number(selectedTour.base_group_size)} people (your guide price).
                                    </p>
                                )}
                            </div>
                        )}
                        {selectedTour?.guidePrice != null && Number.isFinite(selectedTour.guidePrice) && (
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="text-sm text-muted-foreground">Guide price</p>
                                <p className="text-xl font-semibold text-foreground">¥{Number(selectedTour.guidePrice).toLocaleString()}</p>
                            </div>
                        )}
                    </div>
                ) : null}

                {selectedTour?.id && (
                    <AssignedGuidesPanel
                        tourId={selectedTour.id}
                        initialGuides={
                            assignedGuides ??
                            (selectedTour as Tour & { assignedGuides?: AssignedGuideSummary[] })
                                .assignedGuides
                        }
                    />
                )}

                {(onAddToItinerary || (showCreateFromTour && onCreateFromTour)) && selectedTour && (
                    <div className="mt-6 pt-4 border-t border-border space-y-2">
                        {onAddToItinerary && (
                            <Button
                                type="button"
                                onClick={() => {
                                    onAddToItinerary(selectedTour);
                                    onClose(false);
                                }}
                                className="w-full bg-[#D4AA25] hover:bg-[#C49A1F] text-white cursor-pointer gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add to itinerary
                            </Button>
                        )}
                        {showCreateFromTour && onCreateFromTour && (
                            <Button
                                type="button"
                                onClick={() => {
                                    onCreateFromTour(selectedTour);
                                    onClose(false);
                                }}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer gap-2"
                            >
                                <Copy className="w-4 h-4" />
                                Create new tour from this one
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
