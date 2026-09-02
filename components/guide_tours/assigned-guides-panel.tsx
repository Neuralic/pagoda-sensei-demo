"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildPublicProfilePath } from "@/lib/profile-refresh";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, User2 } from "lucide-react";
import { GuideTierBadge } from "./guide-tier-badge";
import type { AssignedGuideSummary } from "@/lib/guide-tour-assignments";

type Props = {
  tourId: string;
  /** Pre-loaded from tour list API */
  initialGuides?: AssignedGuideSummary[];
  tierFilter?: string | null;
};

export function AssignedGuidesPanel({ tourId, initialGuides, tierFilter }: Props) {
  const [guides, setGuides] = useState<AssignedGuideSummary[]>(initialGuides || []);
  const [loading, setLoading] = useState(!initialGuides?.length);

  useEffect(() => {
    if (initialGuides?.length) {
      setGuides(initialGuides);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/operator/guide-tour-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tourIds: [tourId],
            tier: tierFilter || undefined,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setGuides(data.guidesByTour?.[tourId] || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tourId, tierFilter, initialGuides]);

  if (loading) {
    return (
      <div className="mt-4 p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
        Loading available guides…
      </div>
    );
  }

  if (guides.length === 0) {
    return (
      <div className="mt-4 p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
        No guides are assigned to this tour yet.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-medium text-foreground">Available guides</p>
      <ul className="space-y-2">
        {guides.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/30"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={g.avatarUrl || undefined} alt={g.name} />
              <AvatarFallback>
                <User2 className="h-5 w-5 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={buildPublicProfilePath(g.profileSlug) || "#"}
                  target={g.profileSlug ? "_blank" : undefined}
                  rel={g.profileSlug ? "noopener noreferrer" : undefined}
                  className="font-medium text-foreground hover:text-[#D4AA25] truncate"
                  onClick={(e) => {
                    if (!g.profileSlug) e.preventDefault();
                  }}
                >
                  {g.name}
                </Link>
                <GuideTierBadge tier={g.guideTier} />
                {!g.marketplaceAvailable && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Limited availability
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {g.guideNumber && <span>#{g.guideNumber}</span>}
                {g.rating != null && (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {g.rating}
                    {g.reviewCount > 0 && ` (${g.reviewCount})`}
                  </span>
                )}
                {g.marketplaceAvailable ? (
                  <span className="text-emerald-700">Available</span>
                ) : (
                  <span>Check availability</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
