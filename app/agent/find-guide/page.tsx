"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { SearchInput } from "@/components/job_board/search-input";
import { ExperienceTierBadge } from "@/components/guide/experience-tier-badge";
import { CertificationBadge } from "@/components/guide/certification-badge";
import { GUIDE_TIERS, guideTierLabel } from "@/lib/guide-tier";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, User2, MapPin } from "lucide-react";
import { Loader2 } from "lucide-react";
import { ContactGuideButton } from "@/components/guide/contact-guide-button";
import { advisorTourLibraryHref } from "@/lib/advisor-tour-library";
import { canonicalizeActivityTypeLabel } from "@/lib/tour-activity-types";

type SearchResult = {
  id: string;
  name: string;
  isOperator?: boolean;
  guideNumber: string | null;
  guideTier: string;
  experienceTier?: number | null;
  experienceTierShortLabel?: string;
  certificationLabel?: string;
  certificationStatus?: string;
  bookingCount?: number;
  rating: number | null;
  reviewCount: number;
  marketplaceAvailable: boolean;
  profilePublished?: boolean;
  profileSlug?: string | null;
  publicProfileUrl?: string | null;
  avatarUrl: string | null;
  tours: Array<{
    id: string;
    name: string;
    location: string;
    country: string;
    activityType: string;
  }>;
  tourCount: number;
};

export default function FindGuidePage() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q, limit: "30" });
      if (tier) params.set("tier", tier);
      const res = await fetch(`/api/guides/search?${params}`);
      const data = await res.json();
      if (data.ok) setResults(data.results || []);
      else {
        setResults([]);
        toast.error(data.error || "Search failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runSearch();
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Find a guide</h1>
      <p className="text-muted-foreground mb-6">
        Search by guide or tour operator name (or guide number) to see their published tours.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Guide or operator name / number…"
            onKeyDown={onSearchKeyDown}
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 bg-background text-sm"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          aria-label="Filter by tier"
        >
          <option value="">All tiers</option>
          {GUIDE_TIERS.map((t) => (
            <option key={t} value={t}>
              {guideTierLabel(t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runSearch}
          disabled={loading || query.trim().length < 2}
          className="px-4 py-2 rounded-md bg-[#D4AA25] text-black font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Search"}
        </button>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </p>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-muted-foreground">No guides found. Try another name or tier.</p>
      )}

      <ul className="space-y-6 mt-6">
        {results.map((g) => (
          <li key={g.id} className="border rounded-lg p-5 bg-card">
            <div className="flex gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={g.avatarUrl || undefined} />
                <AvatarFallback>
                  <User2 className="h-7 w-7" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {g.publicProfileUrl || g.profileSlug ? (
                    <Link
                      href={g.publicProfileUrl || (g.profileSlug ? `/g/${g.profileSlug}` : "#")}
                      target={g.publicProfileUrl ? "_blank" : undefined}
                      rel={g.publicProfileUrl ? "noopener noreferrer" : undefined}
                      className="text-lg font-semibold hover:text-[#D4AA25]"
                    >
                      {g.name}
                    </Link>
                  ) : (
                    <span className="text-lg font-semibold">{g.name}</span>
                  )}
                  {g.isOperator && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#D4AA25]/15 text-[#af8a10] border border-[#D4AA25]/40">
                      Tour operator
                    </span>
                  )}
                  {g.profilePublished === false && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      Profile not published
                    </span>
                  )}
                  <ExperienceTierBadge tier={g.experienceTier} />
                  <CertificationBadge
                    status={g.certificationStatus}
                    bookingCount={g.bookingCount}
                    reviewCount={g.reviewCount}
                  />
                  {g.guideNumber && (
                    <span className="text-sm text-muted-foreground">#{g.guideNumber}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                  {g.rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {g.rating} ({g.reviewCount})
                    </span>
                  )}
                  {g.bookingCount != null && g.bookingCount > 0 && (
                    <span>{g.bookingCount} bookings</span>
                  )}
                  <span>{g.marketplaceAvailable ? "Available" : "Limited availability"}</span>
                  {g.publicProfileUrl && (
                    <Link href={g.publicProfileUrl} className="text-[#D4AA25] hover:underline" target="_blank" rel="noopener noreferrer">
                      View profile
                    </Link>
                  )}
                  <ContactGuideButton
                    guideId={g.id}
                    guideName={g.name}
                    size="sm"
                    variant="outline"
                    className="border-[#D4AA25] text-[#af8a10] hover:bg-[#D4AA25]/10"
                  />
                </div>
              </div>
            </div>
            {g.tours.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm font-medium mb-2">
                  {g.isOperator ? `Published tours (${g.tourCount})` : `Assigned tours (${g.tourCount})`}
                </p>
                {g.tours.map((t) => (
                  <li key={t.id} className="text-sm flex items-start gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <Link
                        href={advisorTourLibraryHref(t.id, { pathname })}
                        className="text-foreground font-medium hover:text-[#D4AA25] hover:underline"
                      >
                        {t.name}
                      </Link>
                      {" — "}
                      {[t.location, t.country].filter(Boolean).join(", ")}
                      {t.activityType &&
                        ` · ${canonicalizeActivityTypeLabel(t.activityType)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-4 border-t pt-4">
                {g.isOperator
                  ? "No published tours in their library yet."
                  : "No published tour assignments yet."}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
