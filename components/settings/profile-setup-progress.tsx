"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import type { ProfileCompleteness } from "@/lib/profile-completeness";
import { ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";

export default function ProfileSetupProgress() {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [profileStatus, setProfileStatus] = useState("draft");
  const [isGuide, setIsGuide] = useState(false);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.user?.role === "guide") setIsGuide(true);
      if (data.profileCompleteness) setCompleteness(data.profileCompleteness);
      setProfileStatus(String(data.profile?.guide_profile_status || "draft"));
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  async function onPublish() {
    setPublishing(true);
    const res = await fetch("/api/profile/publish", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPublishing(false);
    if (!res.ok) {
      toast.error((data as { error?: string })?.error || "Cannot publish");
      return;
    }
    setProfileStatus("published");
    toast.success("Profile published");
    await fetchProfile();
  }

  if (loading || !completeness || isGuide) return null;

  return (
    <Card className="p-4 lg:p-6 border border-border">
      <h2 className="text-lg lg:text-xl font-bold text-foreground mb-2">Profile setup progress</h2>
      <p className="text-sm lg:text-base text-muted-foreground mb-4 lg:mb-6">
        Complete each item below, then publish when you are ready to be visible on the marketplace.
      </p>

      <ProfileCompletenessCard
        completeness={completeness}
        guideProfileStatus={profileStatus}
        showPublishItem
      />

      {profileStatus !== "published" && (
        <Button
          onClick={onPublish}
          disabled={publishing || completeness.percent < 100}
          className="mt-4 lg:mt-6 text-sm lg:text-base bg-[#D4AA25] text-black"
        >
          {publishing ? "Publishing…" : "Publish profile"}
        </Button>
      )}
    </Card>
  );
}
