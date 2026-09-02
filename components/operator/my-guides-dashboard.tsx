"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExperienceTierBadge } from "@/components/guide/experience-tier-badge";
import { CertificationBadge } from "@/components/guide/certification-badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, ArrowRight } from "lucide-react";
import type { ProfileCompleteness } from "@/lib/profile-completeness";
import { ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";

type GuideSummary = {
  id: string;
  name: string;
  guideProfileStatus: string;
  certificationStatus?: string;
  certificationLabel?: string;
  experienceTier?: number | null;
  experienceTierShortLabel?: string;
  bookingCount: number;
  ratingAverage: number | null;
  profileCompleteness?: ProfileCompleteness;
};

export function MyGuidesDashboard() {
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownCompleteness, setOwnCompleteness] = useState<ProfileCompleteness | null>(null);
  const [ownProfileStatus, setOwnProfileStatus] = useState("draft");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [guidesRes, profileRes] = await Promise.all([
        fetch("/api/operator/my-guides"),
        fetch("/api/profile", { cache: "no-store" }),
      ]);
      const guidesData = await guidesRes.json();
      const profileData = await profileRes.json();
      if (cancelled) return;
      if (guidesRes.ok && guidesData.guides) {
        const active = (guidesData.guides as GuideSummary[]).filter(
          (g) =>
            g.guideProfileStatus !== "archived" &&
            g.guideProfileStatus !== "deactivated"
        );
        setGuides(active.slice(0, 5));
      }
      if (profileRes.ok && profileData.profileCompleteness) {
        setOwnCompleteness(profileData.profileCompleteness);
        setOwnProfileStatus(String(profileData.profile?.guide_profile_status || "draft"));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-8 rounded-xl border border-[#D4AA25]/30 bg-[#D4AA25]/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D4AA25]/20">
            <Users className="h-5 w-5 text-[#af8a10]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">My Guides</h2>
            <p className="text-sm text-muted-foreground">
              Manage your team. Your own public profile is edited in{" "}
              <Link href="/settings" className="text-[#D4AA25] font-semibold hover:underline">
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="border-[#D4AA25] text-[#af8a10]">
            <Link href="/settings">Your profile</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="border-[#D4AA25] text-[#af8a10]">
            <Link href="/guide/my-guides">View all</Link>
          </Button>
          <Button asChild size="sm" className="bg-[#D4AA25] text-black gap-1">
            <Link href="/guide/my-guides/new">
              <Plus className="h-4 w-4" />
              Add guide
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary" className="gap-1">
            <Link href="/guide/my-guides/invite">
              Send invite
            </Link>
          </Button>
        </div>
      </div>

      {ownCompleteness && (
        <div className="mb-4">
          <ProfileCompletenessCard
            title="Your operator profile"
            completeness={ownCompleteness}
            guideProfileStatus={ownProfileStatus}
            editHref="/settings"
          />
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading team…</p>}

      {!loading && guides.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No active guides yet.{" "}
          <Link href="/guide/my-guides/new" className="text-[#D4AA25] font-semibold hover:underline">
            Add your first guide
          </Link>{" "}
          or{" "}
          <Link href="/guide/my-guides/invite" className="text-[#D4AA25] font-semibold hover:underline">
            send an invite link
          </Link>
          .
        </p>
      )}

      {guides.length > 0 && (
        <ul className="space-y-2">
          {guides.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground ml-2 capitalize">{g.guideProfileStatus}</span>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <CertificationBadge status={g.certificationStatus} bookingCount={g.bookingCount} />
                  <ExperienceTierBadge tier={g.experienceTier} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {g.bookingCount} bookings
                  {g.ratingAverage != null && ` · ★ ${g.ratingAverage}`}
                </div>
                {g.profileCompleteness && (
                  <p className="text-xs mt-1">
                    Profile {g.profileCompleteness.percent}% complete
                    {g.guideProfileStatus !== "published" && " · not published"}
                  </p>
                )}
              </div>
              <Link
                href={`/guide/my-guides/${g.id}`}
                className="inline-flex items-center text-[#D4AA25] font-semibold hover:underline"
              >
                Edit <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
