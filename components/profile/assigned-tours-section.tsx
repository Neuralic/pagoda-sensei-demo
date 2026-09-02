"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import type { AssignedTourSummary } from "@/lib/guide-tour-assignments";

export function AssignedToursSection({ tours }: { tours: AssignedTourSummary[] }) {
  if (!tours.length) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-foreground mb-4">Tours this guide leads</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tours.map((t) => (
          <article
            key={t.id}
            className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:border-[#D4AA25]/40 transition-colors"
          >
            <div className="relative h-20 w-28 shrink-0 rounded-md overflow-hidden bg-muted">
              <Image
                src={t.image?.startsWith("http") ? t.image : "/assets/images/profile/placeholder.svg"}
                alt={t.name}
                fill
                className="object-cover"
                unoptimized={Boolean(t.image?.startsWith("http"))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-foreground truncate">{t.name}</h3>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {[t.location, t.country].filter(Boolean).join(", ")}
                </span>
              </p>
              {t.activityType && (
                <p className="text-xs text-muted-foreground mt-1">{t.activityType}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">by {t.operatorName}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        Contact the operator or use the tour library when building an itinerary to book with this guide.
      </p>
    </section>
  );
}
