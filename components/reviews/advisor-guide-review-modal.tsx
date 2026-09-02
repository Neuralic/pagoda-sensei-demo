"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star } from "lucide-react";
import toast from "react-hot-toast";

type GuideOption = {
  id: string;
  name: string;
  guideNumber?: string | null;
  avatarUrl?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function AdvisorGuideReviewModal({ isOpen, onClose }: Props) {
  const [guideQuery, setGuideQuery] = useState("");
  const [selectedGuide, setSelectedGuide] = useState<GuideOption | null>(null);
  const [suggestions, setSuggestions] = useState<GuideOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [destination, setDestination] = useState("");
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const reset = () => {
    setGuideQuery("");
    setSelectedGuide(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setDestination("");
    setComment("");
    setRating(0);
    setHoveredRating(0);
    setSearching(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const onDoc = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = guideQuery.trim();
    if (selectedGuide && q === selectedGuide.name) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const params = new URLSearchParams({ q, limit: "12" });
        const res = await fetch(`/api/guides/search?${params}`);
        const data = await res.json().catch(() => null);
        if (seq !== searchSeq.current) return;
        if (data?.ok && Array.isArray(data.results)) {
          setSuggestions(
            data.results.map(
              (r: {
                id: string;
                name: string;
                guideNumber?: string | null;
                avatarUrl?: string | null;
              }) => ({
                id: r.id,
                name: r.name,
                guideNumber: r.guideNumber ?? null,
                avatarUrl: r.avatarUrl ?? null,
              })
            )
          );
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      } catch {
        if (seq === searchSeq.current) setSuggestions([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [guideQuery, selectedGuide, isOpen]);

  const pickGuide = (guide: GuideOption) => {
    setSelectedGuide(guide);
    setGuideQuery(guide.name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!selectedGuide) {
      toast.error("Please select a guide from the list");
      return;
    }
    const dest = destination.trim();
    const text = comment.trim();

    if (!dest) {
      toast.error("Please enter the destination");
      return;
    }
    if (rating < 1) {
      toast.error("Please select a star rating");
      return;
    }
    if (!text) {
      toast.error("Please write a short review");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guide_id: selectedGuide.id,
          guide_name: selectedGuide.name,
          destination: dest,
          rating,
          comment: text,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to submit review");
      }
      toast.success("Review submitted — thank you!");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a Guide Review</DialogTitle>
          <DialogDescription>
            Share feedback on a guide you used for your clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
            <p className="leading-relaxed">
              Please enter the first two letters of the guide&apos;s name below, then select
              the correct guide from the drop-down that will appear.
            </p>
          </div>

          <div ref={searchBoxRef} className="relative">
            <label className="text-sm font-medium mb-1.5 block">
              Guide name <span className="text-destructive">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Search, then select from the suggestions — do not only type the name.
            </p>
            <div className="relative">
              <Input
                value={guideQuery}
                onChange={(e) => {
                  setGuideQuery(e.target.value);
                  setSelectedGuide(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Type at least 2 letters, then select from the list…"
                disabled={submitting}
                maxLength={120}
                autoComplete="off"
              />
              {searching ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            {selectedGuide ? (
              <p className="text-xs text-green-700 mt-1.5">
                Selected: {selectedGuide.name}
                {selectedGuide.guideNumber
                  ? ` (#${selectedGuide.guideNumber})`
                  : ""}
              </p>
            ) : guideQuery.trim().length >= 2 && !searching ? (
              <p className="text-xs text-amber-700 mt-1.5">
                Click a guide in the list below to continue
              </p>
            ) : guideQuery.trim().length > 0 && guideQuery.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground mt-1.5">
                Keep typing — then choose a guide from the suggestions
              </p>
            ) : null}

            {showSuggestions && suggestions.length > 0 ? (
              <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-white shadow-md">
                {suggestions.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/70 transition-colors"
                      onClick={() => pickGuide(g)}
                    >
                      <span className="font-medium text-foreground">
                        {g.name}
                      </span>
                      {g.guideNumber ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          #{g.guideNumber}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {showSuggestions &&
            !searching &&
            guideQuery.trim().length >= 2 &&
            !selectedGuide &&
            suggestions.length === 0 ? (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-muted-foreground shadow-md">
                No guides found for “{guideQuery.trim()}”
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Destination <span className="text-destructive">*</span>
            </label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Kyoto, Tokyo"
              disabled={submitting}
              maxLength={120}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Rating <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={submitting}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                  aria-label={`${star} star${star === 1 ? "" : "s"}`}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-[#D4AA25] text-[#D4AA25]"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Your review <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was your experience with this guide?"
              rows={4}
              maxLength={1000}
              disabled={submitting}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {comment.length}/1000
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
              onClick={() => void handleSubmit()}
              disabled={submitting || !selectedGuide}
            >
              {submitting ? "Submitting…" : "Submit review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
