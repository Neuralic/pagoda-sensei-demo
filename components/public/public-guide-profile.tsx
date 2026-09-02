"use client";

import { CertificationBadge } from "@/components/guide/certification-badge";
import { ExperienceTierBadge } from "@/components/guide/experience-tier-badge";
import { Button } from "@/components/ui/button";
import { ContactGuideButton } from "@/components/guide/contact-guide-button";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { Check, Copy, Star } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type GuidePublic = {
  id: string;
  name: string;
  guideNumber: string | null;
  bio: string | null;
  languages: string[];
  destinations: string[];
  availableForVideoCall: boolean | null;
  yearsExperience: number | null;
  toursCompletedEstimate: number | null;
  experienceTierLabel: string | null;
  experienceTier?: number | null;
  experienceTierDeclared?: number | null;
  guideTierLabel: string;
  certificationStatus: string;
  crisisHandlingExample: string | null;
  localExpertiseHighlight: string | null;
  preTourPreparation: string | null;
  clientFitDescription: string | null;
  avatarUrl: string | null;
  introVideoUrl: string | null;
  bookingCount: number;
  ratingAverage: number | null;
  reviewCount: number;
  assignedTours: Array<{ id: string; name: string; location: string; country: string }>;
  reviews?: Array<{
    id: string;
    rating: number;
    comment: string | null;
    destination: string | null;
    createdAt: string;
    reviewerName: string;
  }>;
  marketplaceAvailable: boolean;
};

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isYoutubeOrVimeo(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
}

export function PublicGuideProfile({ slug }: { slug: string }) {
  const [guide, setGuide] = useState<GuidePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/guide/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.ok) setGuide(data.guide);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const copyLink = async () => {
    if (typeof window === "undefined") return;
    const ok = await copyTextToClipboard(window.location.href);
    if (!ok) {
      toast.error("Could not copy — copy the address from your browser bar");
      return;
    }
    setCopied(true);
    toast.success("Profile link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <p className="text-center py-20 text-muted-foreground">Loading profile…</p>;
  }

  if (!guide) {
    return <p className="text-center py-20 text-muted-foreground">Profile not found or not published.</p>;
  }

  return (
    <article className="max-w-3xl mx-auto">
      <div className="flex flex-wrap justify-end gap-2 mb-4">
        <ContactGuideButton
          guideId={guide.id}
          guideName={guide.name}
          returnPath={`/g/${slug}`}
          className="gap-2 bg-[#D4AA25] hover:bg-[#c49a20] text-black"
        />
        <Button onClick={copyLink} variant="outline" className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy profile link
        </Button>
      </div>

      <header className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="relative h-32 w-32 rounded-lg overflow-hidden bg-muted shrink-0">
          <Image
            src={guide.avatarUrl || "/assets/images/profile/placeholder.svg"}
            alt={guide.name}
            fill
            className="object-cover"
            unoptimized={Boolean(guide.avatarUrl?.startsWith("http"))}
          />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{guide.name}</h1>
          {guide.guideNumber && (
            <p className="text-muted-foreground">Guide #{guide.guideNumber}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <ExperienceTierBadge tier={guide.experienceTier} />
            <CertificationBadge
              status={guide.certificationStatus}
              bookingCount={guide.bookingCount}
              reviewCount={guide.reviewCount}
            />
          </div>
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            {guide.ratingAverage != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {guide.ratingAverage} ({guide.reviewCount} reviews)
              </span>
            )}
            <span>{guide.bookingCount} bookings</span>
            <span>{guide.marketplaceAvailable ? "Available" : "Limited availability"}</span>
          </div>
          {guide.experienceTierLabel && (
            <p className="text-sm text-muted-foreground mt-1">{guide.experienceTierLabel}</p>
          )}
        </div>
      </header>

      {guide.introVideoUrl && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Introduction</h2>
          {isYoutubeOrVimeo(guide.introVideoUrl) ? (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <iframe
                src={guide.introVideoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                className="w-full h-full"
                allowFullScreen
                title="Introduction video"
              />
            </div>
          ) : (
            <video
              src={guide.introVideoUrl}
              className="w-full rounded-lg max-h-[480px]"
              autoPlay
              muted
              playsInline
              controls
            />
          )}
        </section>
      )}

      {guide.bio && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-2">About</h2>
          <p className="text-foreground whitespace-pre-wrap">{guide.bio}</p>
        </section>
      )}

      <section className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
        {guide.languages?.length > 0 && (
          <div>
            <h3 className="font-medium">Languages</h3>
            <p className="text-muted-foreground">{guide.languages.join(", ")}</p>
          </div>
        )}
        {guide.destinations?.length > 0 && (
          <div>
            <h3 className="font-medium">Destinations</h3>
            <p className="text-muted-foreground">{guide.destinations.join(", ")}</p>
          </div>
        )}
        {guide.availableForVideoCall != null && (
          <div>
            <h3 className="font-medium">Video call with advisor</h3>
            <p className="text-muted-foreground">
              {guide.availableForVideoCall ? "Available" : "Not available"}
            </p>
          </div>
        )}
        {(guide.yearsExperience != null || guide.toursCompletedEstimate != null) && (
          <div>
            <h3 className="font-medium">Experience</h3>
            <p className="text-muted-foreground">
              {guide.yearsExperience != null && `${guide.yearsExperience} years`}
              {guide.yearsExperience != null && guide.toursCompletedEstimate != null && " · "}
              {guide.toursCompletedEstimate != null &&
                `~${guide.toursCompletedEstimate} tours completed`}
            </p>
          </div>
        )}
      </section>

      {[
        ["Crisis handling", guide.crisisHandlingExample],
        ["Local expertise", guide.localExpertiseHighlight],
        ["Pre-tour preparation", guide.preTourPreparation],
        ["Best fit for clients", guide.clientFitDescription],
      ].map(([title, text]) =>
        text ? (
          <section key={title as string} className="mt-6">
            <h2 className="text-lg font-semibold mb-2">{title}</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{text as string}</p>
          </section>
        ) : null
      )}

      {guide.assignedTours.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Tours available to book</h2>
          <ul className="space-y-2">
            {guide.assignedTours.map((t) => (
              <li key={t.id} className="p-3 border rounded-lg">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground text-sm">
                  {" "}
                  — {[t.location, t.country].filter(Boolean).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(guide.reviews?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">
            Reviews
            {guide.reviewCount > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({guide.reviewCount})
              </span>
            ) : null}
          </h2>
          <ul className="space-y-3">
            {guide.reviews!.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.reviewerName}
                    </p>
                    {r.destination ? (
                      <p className="text-xs text-muted-foreground">
                        {r.destination}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${
                            i < r.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted"
                          }`}
                        />
                      ))}
                    </span>
                    {r.createdAt ? (
                      <span className="text-xs text-muted-foreground">
                        {formatReviewDate(r.createdAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {r.comment || "No comment provided"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
