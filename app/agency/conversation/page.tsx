"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { ConversationsSidebar } from "@/components/chat/conversations-sidebar";
import { WhatsAppSyncBar } from "@/components/chat/whatsapp-sync-bar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ProfilePanel } from "@/components/chat/profile-panel";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveConversationBackHref } from "@/lib/navigation-memory";
function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(
    null
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(
    null
  );
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<{
    id: string;
    name: string;
    avatar: string | null;
  } | null>(null);
  const searchChatId = searchParams?.get('chatId') || null;
  const backHref = resolveConversationBackHref({
    fromParam: searchParams?.get("from"),
    itineraryIdParam: searchParams?.get("itineraryId"),
    role: "agency",
    pathname: "/agency/conversation",
  });

  // Background: fetch jobs created by the current user and their applicants.
  type Job = {
    id: string;
    name?: string;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    description?: string | null;
    languages?: string[] | null;
    group_size?: number | null;
    min_price?: number | null;
    max_price?: number | null;
    images?: string[] | null;
    signedImageUrls?: string[] | null;
  };
  type Applicant = {
    id?: string;
    applicantId?: string;
    coverLetter?: string | null;
    appliedAt?: string | null;
    user?: {
      id?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    } | null;
    profile?: {
      id?: string;
      userId?: string;
      avatarPath?: string | null;
      avatarUrl?: string | null;
    } | null;
  };

  const [jobsWithApplicants, setJobsWithApplicants] = useState<
    Array<{ job: Job; applicants: Applicant[] }>
  >([]);

  // Get current user ID and avatar
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        const json = await res.json();
  
        if (json.ok && json.user?.id) {
          setCurrentUserId(json.user.id);
     
          // Store user name and email for MeetingButton
          const firstName = json.user.first_name || json.user.firstName || '';
          const lastName = json.user.last_name || json.user.lastName || '';
          const fullName = `${firstName} ${lastName}`.trim() || 'User';
          setCurrentUserName(fullName);
          setCurrentUserEmail(json.user.email || null);

          // Fetch current user's profile for avatar using the same method as profile page
          const profileRes = await fetch("/api/profile");
          const profileJson = await profileRes.json();

          if (profileJson.ok && profileJson.profile?.profile_picture_path) {
            // Use storage sign API to get signed URL
            const signRes = await fetch("/api/storage/sign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [
                  {
                    bucket: "avatars",
                    path: profileJson.profile.profile_picture_path,
                  },
                ],
              }),
            });
            const signJson = await signRes.json();
            if (signJson?.items?.[0]) {
              const avatarUrl =
                signJson.items[0].signedUrl || signJson.items[0].publicUrl;
              setCurrentUserAvatar(avatarUrl);
            }
          }
        } else {
          console.error("Failed to get user ID:", json);
        }
      } catch (e) {
        console.error("User/Profile API error:", e);
      }
    };

    fetchUser();
  }, []);

  const applyChatMeta = useCallback(async (cid: string) => {
    const res = await fetch(`/api/chats/${encodeURIComponent(cid)}/meta`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    if (!json?.ok) return;
    const other = json.other as {
      id?: string;
      name?: string;
      avatarUrl?: string | null;
    };
    const chat = json.chat as { id?: string; jobId?: string | null };
    if (other?.id) setSelectedApplicantId(String(other.id));
    if (chat?.jobId) setSelectedJobId(String(chat.jobId));
    else setSelectedJobId(null);
    setOtherParticipant({
      id: String(other?.id || ""),
      name: other?.name || "Guide",
      avatar: other?.avatarUrl || null,
    });
    setChatId(String(chat?.id || cid));
  }, []);

  // If a chatId is provided via query (?chatId=...), preload that conversation
  useEffect(() => {
    const cid = searchChatId;
    if (!cid) return;

    let cancelled = false;
    (async () => {
      try {
        await applyChatMeta(cid);
        if (cancelled) return;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchChatId, applyChatMeta]);

  useEffect(() => {
    if (!chatId) return;
    void fetch("/api/user/whatsapp-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
      credentials: "include",
    }).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/jobs?createdBy=me");
        const json = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!json?.ok || !Array.isArray(json.jobs)) return;

        const jobs: Job[] = (json.jobs as Record<string, unknown>[]).map(
          (j) => ({
            id: String(j.id),
            name: (typeof j.name === "string" ? j.name : "") ?? "",
            start_time:
              (typeof j.start_time === "string" ? j.start_time : null) ?? null,
            end_time:
              (typeof j.end_time === "string" ? j.end_time : null) ?? null,
            location:
              (typeof j.location === "string" ? j.location : null) ?? null,
            description:
              (typeof j.description === "string" ? j.description : null) ??
              null,
            languages: Array.isArray(j.languages)
              ? j.languages.filter((l): l is string => typeof l === "string")
              : typeof j.languages === "string" && j.languages.length > 0
              ? j.languages
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              : [],
            group_size: typeof j.group_size === "number" ? j.group_size : null,
            min_price: typeof j.min_price === "number" ? j.min_price : null,
            max_price: typeof j.max_price === "number" ? j.max_price : null,
            images: Array.isArray(j.images)
              ? j.images.filter((img): img is string => typeof img === "string")
              : [],
            signedImageUrls: null,
          })
        );

        // Fetch applicants for each job in parallel
        const jobsWithApps = await Promise.all(
          jobs.map(async (job) => {
            try {
              const r = await fetch(
                `/api/jobs?jobId=${encodeURIComponent(job.id)}`
              );
              const jjson = await r.json().catch(() => ({}));
              const applicantsRaw = Array.isArray(jjson?.applicants)
                ? jjson.applicants
                : [];
              const jobRaw =
                (jjson?.job as Record<string, unknown> | null) || null;

              // Get signed URLs for all applicant avatars
              const avatarPaths = (applicantsRaw as Record<string, unknown>[])
                .map((a) => {
                  const profile = a.profile as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  return (
                    (profile?.avatarPath as string | null | undefined) ?? null
                  );
                })
                .filter((path): path is string => !!path);

              const signedAvatars: Record<string, string> = {};
              if (avatarPaths.length > 0) {
                try {
                  const signRes = await fetch("/api/storage/sign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      items: avatarPaths.map((path: string) => ({
                        bucket: "avatars",
                        path: path,
                      })),
                    }),
                  });
                  const signJson = (await signRes.json()) as {
                    items?: Array<{ signedUrl?: string; publicUrl?: string }>;
                  };
                  if (signJson?.items) {
                    signJson.items.forEach((item, idx: number) => {
                      const path = avatarPaths[idx];
                      if (path)
                        signedAvatars[path] =
                          item.signedUrl || item.publicUrl || "";
                    });
                  }
                } catch {
                  // Silently fail avatar signing
                }
              }

              const applicants: Applicant[] = (
                applicantsRaw as Record<string, unknown>[]
              ).map((a) => {
                const profile = a.profile as
                  | Record<string, unknown>
                  | null
                  | undefined;
                const user = a.user as
                  | Record<string, unknown>
                  | null
                  | undefined;
                const avatarPath =
                  (profile?.avatarPath as string | undefined) ??
                  (profile?.profile_picture_path as string | undefined);
                const avatarUrl = avatarPath
                  ? signedAvatars[avatarPath] || null
                  : null;

                return {
                  id: a.id as string | undefined,
                  applicantId:
                    (a.applicantId as string | undefined) ??
                    (a.applicant_id as string | undefined),
                  coverLetter:
                    (a.coverLetter as string | null | undefined) ??
                    (a.cover_letter as string | null | undefined) ??
                    null,
                  appliedAt:
                    (a.appliedAt as string | null | undefined) ??
                    (a.created_at as string | null | undefined) ??
                    null,
                  user: user
                    ? {
                        id: user.id as string | undefined,
                        firstName:
                          (user.firstName as string | null | undefined) ??
                          (user.first_name as string | null | undefined),
                        lastName:
                          (user.lastName as string | null | undefined) ??
                          (user.last_name as string | null | undefined),
                        email: user.email as string | null | undefined,
                      }
                    : null,
                  profile: profile
                    ? {
                        id: profile.id as string | undefined,
                        userId:
                          (profile.userId as string | undefined) ??
                          (profile.user_id as string | undefined),
                        avatarPath: avatarPath,
                        avatarUrl: avatarUrl,
                      }
                    : null,
                };
              });

              // Prefer enriched job fields from jobRaw if present
              const enrichedJob: Job = {
                ...job,
                name:
                  (typeof jobRaw?.name === "string"
                    ? jobRaw.name
                    : undefined) ?? job.name,
                start_time:
                  (typeof jobRaw?.start_time === "string"
                    ? jobRaw.start_time
                    : undefined) ?? job.start_time,
                end_time:
                  (typeof jobRaw?.end_time === "string"
                    ? jobRaw.end_time
                    : null) ??
                  job.end_time ??
                  null,
                location:
                  (typeof jobRaw?.location === "string"
                    ? jobRaw.location
                    : null) ??
                  job.location ??
                  null,
                description:
                  (typeof jobRaw?.description === "string"
                    ? jobRaw.description
                    : null) ??
                  job.description ??
                  null,
                languages: Array.isArray(jobRaw?.languages)
                  ? (jobRaw.languages as unknown[]).filter(
                      (l): l is string => typeof l === "string"
                    )
                  : job.languages ?? [],
                group_size:
                  typeof jobRaw?.group_size === "number"
                    ? jobRaw.group_size
                    : job.group_size ?? null,
                min_price:
                  typeof jobRaw?.min_price === "number"
                    ? jobRaw.min_price
                    : job.min_price ?? null,
                max_price:
                  typeof jobRaw?.max_price === "number"
                    ? jobRaw.max_price
                    : job.max_price ?? null,
                images: Array.isArray(jobRaw?.images)
                  ? (jobRaw.images as unknown[]).filter(
                      (img): img is string => typeof img === "string"
                    )
                  : job.images ?? [],
                signedImageUrls: job.signedImageUrls ?? null,
              };

              // Sign job images (first panel thumbnail uses index 0)
              try {
                const imgs = Array.isArray(enrichedJob.images)
                  ? enrichedJob.images
                  : [];
                const paths = imgs.filter(
                  (p): p is string =>
                    typeof p === "string" &&
                    p.length > 0 &&
                    !(p.startsWith("http://") || p.startsWith("https://"))
                );
                if (paths.length > 0) {
                  const signRes = await fetch("/api/storage/sign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      items: paths.map((path) => ({ bucket: "jobs", path })),
                    }),
                  });
                  const signJson = (await signRes.json().catch(() => ({}))) as {
                    items?: Array<{
                      path?: string;
                      signedUrl?: string;
                      publicUrl?: string;
                    }>;
                  };
                  if (Array.isArray(signJson?.items)) {
                    const pathToUrl: Record<string, string> = {};
                    signJson.items.forEach((it) => {
                      const url = it?.signedUrl || it?.publicUrl;
                      if (it?.path && typeof url === "string")
                        pathToUrl[it.path] = url;
                    });
                    enrichedJob.signedImageUrls = imgs.map((img) => {
                      if (
                        typeof img === "string" &&
                        !(
                          img.startsWith("http://") ||
                          img.startsWith("https://")
                        )
                      ) {
                        return pathToUrl[img] || img;
                      }
                      return img;
                    });
                  }
                }
              } catch {
                // Silently fail image signing
              }

              return { job: enrichedJob, applicants };
            } catch {
              return { job, applicants: [] };
            }
          })
        );

        if (mounted) setJobsWithApplicants(jobsWithApps);
      } catch {
        // swallow errors for background fetch
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // When jobs load after a guide is selected, attach job context for the profile panel (optional).
  useEffect(() => {
    if (!selectedApplicantId || jobsWithApplicants.length === 0) return;

    for (const jobGroup of jobsWithApplicants) {
      const found = jobGroup.applicants.find(
        (a) =>
          (a.user?.id && String(a.user.id) === String(selectedApplicantId)) ||
          String(a.applicantId || "") === String(selectedApplicantId) ||
          String(a.id || "") === String(selectedApplicantId)
      );
      if (found) {
        setSelectedJobId(jobGroup.job.id);
        const name =
          `${found.user?.firstName || ""} ${found.user?.lastName || ""}`.trim() ||
          "Applicant";
        setOtherParticipant({
          id: String(selectedApplicantId),
          name,
          avatar: found.profile?.avatarUrl || null,
        });
        break;
      }
    }
  }, [selectedApplicantId, jobsWithApplicants]);

  const handleSelectConversation = useCallback(
    (selectedChatId: string) => {
      if (chatId === selectedChatId) return;
      void (async () => {
        try {
          await applyChatMeta(selectedChatId);
        } catch (e) {
          console.error("Failed to load conversation:", e);
        }
      })();
    },
    [chatId, applyChatMeta]
  );

  return (
    <div className="flex h-screen bg-background mt-14 mb-10 px-10">
      {/* Back button */}
      <div className="absolute top-20 left-4 z-50">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
        >
          ← Back
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 w-full gap-3">
        <WhatsAppSyncBar />
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 w-full">
        {/* Conversations Sidebar */}
        <ConversationsSidebar
          selectedId={chatId || selectedApplicantId || ""}
          onSelect={handleSelectConversation}
          selectedChatId={chatId || undefined}
          userRole="agent"
          currentUserId={currentUserId}
        />

        {/* Chat Panel */}
        <ChatPanel
          chatId={chatId}
          currentUserId={currentUserId}
          currentUserAvatar={currentUserAvatar}
          otherParticipant={otherParticipant}
        />

        {/* Profile Panel: show only when a conversation is selected */}
        {chatId && otherParticipant ? (
          <ProfilePanel
            applicant={(function () {
              for (const jobGroup of jobsWithApplicants) {
                const a = jobGroup.applicants.find(
                  (x) =>
                    (x.user?.id &&
                      String(x.user.id) === String(selectedApplicantId)) ||
                    String(x.applicantId || "") === String(selectedApplicantId) ||
                    String(x.id || "") === String(selectedApplicantId)
                );
                if (a) {
                  const name =
                    `${a.user?.firstName || ""} ${
                      a.user?.lastName || ""
                    }`.trim() || "Applicant";
                  return {
                    id: a.applicantId || a.id || "",
                    name,
                    email: a.user?.email ?? null,
                    avatarUrl: a.profile?.avatarUrl ?? null,
                    coverLetter: a.coverLetter ?? null,
                    appliedAt: a.appliedAt ?? null,
                  };
                }
              }
              return {
                id: otherParticipant.id,
                name: otherParticipant.name,
                email: null,
                avatarUrl: otherParticipant.avatar,
                coverLetter: null,
                appliedAt: null,
              };
            })()}
            currentUser={
              currentUserId && currentUserName && currentUserEmail
                ? {
                    id: currentUserId,
                    name: currentUserName,
                    email: currentUserEmail,
                  }
                : null
            }
              chatId={chatId}
          />
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Loading conversation…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
