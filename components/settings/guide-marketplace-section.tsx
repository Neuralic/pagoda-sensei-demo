"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { Copy, Check, ExternalLink } from "lucide-react";
import type { ProfileCompleteness } from "@/lib/profile-completeness";
import {
  CERTIFICATION_PROFILE_FIELDS,
  VIDEO_CALL_AVAILABILITY_QUESTION,
  validateGuideFormValues,
  validateGuideSettingsFormForDraft,
  parseOptionalExperienceTier,
} from "@/lib/guide-marketplace-validation";
import { EXPERIENCE_TIER_LABELS } from "@/lib/guide-profile-slug";
import { GuideAvailabilityCalendarModal } from "@/components/guide/guide-availability-calendar-modal";
import { isAvailabilityConfigured, parseAvailabilityCalendar } from "@/lib/guide-availability";
import { ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";
import { TagMultiSelect } from "@/components/shared/tag-multi-select";
import { JAPAN_PREFECTURES } from "@/lib/japan-prefectures";
import { COMMON_GUIDE_LANGUAGES } from "@/lib/guide-languages";
import { getLanguageFlagCode } from "@/lib/countries-map";
import { CountrySelect } from "@/components/shared/country-select";
import { StorageUploadField } from "@/components/operator/storage-upload-field";
import { BUCKETS } from "@/lib/buckets";
import { getSignedUrls } from "@/lib/storage-sign-client";
import {
  PROFILE_UPDATED_EVENT,
  buildPublicProfileUrl,
  notifyProfileUpdated,
} from "@/lib/profile-refresh";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";

export default function GuideMarketplaceSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string>("draft");
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [isGuide, setIsGuide] = useState(false);
  const [isManagedGuide, setIsManagedGuide] = useState(false);
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState<string | null>(null);
  const [introVideoPreviewUrl, setIntroVideoPreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    bio: "",
    languages: [] as string[],
    country: "",
    city: "",
    profilePicturePath: "",
    introVideoPath: "",
    yearsExperience: "",
    toursCompletedEstimate: "",
    experienceTierDeclared: "2",
    destinations: [] as string[],
    availableForVideoCall: null as boolean | null,
    crisisHandlingExample: "",
    localExpertiseHighlight: "",
    preTourPreparation: "",
    clientFitDescription: "",
    introVideoUrl: "",
    unavailableDates: [] as string[],
  });
  const [availabilityConfigured, setAvailabilityConfigured] = useState(false);
  const skipAutoSaveRef = useRef(true);
  const autoSaveReadyRef = useRef(false);

  const applyProfileData = useCallback((data: Record<string, unknown>) => {
    const user = data.user as Record<string, unknown> | null;
    const p = data.profile as Record<string, unknown> | null;
    if (user?.role === "guide") setIsGuide(true);
    if (user) {
      setIsManagedGuide(Boolean(user.isManagedGuide));
      setOperatorName((user.managedByOperatorName as string) || null);
      setUserId(String(user.id || ""));
      setForm((f) => ({
        ...f,
        firstName: String(user.first_name || ""),
        lastName: String(user.last_name || ""),
      }));
    }
    if (p) {
      const slug = (p.profile_slug as string) || null;
      const published = p.guide_profile_status === "published";
      setProfileSlug(slug);
      setPublicUrl(
        (p.publicProfileUrl as string) ||
          buildPublicProfileUrl(slug, {
            published,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          })
      );
      setProfileStatus(String(p.guide_profile_status || "draft"));
      setForm((f) => ({
        ...f,
        bio: (p.bio as string) || "",
        languages: Array.isArray(p.languages) ? (p.languages as string[]) : [],
        country: (p.country as string) || "",
        city: (p.city as string) || "",
        profilePicturePath: (p.profile_picture_path as string) || "",
        introVideoPath: (p.intro_video_path as string) || "",
        yearsExperience: p.years_experience != null ? String(p.years_experience) : "",
        toursCompletedEstimate:
          p.tours_completed_estimate != null ? String(p.tours_completed_estimate) : "",
        experienceTierDeclared:
          p.experience_tier_declared != null ? String(p.experience_tier_declared) : "2",
        destinations: Array.isArray(p.destinations) ? (p.destinations as string[]) : [],
        availableForVideoCall:
          p.available_for_video_call === true
            ? true
            : p.available_for_video_call === false
              ? false
              : null,
        crisisHandlingExample: (p.crisis_handling_example as string) || "",
        localExpertiseHighlight: (p.local_expertise_highlight as string) || "",
        preTourPreparation: (p.pre_tour_preparation as string) || "",
        clientFitDescription: (p.client_fit_description as string) || "",
        introVideoUrl: (p.intro_video_url as string) || "",
        unavailableDates: parseAvailabilityCalendar(p.guide_availability_calendar).unavailableDates,
      }));
      setAvailabilityConfigured(
        isAvailabilityConfigured(parseAvailabilityCalendar(p.guide_availability_calendar))
      );
      setProfilePicturePreviewUrl((p.avatarUrl as string) || null);
      const introPath = p.intro_video_path as string | undefined;
      if (introPath) {
        void getSignedUrls([{ bucket: BUCKETS.introVideos, path: introPath }]).then(([u]) => {
          setIntroVideoPreviewUrl(u?.signedUrl || u?.publicUrl || null);
        });
      } else {
        setIntroVideoPreviewUrl(null);
      }
    }
    if (data.profileCompleteness) {
      setCompleteness(data.profileCompleteness as ProfileCompleteness);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.ok) applyProfileData(data);
  }, [applyProfileData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadProfile();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  useEffect(() => {
    const onRefresh = () => void loadProfile();
    window.addEventListener(PROFILE_UPDATED_EVENT, onRefresh);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onRefresh);
  }, [loadProfile]);

  const persistProfile = useCallback(
    async (opts: { draft?: boolean; silent?: boolean } = {}) => {
      const draft = opts.draft !== false;
      const silent = opts.silent === true;

      if (draft) {
        const check = validateGuideSettingsFormForDraft({
          bio: form.bio,
          crisisHandlingExample: form.crisisHandlingExample,
          localExpertiseHighlight: form.localExpertiseHighlight,
          preTourPreparation: form.preTourPreparation,
          clientFitDescription: form.clientFitDescription,
        });
        if (!check.ok) {
          if (!silent) toast.error(check.error);
          return false;
        }
      } else {
        if (!form.firstName.trim()) {
          toast.error("First name is required");
          return false;
        }
        const fullName = `${form.firstName} ${form.lastName}`.trim();
        const check = validateGuideFormValues({
          fullName: fullName || "Guide",
          bio: form.bio,
          languages: form.languages,
          yearsExperience: form.yearsExperience,
          toursCompletedEstimate: form.toursCompletedEstimate,
          experienceTierDeclared: form.experienceTierDeclared,
          crisisHandlingExample: form.crisisHandlingExample,
          localExpertiseHighlight: form.localExpertiseHighlight,
          preTourPreparation: form.preTourPreparation,
          clientFitDescription: form.clientFitDescription,
          availableForVideoCall: form.availableForVideoCall,
          profilePicturePath: form.profilePicturePath,
          introVideoPath: form.introVideoPath,
          introVideoUrl: form.introVideoUrl,
        });
        if (!check.ok) {
          toast.error(check.error);
          return false;
        }
      }

      if (!silent) setSaving(true);
      try {
        if (form.firstName.trim()) {
          await fetch("/api/user/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
            }),
          });
        }

        const tier = parseOptionalExperienceTier(form.experienceTierDeclared);
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bio: form.bio,
            languages: form.languages,
            country: form.country,
            city: form.city,
            profile_picture_path: form.profilePicturePath || null,
            intro_video_path: form.introVideoPath || null,
            yearsExperience: form.yearsExperience ? parseInt(form.yearsExperience, 10) : null,
            toursCompletedEstimate: form.toursCompletedEstimate
              ? parseInt(form.toursCompletedEstimate, 10)
              : null,
            experienceTierDeclared: tier,
            destinations: form.destinations,
            availableForVideoCall: form.availableForVideoCall,
            crisisHandlingExample: form.crisisHandlingExample,
            localExpertiseHighlight: form.localExpertiseHighlight,
            preTourPreparation: form.preTourPreparation,
            clientFitDescription: form.clientFitDescription,
            introVideoUrl: form.introVideoUrl || null,
            unavailableDates: form.unavailableDates,
            saveAvailabilityCalendar: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!silent) toast.error(data.error || "Save failed");
          return false;
        }
        setAvailabilityConfigured(true);
        if (data.profileCompleteness) setCompleteness(data.profileCompleteness);
        await loadProfile();
        notifyProfileUpdated();
        if (!silent) {
          toast.success(draft ? "Draft saved" : "Guide profile saved");
        }
        return true;
      } finally {
        if (!silent) setSaving(false);
      }
    },
    [form, loadProfile]
  );

  const persistMediaPath = useCallback(
    async (field: "profile_picture_path" | "intro_video_path", path: string) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: path || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to save upload");
      }
      if ((data as { profileCompleteness?: ProfileCompleteness }).profileCompleteness) {
        setCompleteness((data as { profileCompleteness: ProfileCompleteness }).profileCompleteness);
      }
      notifyProfileUpdated();
    },
    []
  );

  useEffect(() => {
    if (!loading) autoSaveReadyRef.current = true;
  }, [loading]);

  useEffect(() => {
    if (!autoSaveReadyRef.current || loading) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void persistProfile({ draft: true, silent: true });
    }, 45000);
    return () => clearTimeout(timer);
  }, [form, loading, persistProfile]);

  const saveDraft = () => void persistProfile({ draft: true });

  const save = () => void persistProfile({ draft: false });

  const publish = async () => {
    setPublishing(true);
    const res = await fetch("/api/profile/publish", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPublishing(false);
    if (!res.ok) {
      toast.error((data as { error?: string })?.error || "Cannot publish");
      return;
    }
    setProfileStatus("published");
    if ((data as { publicProfileUrl?: string }).publicProfileUrl) {
      setPublicUrl((data as { publicProfileUrl: string }).publicProfileUrl);
    } else if (profileSlug) {
      setPublicUrl(
        buildPublicProfileUrl(profileSlug, {
          published: true,
          origin: window.location.origin,
        })
      );
    }
    if ((data as { profileCompleteness?: ProfileCompleteness }).profileCompleteness) {
      setCompleteness((data as { profileCompleteness: ProfileCompleteness }).profileCompleteness);
    }
    notifyProfileUpdated();
    toast.success("Profile published");
  };

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

  if (loading || !isGuide) return null;

  const mediaFolder = userId ? `operators/self/${userId}` : "operators/self";

  return (
    <Card className="p-6 border border-border">
      <h2 className="text-xl font-bold text-foreground mb-2">Guide profile</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {isManagedGuide
          ? `Your public marketplace profile${operatorName ? ` (team: ${operatorName})` : ""}. Save a draft anytime — photo uploads are saved immediately. Publish when every field is complete.`
          : "Your operator account and public guide profile are one profile. Save a draft anytime while you work — photo uploads are saved immediately. Publish when ready."}
      </p>

      {completeness && (
        <div className="mb-4">
          <ProfileCompletenessCard
            completeness={completeness}
            guideProfileStatus={profileStatus}
            showPublishItem
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs px-2 py-1 rounded border capitalize">Status: {profileStatus}</span>
        {profileStatus !== "published" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={publishing || (completeness != null && completeness.percent < 100)}
            onClick={publish}
            className="border-[#D4AA25] text-[#af8a10]"
          >
            {publishing ? "Publishing…" : "Publish profile"}
          </Button>
        )}
      </div>

      {profileStatus === "published" && publicUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-sm mb-4">
          <span>
            Public link:{" "}
            <a
              href={publicUrl}
              className="text-[#D4AA25] underline break-all"
              target="_blank"
              rel="noopener noreferrer"
            >
              {publicUrl}
            </a>
          </span>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={copyPublicLink}>
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy link
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              View
            </a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
          Complete all items above, save, then publish to activate your public profile link.
        </p>
      )}

      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>First name *</Label>
            <Input
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div>
            <Label>Last name</Label>
            <Input
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <CountrySelect
            label="Country"
            value={form.country}
            onChange={(country) => setForm((f) => ({ ...f, country }))}
            placeholder="Where are you based?"
          />
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
        </div>

        <div>
          <Label>Short bio *</Label>
          <Textarea
            rows={5}
            maxLength={6000}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </div>

        <TagMultiSelect
          label="Languages spoken"
          required
          suggestions={COMMON_GUIDE_LANGUAGES}
          selected={form.languages}
          onChange={(languages) => setForm((f) => ({ ...f, languages }))}
          addPlaceholder="Add another language and press Enter"
          getFlagCode={getLanguageFlagCode}
        />

        <StorageUploadField
          label="Profile photo"
          required
          bucket={BUCKETS.avatars}
          folder={`${mediaFolder}/avatar`}
          accept="image/*"
          value={form.profilePicturePath}
          previewUrl={profilePicturePreviewUrl}
          onChange={(path) => setForm((f) => ({ ...f, profilePicturePath: path }))}
          onPreviewUrl={setProfilePicturePreviewUrl}
          onUploaded={(path) => persistMediaPath("profile_picture_path", path)}
        />

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <Label>{VIDEO_CALL_AVAILABILITY_QUESTION} *</Label>
          <p className="text-xs text-muted-foreground">
            Guides who prefer not to upload a video can still be matched if they are open to a live
            call with a travel advisor.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="settingsAvailableForVideoCall"
                checked={form.availableForVideoCall === true}
                onChange={() => setForm((f) => ({ ...f, availableForVideoCall: true }))}
              />
              Yes
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="settingsAvailableForVideoCall"
                checked={form.availableForVideoCall === false}
                onChange={() => setForm((f) => ({ ...f, availableForVideoCall: false }))}
              />
              No
            </label>
          </div>
        </div>

        <StorageUploadField
          label="Introduction video (optional)"
          bucket={BUCKETS.introVideos}
          folder={`${mediaFolder}/intro`}
          accept="video/*"
          value={form.introVideoPath}
          previewUrl={introVideoPreviewUrl}
          onChange={(path) => setForm((f) => ({ ...f, introVideoPath: path }))}
          onPreviewUrl={setIntroVideoPreviewUrl}
          onUploaded={(path) => persistMediaPath("intro_video_path", path)}
          hint="Optional — MP4 or MOV, max 500MB. Or paste a YouTube/Vimeo URL below."
        />

        <div>
          <Label>Introduction video URL (optional)</Label>
          <Input
            value={form.introVideoUrl}
            onChange={(e) => setForm((f) => ({ ...f, introVideoUrl: e.target.value }))}
            placeholder="YouTube or Vimeo link"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Years of experience *</Label>
            <Input
              type="number"
              min={0}
              value={form.yearsExperience}
              onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
            />
          </div>
          <div>
            <Label>Estimated tours completed *</Label>
            <Input
              type="number"
              min={0}
              value={form.toursCompletedEstimate}
              onChange={(e) => setForm((f) => ({ ...f, toursCompletedEstimate: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Experience tier *</Label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-background"
            value={form.experienceTierDeclared}
            onChange={(e) => setForm((f) => ({ ...f, experienceTierDeclared: e.target.value }))}
          >
            <option value="1">{EXPERIENCE_TIER_LABELS[1]}</option>
            <option value="2">{EXPERIENCE_TIER_LABELS[2]}</option>
            <option value="3">{EXPERIENCE_TIER_LABELS[3]}</option>
          </select>
        </div>

        <TagMultiSelect
          label="Destinations covered"
          suggestions={JAPAN_PREFECTURES}
          selected={form.destinations}
          onChange={(destinations) => setForm((f) => ({ ...f, destinations }))}
          addPlaceholder="Add another destination and press Enter"
          filterPlaceholder="Filter prefectures…"
          hint="Select Japanese prefectures or add other destinations."
        />

        <GuideAvailabilityCalendarModal
          value={form.unavailableDates}
          onChange={(dates) => setForm((f) => ({ ...f, unavailableDates: dates }))}
          configured={availabilityConfigured}
        />

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <h3 className="font-semibold text-foreground">Certification profile</h3>
          {CERTIFICATION_PROFILE_FIELDS.map(({ key, label, hint }) => (
            <div key={key}>
              <Label htmlFor={`settings-${key}`}>{label} *</Label>
              <p className="text-xs text-muted-foreground mb-1">{hint}</p>
              <Textarea
                id={`settings-${key}`}
                rows={3}
                maxLength={500}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveDraft} disabled={saving} className="bg-[#D4AA25] text-black">
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" variant="outline" onClick={save} disabled={saving}>
            Save & validate
          </Button>
        </div>
      </div>
    </Card>
  );
}
