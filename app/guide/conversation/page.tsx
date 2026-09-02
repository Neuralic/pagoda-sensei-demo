"use client";

import { useState, useEffect, Suspense } from "react";
import { ConversationsSidebar } from "@/components/chat/conversations-sidebar";
import { WhatsAppSyncBar } from "@/components/chat/whatsapp-sync-bar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ProfilePanel } from "@/components/chat/profile-panel";
import { BackButton } from "@/components/shared/back-button";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import {
  CONVERSATION_MAIN_ROW_CLASS,
  CONVERSATION_PAGE_CLASS,
  CONVERSATION_TOOLBAR_CLASS,
} from "@/lib/conversation-layout";
import { resolveConversationBackHref } from "@/lib/navigation-memory";
function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(
    null
  );
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatClientName, setChatClientName] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<{
    id: string;
    name: string;
    avatar: string | null;
  } | null>(null);
  const searchChatId = searchParams?.get('chatId') || null;
  const backHref = resolveConversationBackHref({
    fromParam: searchParams?.get("from"),
    itineraryIdParam: searchParams?.get("itineraryId"),
    role: "guide",
    pathname: "/guide/conversation",
  });
  const searchJobId = searchParams?.get('jobId') || null;

  const [clientChatDialogOpen, setClientChatDialogOpen] = useState(false);
  const [clientNameInput, setClientNameInput] = useState("");
  const [creatingClientChat, setCreatingClientChat] = useState(false);
  const [chatListRefreshTrigger, setChatListRefreshTrigger] = useState(0);

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
    agent?: {
      id?: string;
      name?: string;
      user?: {
        id?: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
      } | null;
      profile?: { avatarUrl?: string | null } | null;
    } | null;
  };

  const [jobsWithAgencies, setJobsWithAgencies] = useState<Job[]>([]);
  const [fetchedJobData, setFetchedJobData] = useState<Job | null>(null);
  const [fetchedAgentData, setFetchedAgentData] = useState<{
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    country?: string | null;
    city?: string | null;
    phone?: string | null;
    guideNumber?: string | null;
  } | null>(null);

  // Get current user ID and avatar
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        const json = await res.json();

        if (json.ok && json.user?.id) {
          setCurrentUserId(json.user.id);

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
              console.log("Current user avatar set to:", avatarUrl);
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

  useEffect(() => {
    if (!chatId) return;
    void fetch("/api/user/whatsapp-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
      credentials: "include",
    }).catch(() => {});
  }, [chatId]);

  // From job card/modal: ?jobId=… opens (or creates) the guide↔agent chat for that job’s poster
  useEffect(() => {
    if (!searchJobId || !currentUserId) return;
    if (searchChatId) return;

    let cancelled = false;
    (async () => {
      try {
        const jobRes = await fetch(
          `/api/jobs?jobId=${encodeURIComponent(searchJobId)}`,
          { cache: 'no-store' }
        );
        const jobJson = await jobRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!jobRes.ok || !jobJson?.ok || !jobJson?.job) {
          toast.error(
            typeof jobJson?.error === 'string'
              ? jobJson.error
              : 'Could not load this job to start the conversation.'
          );
          return;
        }
        const job = jobJson.job as { created_by?: string | null };
        const agencyId =
          typeof job.created_by === 'string' ? job.created_by : null;
        if (!agencyId) {
          toast.error('Could not find the agent who posted this job.');
          return;
        }
        if (agencyId === currentUserId) {
          toast.error('You cannot open a client thread with yourself.');
          return;
        }

        const pairRes = await fetch('/api/chats/ensure-pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agencyId, guideId: currentUserId }),
        });
        const pairJson = await pairRes.json().catch(() => ({}));
        if (cancelled) return;
        if (!pairRes.ok || !pairJson?.ok || !pairJson?.chatId) {
          toast.error(
            typeof pairJson?.error === 'string'
              ? pairJson.error
              : 'Could not open the conversation.'
          );
          return;
        }

        const chatIdStr = String(pairJson.chatId);

        const metaRes = await fetch(
          `/api/chats/${encodeURIComponent(chatIdStr)}/meta`,
          { cache: 'no-store' }
        );
        const metaJson = await metaRes.json().catch(() => ({}));
        if (cancelled) return;
        if (metaRes.ok && metaJson?.ok) {
          const other = metaJson.other as {
            id?: string;
            name?: string;
            avatarUrl?: string | null;
          };
          const chat = metaJson.chat as {
            id?: string;
            jobId?: string | null;
            clientName?: string | null;
          };
          if (chat?.id) setChatId(String(chat.id));
          setChatClientName(chat?.clientName ?? null);
          if (other?.id) {
            setOtherParticipant({
              id: String(other.id),
              name: other.name || 'Agency',
              avatar: other.avatarUrl || null,
            });
            setSelectedAgencyId(String(other.id));
          }
          if (chat?.jobId) {
            setSelectedJobId(String(chat.jobId));
          } else {
            setSelectedJobId(searchJobId);
          }
        } else {
          setSelectedJobId(searchJobId);
          setChatId(chatIdStr);
        }

        router.replace(
          `/guide/conversation?chatId=${encodeURIComponent(chatIdStr)}&jobId=${encodeURIComponent(searchJobId)}`
        );
      } catch (e) {
        console.error('Job deep-link → conversation failed:', e);
        if (!cancelled) toast.error('Could not open the conversation.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchJobId, searchChatId, currentUserId, router]);

  // If a chatId is provided via query (?chatId=...), preload that conversation
  useEffect(() => {
    const cid = searchChatId;
    if (!cid) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(cid)}/meta`);
        if (!res.ok) {
          console.error('Failed to fetch chat meta:', res.status);
          return;
        }
        const json = await res.json().catch((err) => {
          console.error('Failed to parse chat meta response:', err);
          return {};
        });
        if (cancelled || !json?.ok) return;

        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null };
        const chat = json.chat as { id?: string; jobId?: string | null; applicationId?: string | null; clientName?: string | null };

        // Set chatId and clientName
        if (chat?.id) {
          setChatId(String(chat.id));
        }
        setChatClientName(chat?.clientName ?? null);
        // Set other participant info (agent)
        if (other?.id) {
          setOtherParticipant({
            id: String(other.id),
            name: other.name || 'Agency',
            avatar: other.avatarUrl || null
          });
          // other.id is the agency_id
          setSelectedAgencyId(String(other.id));
        }

        // Job context: DB row may have null job_id (pair-based chats); keep deep-link job from URL
        if (chat?.jobId) {
          setSelectedJobId(String(chat.jobId));
        } else if (searchJobId) {
          setSelectedJobId(searchJobId);
        }
      } catch (err) {
        console.error('Error loading chat from query param:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [searchChatId, searchJobId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/jobs?appliedBy=me", { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!json?.ok || !Array.isArray(json.jobs)) return;

        // Get signed URLs for all agent avatars that need signing
        // API may return avatarUrl directly, but we'll sign paths for better security
        const avatarPaths = (json.jobs as Record<string, unknown>[])
          .map((j) => {
            const agent = j.agent as
              | Record<string, unknown>
              | null
              | undefined;
            const profile = agent?.profile as
              | Record<string, unknown>
              | null
              | undefined;
            // Prefer avatarPath, fallback to profile_picture_path
            return (
              (profile?.avatarPath as string | undefined) ??
              (profile?.profile_picture_path as string | undefined)
            );
          })
          .filter((path): path is string => !!path && !path.startsWith('http'));

        const signedAvatars: Record<string, string> = {};
        if (avatarPaths.length > 0) {
          try {
            const signRes = await fetch("/api/storage/sign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: avatarPaths.map((path) => ({
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
                  signedAvatars[path] = item.signedUrl || item.publicUrl || "";
              });
            }
          } catch {
            // Silently fail avatar signing
          }
        }

        // Sign agent avatars already handled above; now build job list and sign job images
        let jobs: Job[] = (json.jobs as Record<string, unknown>[]).map((j) => {
          const agent = j.agent as Record<string, unknown> | null | undefined;
          const profile = agent?.profile as
            | Record<string, unknown>
            | null
            | undefined;
          const user = agent?.user as
            | Record<string, unknown>
            | null
            | undefined;
          // Use avatarUrl from API if available, otherwise sign the path
          const avatarPath =
            (profile?.avatarPath as string | undefined) ??
            (profile?.profile_picture_path as string | undefined);
          const apiAvatarUrl = profile?.avatarUrl as string | null | undefined;
          const avatarUrl = apiAvatarUrl
            ? apiAvatarUrl
            : (avatarPath ? signedAvatars[avatarPath] || null : null);

          return {
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
            languages: (() => {
              // Parse languages - could be JSON string, array, or comma-separated string
              if (!j.languages) return [];
              if (Array.isArray(j.languages)) {
                return (j.languages as unknown[]).filter(
                  (l): l is string => typeof l === "string"
                );
              }
              if (typeof j.languages === "string" && j.languages.length > 0) {
                // Try to parse as JSON first
                try {
                  const parsed = JSON.parse(j.languages);
                  if (Array.isArray(parsed)) {
                    return parsed.filter((l): l is string => typeof l === "string");
                  }
                } catch {
                  // If not JSON, treat as comma-separated string
                }
                // Fallback to comma-separated string
                return j.languages
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
              }
              return [];
            })(),
            group_size: typeof j.group_size === "number" ? j.group_size : null,
            min_price: typeof j.min_price === "number" ? j.min_price : null,
            max_price: typeof j.max_price === "number" ? j.max_price : null,
            images: Array.isArray(j.images)
              ? (j.images as unknown[]).filter(
                (img): img is string => typeof img === "string"
              )
              : [],
            signedImageUrls: null,
            agent: agent
              ? {
                id: agent.id as string | undefined,
                name: agent.name as string | undefined,
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
                    avatarUrl: avatarUrl,
                  }
                  : null,
              }
              : null,
          };
        });

        // Sign job images in batch by collecting all paths
        try {
          const allPaths: string[] = [];
          jobs.forEach((job) => {
            (job.images || []).forEach((img) => {
              if (
                typeof img === "string" &&
                img.length > 0 &&
                !(img.startsWith("http://") || img.startsWith("https://"))
              ) {
                allPaths.push(img);
              }
            });
          });

          if (allPaths.length > 0) {
            // Deduplicate paths
            const unique = Array.from(new Set(allPaths));
            const signRes = await fetch("/api/storage/sign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: unique.map((path) => ({ bucket: "jobs", path })),
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
              jobs = jobs.map((job) => ({
                ...job,
                signedImageUrls: (job.images || []).map((img) => {
                  if (
                    typeof img === "string" &&
                    !(img.startsWith("http://") || img.startsWith("https://"))
                  ) {
                    return pathToUrl[img] || img;
                  }
                  return img;
                }),
              }));
            }
          }
        } catch {
          // Silently fail image signing
        }

        if (mounted) {
          // Deduplicate jobs by ID before setting state
          const seenJobIds = new Set<string>();
          const uniqueJobs = jobs.filter((job) => {
            const jobId = String(job.id);
            if (seenJobIds.has(jobId)) {
              return false; // Skip duplicate
            }
            seenJobIds.add(jobId);
            return true;
          });
          setJobsWithAgencies(uniqueJobs);
        }
      } catch {
        // swallow errors for background fetch
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // When chatId is set (from query param only), ensure otherParticipant is set
  // handleSelectConversation already fetches this, so we only need this for query param
  useEffect(() => {
    if (!chatId || otherParticipant || !searchChatId) return;

    // Only fetch if chatId came from query param and otherParticipant is not set
    if (chatId === searchChatId && !otherParticipant) {
      // Fetch chat metadata to get participant info
      (async () => {
        try {
          const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/meta`, {
            cache: 'no-store'
          });
          if (!res.ok) return;

          const json = await res.json().catch(() => ({}));
          if (!json?.ok) return;

          const other = json.other as { id?: string; name?: string; avatarUrl?: string | null };
          const chat = json.chat as { id?: string; jobId?: string | null; applicationId?: string | null; clientName?: string | null };

          if (other?.id) {
            setOtherParticipant({
              id: String(other.id),
              name: other.name || 'Agency',
              avatar: other.avatarUrl || null,
            });
            setSelectedAgencyId(String(other.id));
          }
          setChatClientName(chat?.clientName ?? null);

          if (chat?.jobId) {
            setSelectedJobId(String(chat.jobId));
          }
        } catch (err) {
          console.error('Error loading chat meta:', err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, searchChatId]);

  const handleSelectConversation = (selectedChatId: string) => {
    // ID is now the chatId directly from the chats table (same as agent view)
    // If already selected, don't refetch
    if (chatId === selectedChatId) return;

    setChatId(selectedChatId);

    // Fetch chat metadata to get jobId and agencyId
    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(selectedChatId)}/meta`, {
          cache: 'no-store'
        });
        if (!res.ok) {
          console.error('Failed to fetch chat meta:', res.status);
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!json?.ok) return;

        const chat = json.chat as { id?: string; jobId?: string | null; applicationId?: string | null; clientName?: string | null };
        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null; email?: string | null };
        setChatClientName(chat?.clientName ?? null);
        const isTourBased = !chat.applicationId;

        // Set jobId and agencyId from chat metadata
        if (chat?.jobId) {
          setSelectedJobId(String(chat.jobId));
          
          // Check if job exists in jobsWithAgencies
          const jobExists = jobsWithAgencies.some(j => j.id === chat.jobId);
          if (!jobExists || isTourBased) {
            // Fetch job data for tour-based chats or if not in jobsWithAgencies
            try {
              const jobRes = await fetch(`/api/jobs?jobId=${encodeURIComponent(chat.jobId)}`, {
                cache: 'no-store'
              });
              const jobJson = await jobRes.json().catch(() => ({}));
              if (jobJson?.ok && jobJson?.job) {
                const jobRaw = jobJson.job as Record<string, unknown>;
                const job: Job = {
                  id: String(chat.jobId),
                  name: typeof jobRaw.name === 'string' ? jobRaw.name : undefined,
                  start_time: (typeof jobRaw.start_time === 'string' ? jobRaw.start_time : null) ?? null,
                  end_time: (typeof jobRaw.end_time === 'string' ? jobRaw.end_time : null) ?? null,
                  location: (typeof jobRaw.location === 'string' ? jobRaw.location : null) ?? null,
                  description: (typeof jobRaw.description === 'string' ? jobRaw.description : null) ?? null,
                  languages: (() => {
                    if (!jobRaw.languages) return [];
                    if (Array.isArray(jobRaw.languages)) {
                      return jobRaw.languages.filter((l): l is string => typeof l === 'string');
                    }
                    if (typeof jobRaw.languages === 'string') {
                      try {
                        const parsed = JSON.parse(jobRaw.languages);
                        return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : [];
                      } catch {
                        return jobRaw.languages.split(',').map((s: string) => s.trim()).filter(Boolean);
                      }
                    }
                    return [];
                  })(),
                  group_size: typeof jobRaw.group_size === 'number' ? jobRaw.group_size : null,
                  min_price: typeof jobRaw.min_price === 'number' ? jobRaw.min_price : null,
                  max_price: typeof jobRaw.max_price === 'number' ? jobRaw.max_price : null,
                  images: Array.isArray(jobRaw.images) 
                    ? jobRaw.images.filter((img): img is string => typeof img === 'string')
                    : [],
                  signedImageUrls: null,
                };
                setFetchedJobData(job);
              }
            } catch (err) {
              console.error('Error fetching job data:', err);
            }
          }
        }
        
        if (other?.id) {
          setSelectedAgencyId(String(other.id));
          
          // Check if agent exists in jobsWithAgencies
          let agentExists = false;
          if (chat?.jobId) {
            const job = jobsWithAgencies.find(j => j.id === chat.jobId);
            if (job?.agent?.id === other.id) {
              agentExists = true;
            }
          }
          
          if (!agentExists || isTourBased) {
            // Fetch agent data for tour-based chats or if not in jobsWithAgencies
            try {
              // Use /api/profile/[id] to get full user and profile data
              const profileRes = await fetch(`/api/profile/${encodeURIComponent(other.id)}`, {
                cache: 'no-store'
              });
              const profileJson = await profileRes.json().catch(() => ({}));
              
              if (profileJson?.ok && profileJson?.user) {
                const userRaw = profileJson.user as Record<string, unknown>;
                const profileRaw = profileJson.profile as Record<string, unknown> | null;
                
                let avatarUrl: string | null = null;
                if (profileRaw?.profile_picture_path) {
                  try {
                    const signRes = await fetch('/api/storage/sign', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        items: [{ bucket: 'avatars', path: profileRaw.profile_picture_path as string }],
                      }),
                    });
                    const signJson = await signRes.json().catch(() => ({}));
                    avatarUrl = signJson?.items?.[0]?.signedUrl || signJson?.items?.[0]?.publicUrl || null;
                  } catch {
                    avatarUrl = profileRaw.avatarUrl as string | null || other.avatarUrl || null;
                  }
                } else {
                  avatarUrl = profileRaw?.avatarUrl as string | null || other.avatarUrl || null;
                }
                
                const firstName = (userRaw.first_name || userRaw.firstName) as string | null;
                const lastName = (userRaw.last_name || userRaw.lastName) as string | null;
                const name = `${firstName || ''} ${lastName || ''}`.trim() || other.name || 'Agency';
                
                setFetchedAgentData({
                  id: String(other.id),
                  name,
                  email: (userRaw.email || other.email) as string | null,
                  avatarUrl: avatarUrl,
                  country: (userRaw.country as string | null) || null,
                  city: (userRaw.city as string | null) || null,
                  phone: (userRaw.phone as string | null) || null,
                  guideNumber: (userRaw.guide_number as string | null) || null,
                });
              } else {
                // Fallback to otherParticipant data
                setFetchedAgentData({
                  id: String(other.id),
                  name: other.name || 'Agency',
                  email: other.email || null,
                  avatarUrl: other.avatarUrl || null,
                });
              }
            } catch (err) {
              console.error('Error fetching agent data:', err);
              // Fallback to otherParticipant data
              setFetchedAgentData({
                id: String(other.id),
                name: other.name || 'Agency',
                email: other.email || null,
                avatarUrl: other.avatarUrl || null,
              });
            }
          }
        }
        
        if (other) {
          setOtherParticipant({
            id: String(other.id),
            name: other.name || 'Agency',
            avatar: other.avatarUrl || null,
          });
        }
      } catch (err) {
        console.error('Error loading chat meta:', err);
      }
    })();
  };

  // Enrich selected job with full details when selected
  useEffect(() => {
    if (!selectedJobId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/jobs?jobId=${encodeURIComponent(selectedJobId)}`,
          { cache: 'no-store' }
        );
        const json = (await res.json().catch(() => ({}))) as {
          job?: Record<string, unknown>;
        };
        const jobRaw = json?.job || null;
        if (!jobRaw) return;
        const updated = (prev: Job[]): Job[] =>
          prev.map((j) => {
            if (j.id !== selectedJobId) return j;
            const merged: Job = {
              ...j,
              name:
                (typeof jobRaw.name === "string" ? jobRaw.name : undefined) ??
                j.name,
              start_time:
                (typeof jobRaw.start_time === "string"
                  ? jobRaw.start_time
                  : undefined) ?? j.start_time,
              end_time:
                (typeof jobRaw.end_time === "string"
                  ? jobRaw.end_time
                  : undefined) ?? j.end_time,
              location:
                (typeof jobRaw.location === "string"
                  ? jobRaw.location
                  : undefined) ?? j.location,
              description:
                (typeof jobRaw.description === "string"
                  ? jobRaw.description
                  : undefined) ?? j.description,
              languages: (() => {
                // Parse languages - could be JSON string, array, or comma-separated string
                if (!jobRaw.languages) return j.languages || [];
                if (Array.isArray(jobRaw.languages)) {
                  return (jobRaw.languages as unknown[]).filter(
                    (l): l is string => typeof l === "string"
                  );
                }
                if (typeof jobRaw.languages === "string" && jobRaw.languages.length > 0) {
                  // Try to parse as JSON first
                  try {
                    const parsed = JSON.parse(jobRaw.languages);
                    if (Array.isArray(parsed)) {
                      return parsed.filter((l): l is string => typeof l === "string");
                    }
                  } catch {
                    // If not JSON, treat as comma-separated string
                  }
                  // Fallback to comma-separated string
                  return jobRaw.languages
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                }
                return j.languages || [];
              })(),
              group_size:
                typeof jobRaw.group_size === "number"
                  ? jobRaw.group_size
                  : j.group_size,
              min_price:
                typeof jobRaw.min_price === "number"
                  ? jobRaw.min_price
                  : j.min_price,
              max_price:
                typeof jobRaw.max_price === "number"
                  ? jobRaw.max_price
                  : j.max_price,
              images: Array.isArray(jobRaw.images)
                ? (jobRaw.images as unknown[]).filter(
                  (img): img is string => typeof img === "string"
                )
                : j.images || [],
            };
            return merged;
          });
        if (!cancelled) setJobsWithAgencies((prev) => updated(prev));

        // Sign images for this selected job
        const current = (arr: Job[]) => arr.find((j) => j.id === selectedJobId);
        const jobAfter = current(updated(jobsWithAgencies));
        const imgs = jobAfter?.images || [];
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
              if (it?.path && typeof url === "string") pathToUrl[it.path] = url;
            });
            if (!cancelled)
              setJobsWithAgencies((prev) =>
                prev.map((j) =>
                  j.id !== selectedJobId
                    ? j
                    : {
                      ...j,
                      signedImageUrls: (j.images || []).map((img) => {
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
                      }),
                    }
                )
              );
          }
        }
      } catch {
        // Silently fail enrichment
      }
    })();
    return () => {
      cancelled = true;
    };
    // We only want to run this enrichment when the selected job changes.
    // Intentionally omit `jobsWithAgencies` from deps to avoid a setState->effect loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  // Fetch job and agent data when chatId is set but data isn't available (for tour-based chats)
  useEffect(() => {
    if (!chatId || !otherParticipant) return;
    
    // If we already have the data, don't refetch
    if (selectedJobId && selectedAgencyId) {
      const hasJob = fetchedJobData?.id === selectedJobId || jobsWithAgencies.some(j => j.id === selectedJobId);
      const hasAgent = fetchedAgentData?.id === selectedAgencyId || 
        jobsWithAgencies.some(j => j.agent?.id === selectedAgencyId);
      if (hasJob && hasAgent) return;
    }
    
    // Fetch chat metadata to get jobId and check if it's tour-based
    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/meta`, {
          cache: 'no-store'
        });
        if (!res.ok) return;
        
        const json = await res.json().catch(() => ({}));
        if (!json?.ok) return;
        
        const chat = json.chat as { id?: string; jobId?: string | null; applicationId?: string | null; clientName?: string | null };
        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null; email?: string | null };
        setChatClientName(chat?.clientName ?? null);
        const isTourBased = !chat.applicationId;
        
        if (chat?.jobId && (!selectedJobId || !jobsWithAgencies.some(j => j.id === chat.jobId))) {
          setSelectedJobId(String(chat.jobId));
          
          // Fetch job data
          try {
            const jobRes = await fetch(`/api/jobs?jobId=${encodeURIComponent(chat.jobId)}`, {
              cache: 'no-store'
            });
            const jobJson = await jobRes.json().catch(() => ({}));
            if (jobJson?.ok && jobJson?.job) {
              const jobRaw = jobJson.job as Record<string, unknown>;
              const job: Job = {
                id: String(chat.jobId),
                name: typeof jobRaw.name === 'string' ? jobRaw.name : undefined,
                start_time: (typeof jobRaw.start_time === 'string' ? jobRaw.start_time : null) ?? null,
                end_time: (typeof jobRaw.end_time === 'string' ? jobRaw.end_time : null) ?? null,
                location: (typeof jobRaw.location === 'string' ? jobRaw.location : null) ?? null,
                description: (typeof jobRaw.description === 'string' ? jobRaw.description : null) ?? null,
                languages: (() => {
                  if (!jobRaw.languages) return [];
                  if (Array.isArray(jobRaw.languages)) {
                    return jobRaw.languages.filter((l): l is string => typeof l === 'string');
                  }
                  if (typeof jobRaw.languages === 'string') {
                    try {
                      const parsed = JSON.parse(jobRaw.languages);
                      return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : [];
                    } catch {
                      return jobRaw.languages.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }
                  }
                  return [];
                })(),
                group_size: typeof jobRaw.group_size === 'number' ? jobRaw.group_size : null,
                min_price: typeof jobRaw.min_price === 'number' ? jobRaw.min_price : null,
                max_price: typeof jobRaw.max_price === 'number' ? jobRaw.max_price : null,
                images: Array.isArray(jobRaw.images) 
                  ? jobRaw.images.filter((img): img is string => typeof img === 'string')
                  : [],
                signedImageUrls: null,
              };
              setFetchedJobData(job);
            }
          } catch (err) {
            console.error('Error fetching job data:', err);
          }
        }
        
        if (other?.id && (!selectedAgencyId || !jobsWithAgencies.some(j => j.agent?.id === other.id))) {
          setSelectedAgencyId(String(other.id));
          
          // Fetch agent data
          try {
            const userRes = await fetch(`/api/user?id=${encodeURIComponent(other.id)}`, {
              cache: 'no-store'
            });
            const userJson = await userRes.json().catch(() => ({}));
            
            const profileRes = await fetch(`/api/profile?userId=${encodeURIComponent(other.id)}`, {
              cache: 'no-store'
            });
            const profileJson = await profileRes.json().catch(() => ({}));
            
            if (userJson?.ok && userJson?.user) {
              const userRaw = userJson.user as Record<string, unknown>;
              const profileRaw = profileJson?.profile as Record<string, unknown> | null;
              
              let avatarUrl: string | null = null;
              if (profileRaw?.profile_picture_path) {
                try {
                  const signRes = await fetch('/api/storage/sign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      items: [{ bucket: 'avatars', path: profileRaw.profile_picture_path as string }],
                    }),
                  });
                  const signJson = await signRes.json().catch(() => ({}));
                  avatarUrl = signJson?.items?.[0]?.signedUrl || signJson?.items?.[0]?.publicUrl || null;
                } catch {
                  avatarUrl = other.avatarUrl || null;
                }
              } else {
                avatarUrl = other.avatarUrl || null;
              }
              
              const firstName = (userRaw.first_name || userRaw.firstName) as string | null;
              const lastName = (userRaw.last_name || userRaw.lastName) as string | null;
              const name = `${firstName || ''} ${lastName || ''}`.trim() || other.name || 'Agency';
              
              setFetchedAgentData({
                id: String(other.id),
                name,
                email: (userRaw.email || other.email) as string | null,
                avatarUrl: avatarUrl,
              });
            } else {
              setFetchedAgentData({
                id: String(other.id),
                name: other.name || 'Agency',
                email: other.email || null,
                avatarUrl: other.avatarUrl || null,
              });
            }
          } catch (err) {
            console.error('Error fetching agent data:', err);
            setFetchedAgentData({
              id: String(other.id),
              name: other.name || 'Agency',
              email: other.email || null,
              avatarUrl: other.avatarUrl || null,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching chat meta for data:', err);
      }
    })();
  }, [chatId, otherParticipant, selectedJobId, selectedAgencyId, jobsWithAgencies, fetchedJobData, fetchedAgentData]);

  const handleStartClientChat = () => setClientChatDialogOpen(true);

  const handleCreateClientChat = async () => {
    if (!currentUserId || !otherParticipant?.id || !clientNameInput.trim()) {
      toast.error("Please enter a client or travel order name.");
      return;
    }
    setCreatingClientChat(true);
    try {
      const res = await fetch('/api/chats/ensure-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: otherParticipant.id,
          guideId: currentUserId,
          clientName: clientNameInput.trim(),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: 'Failed to parse response' }));
      if (res.ok && json?.ok && json?.chatId) {
        setClientChatDialogOpen(false);
        setClientNameInput("");
        setChatListRefreshTrigger((t) => t + 1);
        handleSelectConversation(json.chatId);
      } else {
        toast.error(json?.error || 'Failed to start chat');
      }
    } catch (err) {
      console.error('Error creating client chat:', err);
      toast.error('Failed to start chat');
    } finally {
      setCreatingClientChat(false);
    }
  };

  return (
    <div className={CONVERSATION_PAGE_CLASS}>
      <div className={CONVERSATION_TOOLBAR_CLASS}>
        <BackButton label="Back" className="text-[#D4AA25]" href={backHref} />
      </div>

      <div className="flex flex-col flex-1 min-h-0 w-full gap-2 overflow-hidden">
        <WhatsAppSyncBar />
        <div className={CONVERSATION_MAIN_ROW_CLASS}>
        {/* Conversations Sidebar */}
        <ConversationsSidebar
          selectedId={chatId || ""}
          onSelect={handleSelectConversation}
          selectedChatId={chatId || undefined as string | undefined}
          userRole="guide"
          refreshTrigger={chatListRefreshTrigger}
          currentUserId={currentUserId}
        />

        {/* Chat Panel */}
        <ChatPanel
          chatId={chatId}
          currentUserId={currentUserId}
          currentUserAvatar={currentUserAvatar}
          otherParticipant={otherParticipant}
          clientName={chatClientName}
          peerRoleLabel="Travel agent"
          onStartClientChat={otherParticipant ? handleStartClientChat : undefined}
        />

        {/* Profile Panel: show only when a conversation is selected */}
        {chatId && otherParticipant ? (
          <ProfilePanel
            applicant={(function () {
              // First check fetched agent data
              if (fetchedAgentData && fetchedAgentData.id === selectedAgencyId) {
                return {
                  id: fetchedAgentData.id,
                  name: fetchedAgentData.name,
                  email: fetchedAgentData.email,
                  avatarUrl: fetchedAgentData.avatarUrl,
                  coverLetter: null,
                  appliedAt: null,
                  country: fetchedAgentData.country || null,
                  city: fetchedAgentData.city || null,
                  phone: fetchedAgentData.phone || null,
                  guideNumber: fetchedAgentData.guideNumber || null,
                };
              }
              
              // Then check jobsWithAgencies (if available)
              if (selectedAgencyId) {
                const job = jobsWithAgencies.find((j) => j.agent?.id === selectedAgencyId);
                const ag = job?.agent;
                if (ag) {
                  return {
                    id: String(ag.id || selectedAgencyId),
                    name: ag.name || "Agency",
                    email: ag.user?.email || null,
                    avatarUrl: ag.profile?.avatarUrl || null,
                    coverLetter: null,
                    appliedAt: null,
                    // Note: jobsWithAgencies may not have full profile data, so these may be null
                    country: null,
                    city: null,
                    phone: null,
                    guideNumber: null,
                  };
                }
              }
              
              // Fallback to otherParticipant data (from chat metadata)
              if (otherParticipant) {
                return {
                  id: otherParticipant.id,
                  name: otherParticipant.name,
                  email: null,
                  avatarUrl: otherParticipant.avatar,
                  coverLetter: null,
                  appliedAt: null,
                };
              }
              
              return null;
            })()}
          />
        ) : null}
        </div>
      </div>

      <Dialog open={clientChatDialogOpen} onOpenChange={setClientChatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New chat for client / travel order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Start a separate thread for a specific client or travel order. Messages here are kept separate from the original chat.
          </p>
          <Input
            placeholder="Client or travel order name"
            value={clientNameInput}
            onChange={(e) => setClientNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateClientChat()}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setClientChatDialogOpen(false)} disabled={creatingClientChat}>
              Cancel
            </Button>
            <Button onClick={handleCreateClientChat} disabled={creatingClientChat || !clientNameInput.trim()}>
              {creatingClientChat ? "Creating…" : "Start chat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className={`${CONVERSATION_PAGE_CLASS} items-center justify-center text-muted-foreground`}>Loading conversation…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
