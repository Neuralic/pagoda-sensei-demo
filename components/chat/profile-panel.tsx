"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, MapPin, Hash, FileText } from "lucide-react";
import { MeetingButton } from "@/components/MeetingButton";
import toast from "react-hot-toast";
import { buildPublicProfilePath } from "@/lib/profile-refresh";
// Removed job-related imports and utilities - we only show profile info now

type ApplicantInfo = {
  id: string;
  name: string;
  email?: string | null; // Keep for MeetingButton but don't display
  avatarUrl?: string | null;
  coverLetter?: string | null;
  appliedAt?: string | null;
  country?: string | null;
  city?: string | null;
  bio?: string | null;
  guideNumber?: string | null;
  profileSlug?: string | null;
};

// JobInfo type removed - we no longer display job information

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

export function ProfilePanel({
  applicant,
  currentUser,
  chatId,
}: {
  applicant: ApplicantInfo | null;
  currentUser?: CurrentUser | null;
  chatId?: string | null;
}) {
  const initials = (applicant?.name || "Applicant")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Job information removed - we only show profile information now


  return (
    <div className="border border-border bg-card hidden lg:flex flex-col h-full min-h-0 p-6 overflow-y-auto w-full lg:w-1/4 xl:w-1/5 rounded-lg">
      {/* Profile Header */}
      <div className="text-center mb-6">
        <Avatar className="h-24 w-24 mx-auto mb-4 border-2 border-border">
          <AvatarImage src={applicant?.avatarUrl || undefined} alt={applicant?.name || "Applicant"} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <h3 className="text-lg font-semibold text-foreground">
          {applicant?.name || "Applicant"}
        </h3>
        {/* {applicant?.email ? (
          <p className="text-xs text-muted-foreground mt-1">{applicant.email}</p>
        ) : null} */}
      </div>

      {/* Profile Information */}
      {(applicant?.country || applicant?.city || applicant?.guideNumber) ? (
        <div className="mb-6 pb-6 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">Profile Information</h4>
          <div className="space-y-2">
            {applicant?.country ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin size={16} className="text-yellow-600" />
                <span>{applicant.country}{applicant.city ? `, ${applicant.city}` : ''}</span>
              </div>
            ) : applicant?.city ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin size={16} className="text-yellow-600" />
                <span>{applicant.city}</span>
              </div>
            ) : null}
            {applicant?.guideNumber ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Hash size={16} className="text-yellow-600" />
                <span>Guide #{applicant.guideNumber}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Bio - if available */}
      {applicant?.bio ? (
        <div className="mb-6 pb-6 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <FileText size={16} className="text-yellow-600" />
            Bio
          </h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {applicant.bio}
          </p>
        </div>
      ) : null}

      {/* Cover Letter - if available */}
      {applicant?.coverLetter ? (
        <div className="mb-6 pb-6 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground mb-2">Cover Letter</h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {applicant.coverLetter}
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-auto">
        {/* Meeting Button */}
        {applicant?.id && applicant?.name && applicant?.email && currentUser?.id && currentUser?.name && currentUser?.email ? (
          <MeetingButton
            tourGuide={{
              id: applicant.id,
              name: applicant.name,
              email: applicant.email,
            }}
            currentUser={{
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
            }}
            chatId={chatId || null}
          />
        ) : null}

        {currentUser?.role === "agent" && (
          <Button
            variant="outline"
            className="w-full text-yellow-600 border-yellow-600 bg-transparent cursor-pointer"
            onClick={() => {
              const path = buildPublicProfilePath(applicant?.profileSlug);
              if (!path) {
                toast.error("This guide has not published their public profile yet.");
                return;
              }
              window.open(path, "_blank", "noopener,noreferrer");
            }}
          >
            View Full Profile <ExternalLink size={12} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
