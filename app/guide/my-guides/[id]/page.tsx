"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { GuideProfileForm, type GuideFormValues } from "@/components/operator/guide-profile-form";
import { isAvailabilityConfigured, parseAvailabilityCalendar } from "@/lib/guide-availability";
import { ExperienceTierBadge } from "@/components/guide/experience-tier-badge";
import { CertificationBadge } from "@/components/guide/certification-badge";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { GuideStatusActions } from "@/components/operator/guide-status-actions";

export default function EditGuidePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [initial, setInitial] = useState<Partial<GuideFormValues> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState<string | null>(null);
  const [introVideoPreviewUrl, setIntroVideoPreviewUrl] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [availabilityConfigured, setAvailabilityConfigured] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [meta, setMeta] = useState<{
    certificationStatus?: string;
    certificationLabel?: string;
    experienceTier?: number | null;
    experienceTierLabel?: string;
    experienceTierSource?: string | null;
    bookingCount?: number;
    ratingAverage?: number | null;
    reviewCount?: number;
  }>({});
  const [guideProfileStatus, setGuideProfileStatus] = useState("draft");
  const [guideIsActive, setGuideIsActive] = useState(true);

  const loadGuide = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/operator/my-guides/${id}`);
    const data = await res.json();
    if (!res.ok || !data.ok || !data.guide) {
      setLoadError(data.error || "Could not load guide");
      setInitial(null);
      return;
    }
    setPublicUrl(data.guide.publicProfileUrl || null);
    setGuideProfileStatus(String(data.guide.profile?.guide_profile_status || "draft"));
    setGuideIsActive(data.guide.user?.is_active !== false);
    setMeta({
      certificationStatus: data.guide.certificationStatus,
      certificationLabel: data.guide.certificationLabel,
      experienceTier: data.guide.experienceTier,
      experienceTierLabel: data.guide.experienceTierLabel,
      experienceTierSource: data.guide.experienceTierSource,
      bookingCount: data.guide.bookingCount,
      ratingAverage: data.guide.ratingAverage,
      reviewCount: data.guide.reviewCount,
    });
    const u = data.guide.user;
    const p = data.guide.profile;
    setInitial({
      fullName: `${u?.first_name || ""} ${u?.last_name || ""}`.trim(),
      bio: p?.bio || "",
      languages: p?.languages || [],
      destinations: p?.destinations || [],
      yearsExperience: p?.years_experience != null ? String(p.years_experience) : "",
      toursCompletedEstimate:
        p?.tours_completed_estimate != null ? String(p.tours_completed_estimate) : "",
      experienceTierDeclared:
        p?.experience_tier_declared != null ? String(p.experience_tier_declared) : "2",
      crisisHandlingExample: p?.crisis_handling_example || "",
      localExpertiseHighlight: p?.local_expertise_highlight || "",
      preTourPreparation: p?.pre_tour_preparation || "",
      clientFitDescription: p?.client_fit_description || "",
      availableForVideoCall:
        p?.available_for_video_call === true
          ? true
          : p?.available_for_video_call === false
            ? false
            : null,
      introVideoUrl: p?.intro_video_url || "",
      profilePicturePath: p?.profile_picture_path || "",
      introVideoPath: p?.intro_video_path || "",
      country: u?.country || "",
      city: u?.city || "",
      unavailableDates: parseAvailabilityCalendar(p?.guide_availability_calendar).unavailableDates,
    });
    setAvailabilityConfigured(
      isAvailabilityConfigured(parseAvailabilityCalendar(p?.guide_availability_calendar))
    );
    setProfilePicturePreviewUrl((p?.avatarUrl as string) || null);
    setIntroVideoPreviewUrl((p?.introVideoSignedUrl as string) || null);
  }, [id]);

  useEffect(() => {
    void loadGuide();
  }, [loadGuide]);

  const copyPublicLink = async () => {
    if (!publicUrl) return;
    const ok = await copyTextToClipboard(publicUrl);
    if (!ok) {
      toast.error("Could not copy — select the link and copy manually");
      return;
    }
    setLinkCopied(true);
    toast.success("Profile link copied");
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loadError) {
    return (
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <p className="text-destructive">{loadError}</p>
        <Link href="/guide/my-guides" className="text-sm text-[#D4AA25] hover:underline mt-4 inline-block">
          ← My Guides
        </Link>
      </main>
    );
  }

  if (!initial) {
    return <p className="p-10 text-muted-foreground">Loading…</p>;
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/guide/my-guides" className="text-sm text-[#D4AA25] hover:underline">
        ← My Guides
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-4 mb-2">
        <h1 className="text-2xl font-bold">Edit guide profile</h1>
        <GuideStatusActions
          guideId={id}
          guideProfileStatus={guideProfileStatus}
          isActive={guideIsActive}
          onUpdated={() => void loadGuide()}
          onDeleted={() => router.push("/guide/my-guides")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CertificationBadge
          status={meta.certificationStatus}
          bookingCount={meta.bookingCount}
          reviewCount={meta.reviewCount}
        />
        <ExperienceTierBadge tier={meta.experienceTier} />
        {meta.experienceTierLabel && (
          <span className="text-sm text-muted-foreground">{meta.experienceTierLabel}</span>
        )}
      </div>

      {meta.bookingCount != null && (
        <p className="text-sm text-muted-foreground mb-4">
          {meta.bookingCount} bookings
          {meta.ratingAverage != null && ` · ★ ${meta.ratingAverage} avg`}
          {meta.reviewCount != null && meta.reviewCount > 0 && ` · ${meta.reviewCount} reviews`}
        </p>
      )}

      {publicUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4">
          <span>
            Public link:{" "}
            <a href={publicUrl} className="text-[#D4AA25] underline" target="_blank" rel="noopener noreferrer">
              {publicUrl}
            </a>
          </span>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={copyPublicLink}>
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy link
          </Button>
        </div>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
          Publish this profile from My Guides to enable the shareable public link.
        </p>
      )}

      <GuideProfileForm
        guideId={id}
        initial={initial}
        initialAvailabilityConfigured={availabilityConfigured}
        initialProfilePicturePreviewUrl={profilePicturePreviewUrl}
        initialIntroVideoPreviewUrl={introVideoPreviewUrl}
        onSaved={(saved) => {
          setMeta((prev) => ({
            ...prev,
            ...(saved.certificationLabel != null
              ? { certificationLabel: saved.certificationLabel }
              : {}),
            ...(saved.experienceTierLabel != null
              ? { experienceTierLabel: saved.experienceTierLabel }
              : {}),
          }));
          void loadGuide();
        }}
      />
    </main>
  );
}
