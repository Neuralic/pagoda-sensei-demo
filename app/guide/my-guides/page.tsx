"use client";

import { CertificationBadge } from "@/components/guide/certification-badge";
import { ExperienceTierBadge } from "@/components/guide/experience-tier-badge";
import { GuideStatusActions } from "@/components/operator/guide-status-actions";
import { ProfileCompletenessCard } from "@/components/profile/profile-completeness-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import type { ProfileCompleteness } from "@/lib/profile-completeness";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Mail,
  Pencil,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { OperatorOnlyGuard } from "@/components/guide/operator-only-guard";

type GuideRow = {
  id: string;
  name: string;
  email: string;
  guideProfileStatus: string;
  certificationStatus: string;
  certificationLabel: string;
  experienceTier?: number | null;
  experienceTierLabel: string;
  experienceTierShortLabel: string;
  bookingCount: number;
  ratingAverage: number | null;
  reviewCount?: number;
  publicProfileUrl: string | null;
  isActive: boolean;
  profileCompleteness?: ProfileCompleteness;
};

type FilterTab = "active" | "archived" | "deactivated" | "all";

function showInviteSentCornerAlert(message: string) {
  toast.custom(
    (t) => (
      <div
        role="alert"
        className={`pointer-events-auto flex w-full max-w-sm gap-3 rounded-lg border border-green-200 bg-background p-4 shadow-lg dark:border-green-800 ${t.visible ? "opacity-100" : "opacity-0"
          } transition-opacity`}
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Invite sent</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(t.id)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ),
    { duration: 8000 }
  );
}

export default function MyGuidesPage() {
  const [guides, setGuides] = useState<GuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [inviteGuideId, setInviteGuideId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/operator/my-guides");
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error || "Failed to load guides";
      toast.error(msg);
      if (res.status === 403 && String(msg).toLowerCase().includes("operator")) {
        setAccessError(msg);
      }
      setGuides([]);
    } else {
      setAccessError(null);
      setGuides(data.guides || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return guides.filter((g) => {
      if (filter === "active") {
        return (
          g.guideProfileStatus !== "archived" &&
          g.guideProfileStatus !== "deactivated" &&
          g.isActive !== false
        );
      }
      if (filter === "archived") return g.guideProfileStatus === "archived";
      if (filter === "deactivated") {
        return g.guideProfileStatus === "deactivated" || g.isActive === false;
      }
      return true;
    });
  }, [guides, filter]);

  const copyLink = async (url: string | null) => {
    if (!url) {
      toast.error("Publish the profile to get a shareable link");
      return;
    }
    const ok = await copyTextToClipboard(url);
    if (ok) toast.success("Link copied");
    else toast.error("Could not copy — select the link and copy manually");
  };

  const publish = async (id: string) => {
    const res = await fetch(`/api/operator/my-guides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guideProfileStatus: "published" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Cannot publish");
      return;
    }
    toast.success("Profile published");
    load();
  };

  const sendInvite = async () => {
    if (!inviteGuideId || sendingInvite) return;
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/operator/my-guides/${inviteGuideId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invite failed");
        return;
      }

      const submittedEmail = inviteEmail.trim();
      setInviteGuideId(null);
      setInviteEmail("");

      let message: string;
      if (data.emailSent) {
        message = "Registration invite sent by email.";
      } else if (data.emailFallback) {
        message =
          "Invite created. Configure SMTP to send emails automatically, or share the link with your guide.";
      } else if (submittedEmail) {
        message = "Invite link created. Email could not be sent — share the link with your guide.";
      } else {
        message = "Registration invite link created. Share it with your guide.";
      }

      if (data.inviteUrl) {
        const copied = await copyTextToClipboard(data.inviteUrl);
        if (copied) message += " The link was copied to your clipboard.";
      }

      showInviteSentCornerAlert(message);
    } finally {
      setSendingInvite(false);
    }
  };

  const filterButtons: { key: FilterTab; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
    { key: "deactivated", label: "Deactivated" },
    { key: "all", label: "All" },
  ];

  return (
    <OperatorOnlyGuard>
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Guides</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Team guides you manage. Your own public profile is in{" "}
            <Link href="/settings" className="text-[#D4AA25] hover:underline font-medium">
              Settings
            </Link>
            . View tier, certification, bookings, and ratings below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/settings">Your profile</Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/guide/my-guides/invite">
              <Mail className="h-4 w-4" />
              Invite guide
            </Link>
          </Button>
          <Button asChild className="bg-[#D4AA25] text-black gap-2">
            <Link href="/guide/my-guides/new">
              <Plus className="h-4 w-4" />
              Add guide
            </Link>
          </Button>
        </div>
      </div>

      {accessError && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          <p className="font-medium">Tour operator account required</p>
          <p className="mt-1">{accessError}</p>
          <Link href="/auth/signup/operator" className="mt-2 inline-block font-semibold text-[#D4AA25] hover:underline">
            Register as a tour operator
          </Link>
        </div>
      )}

      {!accessError && (
        <div className="flex flex-wrap gap-2 mb-6">
          {filterButtons.map(({ key, label }) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              className={filter === key ? "bg-[#D4AA25] text-black" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {loading && <p className="text-muted-foreground">Loading…</p>}

      {!loading && !accessError && filtered.length === 0 && (
        <p className="text-muted-foreground">
          No guides in this view.{" "}
          <Link href="/guide/my-guides/new" className="text-[#D4AA25] hover:underline">
            Add a guide
          </Link>{" "}
          or{" "}
          <Link href="/guide/my-guides/invite" className="text-[#D4AA25] hover:underline">
            send an invite
          </Link>
          .
        </p>
      )}

      <ul className="space-y-4">
        {filtered.map((g) => (
          <li key={g.id} className="border rounded-lg p-4 flex flex-wrap gap-4 justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <h2 className="font-semibold text-lg">{g.name}</h2>
              {g.profileCompleteness && (
                <ProfileCompletenessCard
                  completeness={g.profileCompleteness}
                  guideProfileStatus={g.guideProfileStatus}
                  editHref={`/guide/my-guides/${g.id}`}
                  compact
                />
              )}
              {g.email && !g.email.includes("@managed.pagoda.local") && (
                <p className="text-sm text-muted-foreground">{g.email}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                <span className="text-xs px-2 py-0.5 rounded border capitalize">
                  {g.guideProfileStatus}
                </span>
                <CertificationBadge
                  status={g.certificationStatus}
                  bookingCount={g.bookingCount}
                  reviewCount={g.reviewCount}
                />
                <ExperienceTierBadge tier={g.experienceTier} />
                {!g.experienceTier && (
                  <span className="text-xs text-muted-foreground">Tier not set</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {g.bookingCount} bookings
                {g.ratingAverage != null && ` · ★ ${g.ratingAverage} avg`}
                {g.reviewCount != null && g.reviewCount > 0 && ` · ${g.reviewCount} reviews`}
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end min-w-[200px]">
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/guide/my-guides/${g.id}`}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Link>
                </Button>
                {g.publicProfileUrl && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={g.publicProfileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyLink(g.publicProfileUrl)}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy link
                    </Button>
                  </>
                )}
                {g.guideProfileStatus !== "published" && (
                  <Button size="sm" onClick={() => publish(g.id)}>
                    Publish
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInviteGuideId(g.id);
                    setInviteEmail(g.email?.includes("@managed.pagoda.local") ? "" : g.email || "");
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Send invite
                </Button>
              </div>
              <GuideStatusActions
                guideId={g.id}
                guideProfileStatus={g.guideProfileStatus}
                isActive={g.isActive}
                onUpdated={load}
              />
            </div>
          </li>
        ))}
      </ul>

      {inviteGuideId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-lg border shadow-lg max-w-md w-full p-6">
            <h3 className="font-semibold text-lg mb-2">Send registration link</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The guide can set their password and upload their profile photo and intro video.
            </p>
            <div className="space-y-3">
              <div>
                <Label>Guide email</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Send invite by email (optional)"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setInviteGuideId(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-[#D4AA25] text-black"
                  onClick={sendInvite}
                  disabled={sendingInvite}
                >
                  {sendingInvite ? "Sending…" : "Send link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
    </OperatorOnlyGuard>
  );
}
