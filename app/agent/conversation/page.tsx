"use client";

import { Suspense, useEffect, useState } from "react";
import { ConversationsSidebar } from "@/components/chat/conversations-sidebar";
import { WhatsAppSyncBar } from "@/components/chat/whatsapp-sync-bar";
import { BackButton } from "@/components/shared/back-button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ProfilePanel } from "@/components/chat/profile-panel";
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
import { PAGODA_SUPPORT_PEER_ID } from "@/lib/itinerary-support-chat";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(
    null
  );
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatClientName, setChatClientName] = useState<string | null>(null);
  const [chatKind, setChatKind] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<{
    id: string;
    name: string;
    avatar: string | null;
  } | null>(null);
  const searchChatId = searchParams?.get('chatId') || null;
  const backHref = resolveConversationBackHref({
    fromParam: searchParams?.get("from"),
    itineraryIdParam: searchParams?.get("itineraryId"),
    role: "agent",
    pathname: "/agent/conversation",
  });

  const [clientChatDialogOpen, setClientChatDialogOpen] = useState(false);
  const [clientNameInput, setClientNameInput] = useState("");
  const [creatingClientChat, setCreatingClientChat] = useState(false);
  const [chatListRefreshTrigger, setChatListRefreshTrigger] = useState(0);

  // Guide/participant data structure
  type GuideInfo = {
    id: string;
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
      bio?: string | null;
    } | null;
    country?: string | null;
    city?: string | null;
    bio?: string | null;
    guideNumber?: string | null;
    profileSlug?: string | null;
  };

  const [fetchedGuideData, setFetchedGuideData] = useState<GuideInfo | null>(null);

  // Get current user ID and avatar
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        if (!res.ok) {
          console.error("Failed to fetch user:", res.status);
          return;
        }
        const json = await res.json().catch((err) => {
          console.error("Failed to parse user response:", err);
          return { ok: false };
        });

        if (json.ok && json.user?.id) {
          setCurrentUserId(json.user.id);

          // Store user name and email for MeetingButton
          const firstName = json.user.first_name || json.user.firstName || '';
          const lastName = json.user.last_name || json.user.lastName || '';
          const fullName = `${firstName} ${lastName}`.trim() || 'User';
          setCurrentUserName(fullName);
          setCurrentUserEmail(json.user.email || null);

          // Fetch current user's profile for avatar
          const profileRes = await fetch("/api/profile");
          if (!profileRes.ok) {
            console.error("Failed to fetch profile:", profileRes.status);
            return;
          }
          const profileJson = await profileRes.json().catch((err) => {
            console.error("Failed to parse profile response:", err);
            return { ok: false };
          });

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
            if (!signRes.ok) {
              console.error("Failed to sign avatar URL:", signRes.status);
              return;
            }
            const signJson = await signRes.json().catch((err) => {
              console.error("Failed to parse sign response:", err);
              return {};
            });
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

  useEffect(() => {
    if (!chatId) return;
    void fetch("/api/user/whatsapp-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
      credentials: "include",
    }).catch(() => {});
  }, [chatId]);

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

        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null; email?: string | null };
        const chat = json.chat as {
          id?: string;
          jobId?: string | null;
          applicationId?: string | null;
          clientName?: string | null;
          chatKind?: string | null;
        };

        // Set chatId and clientName (for client/travel order threads)
        if (chat?.id) {
          setChatId(String(chat.id));
        }
        setChatClientName(chat?.clientName ?? null);
        setChatKind(chat?.chatKind ?? null);

        // Set other participant info
        if (other?.id) {
          setOtherParticipant({
            id: String(other.id),
            name: other.name || (other.id === PAGODA_SUPPORT_PEER_ID ? "Pagoda Support" : "Guide"),
            avatar: other.avatarUrl || null
          });
          if (other.id !== PAGODA_SUPPORT_PEER_ID) {
            setSelectedGuideId(String(other.id));
          }
        }
        
        // Fetch guide data
        if (other?.id && other.id !== PAGODA_SUPPORT_PEER_ID) {
          try {
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
                  avatarUrl = other.avatarUrl || null;
                }
              } else {
                avatarUrl = other.avatarUrl || null;
              }
              
              const guide: GuideInfo = {
                id: String(other.id),
                applicantId: String(other.id),
                user: {
                  id: String(other.id),
                  firstName: (userRaw.first_name || userRaw.firstName) as string | null,
                  lastName: (userRaw.last_name || userRaw.lastName) as string | null,
                  email: (userRaw.email || other.email) as string | null,
                },
                profile: {
                  id: profileRaw?.id ? String(profileRaw.id) : '',
                  userId: String(other.id),
                  avatarPath: (profileRaw?.profile_picture_path as string | null) || null,
                  avatarUrl: avatarUrl,
                  bio: (profileRaw?.bio as string | null) || null,
                },
                coverLetter: null,
                appliedAt: null,
                country: (userRaw.country as string | null) || null,
                city: (userRaw.city as string | null) || null,
                bio: (profileRaw?.bio as string | null) || null,
                guideNumber: (userRaw.guide_number as string | null) || null,
                profileSlug: (profileRaw?.profile_slug as string | null) || null,
              };
              setFetchedGuideData(guide);
              
              // Update otherParticipant with the signed avatar URL
              if (avatarUrl) {
                setOtherParticipant(prev => prev ? {
                  ...prev,
                  avatar: avatarUrl
                } : null);
              }
            }
          } catch (err) {
            console.error('Error fetching guide data:', err);
          }
        }
      } catch (err) {
        console.error('Error loading chat from query param:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [searchChatId]);

  const handleSelectConversation = (selectedChatId: string) => {
    // If already selected, don't refetch
    if (chatId === selectedChatId) return;

    setChatId(selectedChatId);

    // Fetch chat metadata to get participant info
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

        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null; email?: string | null };
        const chatMeta = json.chat as { clientName?: string | null; chatKind?: string | null } | undefined;
        if (chatMeta) {
          setChatClientName(chatMeta.clientName ?? null);
          setChatKind(chatMeta.chatKind ?? null);
        }

        // Set otherParticipant immediately with initial data
        if (other) {
          setOtherParticipant({
            id: String(other.id || ''),
            name: other.name || (other.id === PAGODA_SUPPORT_PEER_ID ? "Pagoda Support" : "Guide"),
            avatar: other.avatarUrl || null,
          });
        }
        
        if (other?.id && other.id !== PAGODA_SUPPORT_PEER_ID) {
          setSelectedGuideId(String(other.id));
          
          // Fetch guide data
          try {
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
              
              const guide: GuideInfo = {
                id: String(other.id),
                applicantId: String(other.id),
                user: {
                  id: String(other.id),
                  firstName: (userRaw.first_name || userRaw.firstName) as string | null,
                  lastName: (userRaw.last_name || userRaw.lastName) as string | null,
                  email: (userRaw.email || other.email) as string | null,
                },
                profile: {
                  id: profileRaw?.id ? String(profileRaw.id) : '',
                  userId: String(other.id),
                  avatarPath: (profileRaw?.profile_picture_path as string | null) || null,
                  avatarUrl: avatarUrl,
                  bio: (profileRaw?.bio as string | null) || null,
                },
                coverLetter: null,
                appliedAt: null,
                country: (userRaw.country as string | null) || null,
                city: (userRaw.city as string | null) || null,
                bio: (profileRaw?.bio as string | null) || null,
                guideNumber: (userRaw.guide_number as string | null) || null,
                profileSlug: (profileRaw?.profile_slug as string | null) || null,
              };
              setFetchedGuideData(guide);
              
              // Update otherParticipant with the signed avatar URL
              if (avatarUrl) {
                setOtherParticipant(prev => prev ? {
                  ...prev,
                  avatar: avatarUrl
                } : null);
              }
            }
          } catch (err) {
            console.error('Error fetching guide data:', err);
          }
        }
      } catch (err) {
        console.error('Error loading chat meta:', err);
      }
    })();
  };

  // Fetch guide data when chatId is set but data isn't available
  useEffect(() => {
    if (!chatId || !otherParticipant) return;
    
    // If we already have the data, don't refetch
    if (fetchedGuideData?.user?.id === selectedGuideId) return;
    
    // Fetch chat metadata to get participant info
    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/meta`, {
          cache: 'no-store'
        });
        if (!res.ok) return;
        
        const json = await res.json().catch(() => ({}));
        if (!json?.ok) return;
        
        const other = json.other as { id?: string; name?: string; avatarUrl?: string | null; email?: string | null };
        const chatMeta = json.chat as { clientName?: string | null; chatKind?: string | null } | undefined;
        if (chatMeta) {
          setChatClientName(chatMeta.clientName ?? null);
          setChatKind(chatMeta.chatKind ?? null);
        }

        if (other?.id && other.id !== PAGODA_SUPPORT_PEER_ID && !selectedGuideId) {
          setSelectedGuideId(String(other.id));
        }
        
        if (other?.id && other.id !== PAGODA_SUPPORT_PEER_ID && !fetchedGuideData) {
          try {
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
              
              const guide: GuideInfo = {
                id: String(other.id),
                applicantId: String(other.id),
                user: {
                  id: String(other.id),
                  firstName: (userRaw.first_name || userRaw.firstName) as string | null,
                  lastName: (userRaw.last_name || userRaw.lastName) as string | null,
                  email: (userRaw.email || other.email) as string | null,
                },
                profile: {
                  id: profileRaw?.id ? String(profileRaw.id) : '',
                  userId: String(other.id),
                  avatarPath: (profileRaw?.profile_picture_path as string | null) || null,
                  avatarUrl: avatarUrl,
                  bio: (profileRaw?.bio as string | null) || null,
                },
                coverLetter: null,
                appliedAt: null,
                country: (userRaw.country as string | null) || null,
                city: (userRaw.city as string | null) || null,
                bio: (profileRaw?.bio as string | null) || null,
                guideNumber: (userRaw.guide_number as string | null) || null,
                profileSlug: (profileRaw?.profile_slug as string | null) || null,
              };
              setFetchedGuideData(guide);
              
              // Update otherParticipant with the signed avatar URL
              if (avatarUrl) {
                setOtherParticipant(prev => prev ? {
                  ...prev,
                  avatar: avatarUrl
                } : null);
              }
            }
          } catch (err) {
            console.error('Error fetching guide data:', err);
          }
        }
      } catch (err) {
        console.error('Error fetching chat meta for data:', err);
      }
    })();
  }, [chatId, otherParticipant, selectedGuideId, fetchedGuideData]);

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
          agencyId: currentUserId,
          guideId: otherParticipant.id,
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
          userRole="agent"
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
          peerRoleLabel={
            chatKind === "itinerary_support" ? "Pagoda team" : undefined
          }
          onStartClientChat={otherParticipant ? handleStartClientChat : undefined}
        />

        {/* Profile Panel: show only when a conversation is selected (not Pagoda support) */}
        {chatId && otherParticipant && otherParticipant.id !== PAGODA_SUPPORT_PEER_ID ? (
          <ProfilePanel
            applicant={(function () {
              // First check fetched guide data
              if (fetchedGuideData && (fetchedGuideData.user?.id === selectedGuideId || fetchedGuideData.id === selectedGuideId)) {
                const g = fetchedGuideData;
                const name =
                  `${g.user?.firstName || ""} ${g.user?.lastName || ""
                    }`.trim() || "Guide";
                return {
                  id: g.user?.id || g.id || "",
                  name,
                  email: g.user?.email ?? null,
                  avatarUrl: g.profile?.avatarUrl ?? null,
                  coverLetter: g.coverLetter ?? null,
                  appliedAt: g.appliedAt ?? null,
                  country: g.country || null,
                  city: g.city || null,
                  bio: g.bio || g.profile?.bio || null,
                  guideNumber: g.guideNumber || null,
                  profileSlug: g.profileSlug || null,
                };
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
            currentUser={
              currentUserId && currentUserName && currentUserEmail
                ? {
                  id: currentUserId,
                  name: currentUserName,
                  email: currentUserEmail,
                  role: "agent",
                }
                : null
            }
            chatId={chatId}
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
