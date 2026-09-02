"use client";

import { StorageUploadField } from "@/components/operator/storage-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUCKETS } from "@/lib/buckets";
import { VIDEO_CALL_AVAILABILITY_QUESTION } from "@/lib/guide-marketplace-validation";
import { EXPERIENCE_TIER_LABELS } from "@/lib/guide-profile-slug";
import {
  clearGuideInviteDraft,
  loadGuideInviteDraft,
  saveGuideInviteDraft,
} from "@/lib/guide-invite-form-draft";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type InviteProfile = {
  bio?: string | null;
  languages?: string[] | null;
  destinations?: string[] | null;
  years_experience?: number | null;
  tours_completed_estimate?: number | null;
  experience_tier_declared?: number | null;
  crisis_handling_example?: string | null;
  local_expertise_highlight?: string | null;
  pre_tour_preparation?: string | null;
  client_fit_description?: string | null;
  intro_video_url?: string | null;
  profile_picture_path?: string | null;
  intro_video_path?: string | null;
  available_for_video_call?: boolean | null;
  country?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  introVideoSignedUrl?: string | null;
};

function GuideInviteContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [guideName, setGuideName] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [guideUserId, setGuideUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [profilePicturePath, setProfilePicturePath] = useState("");
  const [introVideoPath, setIntroVideoPath] = useState("");
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState<string | null>(null);
  const [introVideoPreviewUrl, setIntroVideoPreviewUrl] = useState<string | null>(null);
  const [availableForVideoCall, setAvailableForVideoCall] = useState<boolean | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<InviteProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/auth/guide-invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setValid(true);
          setGuideName(d.guideName);
          setGuideUserId(d.guideUserId);
          setFullName(d.guideName || "");
          setEmail(d.suggestedEmail || "");
          if (d.profile) {
            const p = d.profile as InviteProfile;
            setOperatorProfile(p);
            setBio(p.bio || "");
            setIntroVideoUrl(p.intro_video_url || "");
            setProfilePicturePath(p.profile_picture_path || "");
            setIntroVideoPath(p.intro_video_path || "");
            setProfilePicturePreviewUrl(p.avatarUrl || null);
            setIntroVideoPreviewUrl(p.introVideoSignedUrl || null);
            if (p.available_for_video_call === true || p.available_for_video_call === false) {
              setAvailableForVideoCall(p.available_for_video_call);
            }
          }
          const draft = loadGuideInviteDraft(token);
          if (draft) {
            if (draft.email) setEmail(draft.email);
            if (draft.fullName) setFullName(draft.fullName);
            if (draft.bio) setBio(draft.bio);
            if (draft.introVideoUrl) setIntroVideoUrl(draft.introVideoUrl);
            if (draft.profilePicturePath) setProfilePicturePath(draft.profilePicturePath);
            if (draft.introVideoPath) setIntroVideoPath(draft.introVideoPath);
            if (draft.availableForVideoCall === true || draft.availableForVideoCall === false) {
              setAvailableForVideoCall(draft.availableForVideoCall);
            }
          }
        } else setValid(false);
      });
  }, [token]);

  useEffect(() => {
    if (!valid || !token) return;
    const timer = setTimeout(() => {
      saveGuideInviteDraft(token, {
        version: 1,
        email,
        fullName,
        bio,
        introVideoUrl,
        profilePicturePath,
        introVideoPath,
        availableForVideoCall,
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    valid,
    token,
    email,
    fullName,
    bio,
    introVideoUrl,
    profilePicturePath,
    introVideoPath,
    availableForVideoCall,
  ]);

  const operatorPrefillSummary = useMemo(() => {
    if (!operatorProfile) return [];
    const lines: string[] = [];
    if (operatorProfile.country || operatorProfile.city) {
      lines.push([operatorProfile.city, operatorProfile.country].filter(Boolean).join(", "));
    }
    if (operatorProfile.years_experience != null) {
      lines.push(`${operatorProfile.years_experience} years of experience`);
    }
    if (operatorProfile.tours_completed_estimate != null) {
      lines.push(`~${operatorProfile.tours_completed_estimate} tours completed`);
    }
    if (operatorProfile.experience_tier_declared != null) {
      const tier = EXPERIENCE_TIER_LABELS[operatorProfile.experience_tier_declared];
      if (tier) lines.push(tier);
    }
    if (operatorProfile.languages?.length) {
      lines.push(`Languages: ${operatorProfile.languages.join(", ")}`);
    }
    if (operatorProfile.destinations?.length) {
      lines.push(`Destinations: ${operatorProfile.destinations.join(", ")}`);
    }
    if (operatorProfile.crisis_handling_example) lines.push("Certification profile completed");
    return lines;
  }, [operatorProfile]);

  const submit = async () => {
    if (!email || password.length < 8) {
      toast.error("Email and password (8+ chars) required");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Your name is required");
      return;
    }
    if (!profilePicturePath) {
      toast.error("Please upload a profile photo");
      return;
    }
    if (availableForVideoCall == null) {
      toast.error("Please answer whether you are available for a video call with the travel advisor");
      return;
    }

    setSubmitting(true);
    const payload: Record<string, unknown> = {
      token,
      email,
      password,
      fullName: fullName.trim(),
      profilePicturePath,
      availableForVideoCall,
    };
    if (bio.trim()) payload.bio = bio.trim();
    if (introVideoPath) payload.introVideoPath = introVideoPath;
    if (introVideoUrl.trim()) payload.introVideoUrl = introVideoUrl.trim();

    const res = await fetch("/api/auth/guide-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(data.error || "Failed");
      return;
    }
    clearGuideInviteDraft(token);
    toast.success("Account created. Your operator’s profile details have been kept.");
    window.location.href = "/guide/login?redirect=" + encodeURIComponent("/settings");
  };

  if (valid === null) return <p className="p-10 text-center">Checking invite…</p>;
  if (!valid) {
    return (
      <main className="max-w-md mx-auto p-10 text-center">
        <p className="text-muted-foreground">
          This invite link is invalid or has expired. Ask your tour operator to send a new link
          from their My Guides dashboard.
        </p>
      </main>
    );
  }

  const mediaFolder = guideUserId ? `invites/${guideUserId}` : "invites";

  return (
    <main className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Complete your guide profile</h1>
      <p className="text-muted-foreground mb-6">
        {guideName ? (
          <>
            Welcome, <strong>{guideName}</strong>. Your tour operator has already added much of your
            marketplace profile. Confirm your login details and add your photo below.
          </>
        ) : (
          "Set your login and upload your profile materials below."
        )}
      </p>

      <div className="space-y-5">
        <div>
          <Label>Your full name *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Your email *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Password *</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
        </div>
        <div>
          <Label>Short bio</Label>
          <Textarea
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={operatorProfile?.bio ? "Edit your bio or leave as entered by your operator" : "A short introduction for agents and travelers"}
          />
        </div>

        <StorageUploadField
          label="Profile photo"
          bucket={BUCKETS.avatars}
          folder={`${mediaFolder}/avatar`}
          accept="image/*"
          value={profilePicturePath}
          previewUrl={profilePicturePreviewUrl}
          onChange={setProfilePicturePath}
          onPreviewUrl={setProfilePicturePreviewUrl}
          inviteToken={token}
          required
        />

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <Label>{VIDEO_CALL_AVAILABILITY_QUESTION} *</Label>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="inviteAvailableForVideoCall"
                checked={availableForVideoCall === true}
                onChange={() => setAvailableForVideoCall(true)}
              />
              Yes
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="inviteAvailableForVideoCall"
                checked={availableForVideoCall === false}
                onChange={() => setAvailableForVideoCall(false)}
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
          value={introVideoPath}
          previewUrl={introVideoPreviewUrl}
          onChange={setIntroVideoPath}
          onPreviewUrl={setIntroVideoPreviewUrl}
          inviteToken={token}
          hint="Optional — upload a short intro video, or use a YouTube/Vimeo link below."
        />

        <div>
          <Label>Video URL (optional)</Label>
          <Input value={introVideoUrl} onChange={(e) => setIntroVideoUrl(e.target.value)} />
        </div>

        <Button onClick={submit} disabled={submitting} className="w-full bg-[#D4AA25] text-black">
          {submitting ? "Saving…" : "Create account & save"}
        </Button>
      </div>
    </main>
  );
}

export default function GuideInvitePage() {
  return (
    <Suspense fallback={<p className="p-10 text-center">Loading…</p>}>
      <GuideInviteContent />
    </Suspense>
  );
}
