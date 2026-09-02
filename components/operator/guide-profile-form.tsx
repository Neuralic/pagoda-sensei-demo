"use client";

import { StorageUploadField } from "@/components/operator/storage-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUCKETS } from "@/lib/buckets";
import {
  CERTIFICATION_PROFILE_FIELDS,
  VIDEO_CALL_AVAILABILITY_QUESTION,
  validateGuideFormValues,
  validateGuideFormValuesForDraft,
  parseOptionalExperienceTier,
} from "@/lib/guide-marketplace-validation";
import { GuideAvailabilityCalendarModal } from "@/components/guide/guide-availability-calendar-modal";
import { EXPERIENCE_TIER_LABELS } from "@/lib/guide-profile-slug";
import { CountrySelect } from "@/components/shared/country-select";
import { TagMultiSelect } from "@/components/shared/tag-multi-select";
import { JAPAN_PREFECTURES } from "@/lib/japan-prefectures";
import { COMMON_GUIDE_LANGUAGES } from "@/lib/guide-languages";
import { getLanguageFlagCode } from "@/lib/countries-map";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

export type GuideFormValues = {
  fullName: string;
  bio: string;
  languages: string[];
  destinations: string[];
  yearsExperience: string;
  toursCompletedEstimate: string;
  experienceTierDeclared: string;
  crisisHandlingExample: string;
  localExpertiseHighlight: string;
  preTourPreparation: string;
  clientFitDescription: string;
  availableForVideoCall: boolean | null;
  introVideoUrl: string;
  profilePicturePath: string;
  introVideoPath: string;
  country: string;
  city: string;
  unavailableDates: string[];
};

const empty: GuideFormValues = {
  fullName: "",
  bio: "",
  languages: ["English"],
  destinations: [],
  yearsExperience: "",
  toursCompletedEstimate: "",
  experienceTierDeclared: "2",
  crisisHandlingExample: "",
  localExpertiseHighlight: "",
  preTourPreparation: "",
  clientFitDescription: "",
  availableForVideoCall: null,
  introVideoUrl: "",
  profilePicturePath: "",
  introVideoPath: "",
  country: "",
  city: "",
  unavailableDates: [],
};

export type GuideProfileSaveMeta = {
  certificationLabel?: string;
  experienceTierLabel?: string;
  experienceTierShortLabel?: string;
};

type Props = {
  guideId?: string;
  initial?: Partial<GuideFormValues>;
  initialAvailabilityConfigured?: boolean;
  initialProfilePicturePreviewUrl?: string | null;
  initialIntroVideoPreviewUrl?: string | null;
  /** Called after a successful update so parent UI (tier badge, etc.) can refresh */
  onSaved?: (meta: GuideProfileSaveMeta) => void;
};

export function GuideProfileForm({
  guideId,
  initial,
  initialAvailabilityConfigured,
  initialProfilePicturePreviewUrl,
  initialIntroVideoPreviewUrl,
  onSaved,
}: Props) {
  const router = useRouter();
  const certSectionRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<GuideFormValues>({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [certHighlight, setCertHighlight] = useState(false);
  const [availabilityConfigured, setAvailabilityConfigured] = useState(
    initialAvailabilityConfigured ?? false
  );

  const scrollToCertSection = () => {
    certSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCertHighlight(true);
    window.setTimeout(() => setCertHighlight(false), 2500);
  };

  const scrollToField = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const persist = async (saveAsDraft: boolean) => {
    const check = saveAsDraft ? validateGuideFormValuesForDraft(form) : validateGuideFormValues(form);
    if (!check.ok) {
      toast.error(check.error);
      if (
        !saveAsDraft &&
        check.field &&
        CERTIFICATION_PROFILE_FIELDS.some((f) => f.key === check.field)
      ) {
        scrollToCertSection();
      } else if (!saveAsDraft && check.field === "experienceTierDeclared") {
        scrollToField("experience-tier-field");
      } else if (!saveAsDraft && check.field === "availableForVideoCall") {
        scrollToField("video-call-field");
      }
      return;
    }
    setSaving(true);
    const payload = {
      saveAsDraft,
      fullName: form.fullName,
      bio: form.bio,
      languages: form.languages,
      destinations: form.destinations,
      yearsExperience: form.yearsExperience ? parseInt(form.yearsExperience, 10) : null,
      toursCompletedEstimate: form.toursCompletedEstimate
        ? parseInt(form.toursCompletedEstimate, 10)
        : null,
      experienceTierDeclared: parseOptionalExperienceTier(form.experienceTierDeclared),
      crisisHandlingExample: form.crisisHandlingExample,
      localExpertiseHighlight: form.localExpertiseHighlight,
      preTourPreparation: form.preTourPreparation,
      clientFitDescription: form.clientFitDescription,
      availableForVideoCall: form.availableForVideoCall,
      introVideoUrl: form.introVideoUrl || null,
      profilePicturePath: form.profilePicturePath || null,
      introVideoPath: form.introVideoPath || null,
      country: form.country,
      city: form.city,
      unavailableDates: form.unavailableDates,
      saveAvailabilityCalendar: true,
    };

    const url = guideId ? `/api/operator/my-guides/${guideId}` : "/api/operator/my-guides";
    const method = guideId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error || "Save failed");
      if (
        !saveAsDraft &&
        data.field &&
        CERTIFICATION_PROFILE_FIELDS.some((f) => f.key === data.field)
      ) {
        scrollToCertSection();
      } else if (!saveAsDraft && data.field === "experienceTierDeclared") {
        scrollToField("experience-tier-field");
      } else if (!saveAsDraft && data.field === "availableForVideoCall") {
        scrollToField("video-call-field");
      }
      return;
    }
    setAvailabilityConfigured(true);
    toast.success(saveAsDraft ? "Draft saved" : "Guide profile saved");
    if (guideId) {
      onSaved?.({
        certificationLabel: data.certificationLabel,
        experienceTierLabel: data.experienceTierLabel,
        experienceTierShortLabel: data.experienceTierShortLabel,
      });
    } else if (!saveAsDraft) {
      router.push(`/guide/my-guides/${data.guideUserId}`);
    } else if (data.guideUserId) {
      router.push(`/guide/my-guides/${data.guideUserId}`);
    }
  };

  const save = () => void persist(false);
  const saveDraft = () => void persist(true);

  const persistMediaPath = async (field: "profilePicturePath" | "introVideoPath", path: string) => {
    if (!guideId) return;
    const res = await fetch(`/api/operator/my-guides/${guideId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saveAsDraft: true,
        fullName: form.fullName || "Guide",
        [field]: path,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save upload");
    }
  };

  const guideFolder = guideId ? `operators/guides/${guideId}` : "operators/guides/draft";

  return (
    <form
      className="space-y-6 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <Label>Full name *</Label>
        <Input
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          required
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <CountrySelect
          label="Country"
          value={form.country}
          onChange={(country) => setForm((f) => ({ ...f, country }))}
          placeholder="Where is this guide based?"
        />
        <div>
          <Label>City</Label>
          <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
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

      <div id="experience-tier-field" className="scroll-mt-4 rounded-lg border border-border bg-muted/30 p-4">
        <Label>Experience tier (self-declared) *</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Every guide is assigned one of three tiers (badge and search position). Tiers are
          self-declared by the operator and may be validated or adjusted by Pagoda admin from
          performance data.
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
          Important: misrepresenting a tier (e.g. Tier 1 when experience does not support it) can
          trigger review and removal from the marketplace. You are responsible for accurate
          declaration on behalf of your guides.
        </p>
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

      <StorageUploadField
        label="Profile photo"
        required
        bucket={BUCKETS.avatars}
        folder={`${guideFolder}/avatar`}
        accept="image/*"
        value={form.profilePicturePath}
        previewUrl={initialProfilePicturePreviewUrl}
        onChange={(path) => setForm((f) => ({ ...f, profilePicturePath: path }))}
        onUploaded={(path) => persistMediaPath("profilePicturePath", path)}
      />

      <div
        id="video-call-field"
        className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 scroll-mt-4"
      >
        <Label>{VIDEO_CALL_AVAILABILITY_QUESTION} *</Label>
        <p className="text-xs text-muted-foreground">
          Guides who prefer not to upload a video can still be matched if they are open to a live
          call with a travel advisor.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="availableForVideoCall"
              checked={form.availableForVideoCall === true}
              onChange={() => setForm((f) => ({ ...f, availableForVideoCall: true }))}
            />
            Yes
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name="availableForVideoCall"
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
        folder={`${guideFolder}/intro`}
        accept="video/*"
        value={form.introVideoPath}
        previewUrl={initialIntroVideoPreviewUrl}
        onChange={(path) => setForm((f) => ({ ...f, introVideoPath: path }))}
        onUploaded={(path) => persistMediaPath("introVideoPath", path)}
        hint="Optional — MP4 or MOV, max 500MB. Or paste a YouTube/Vimeo URL below."
      />

      <div>
        <Label>Introduction video URL (optional)</Label>
        <Input
          value={form.introVideoUrl}
          onChange={(e) => setForm((f) => ({ ...f, introVideoUrl: e.target.value }))}
          placeholder="https://youtube.com/..."
        />
      </div>

      <TagMultiSelect
        label="Languages spoken"
        required
        suggestions={COMMON_GUIDE_LANGUAGES}
        selected={form.languages}
        onChange={(languages) => setForm((f) => ({ ...f, languages }))}
        addPlaceholder="Add another language and press Enter"
        hint="Select common languages or add any language your guide speaks."
        getFlagCode={getLanguageFlagCode}
      />

      <TagMultiSelect
        label="Destinations covered"
        suggestions={JAPAN_PREFECTURES}
        selected={form.destinations}
        onChange={(destinations) => setForm((f) => ({ ...f, destinations }))}
        addPlaceholder="Add another destination and press Enter"
        filterPlaceholder="Filter prefectures…"
        hint="Select Japanese prefectures or add other destinations."
      />

      <div>
        <Label>Short bio *</Label>
        <Textarea
          rows={5}
          maxLength={6000}
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
        />
      </div>

      <section
        ref={certSectionRef}
        id="certification-profile-fields"
        className={`rounded-lg border p-4 space-y-4 scroll-mt-4 transition-colors ${
          certHighlight ? "border-[#D4AA25] bg-[#D4AA25]/5" : "border-border bg-muted/30"
        }`}
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">Certification profile</h2>
        </div>
        {CERTIFICATION_PROFILE_FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <Label htmlFor={`guide-${key}`}>{label} *</Label>
            <p className="text-xs text-muted-foreground mb-1">{hint}</p>
            <Textarea
              id={`guide-${key}`}
              rows={3}
              maxLength={500}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </section>

      <GuideAvailabilityCalendarModal
        value={form.unavailableDates}
        onChange={(dates) => setForm((f) => ({ ...f, unavailableDates: dates }))}
        configured={availabilityConfigured}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={saveDraft}
          className="bg-[#D4AA25] text-black cursor-pointer"
        >
          {saving ? "Saving…" : "Save draft"}
        </Button>
        <Button type="submit" disabled={saving} variant="outline" className="cursor-pointer">
          {saving ? "Saving…" : guideId ? "Update guide" : "Create guide"}
        </Button>
      </div>
    </form>
  );
}
