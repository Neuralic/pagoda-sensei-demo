"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabase';
import { useUnread } from '@/components/chat/unread-context';
import testImage from "../../public/assets/images/profile/scenic-garden-landscape-with-bridge.png";
import { StaticImageData } from "next/image";
import { ChevronDown, ChevronRight, Plus, User, Trash2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import toast from "react-hot-toast";

export type ChatParticipantRole = "agent" | "guide";

interface ConversationsSidebarProps {
  selectedId: string;
  selectedChatId?: string;
  onSelect: (id: string) => void;
  /** Required to show "New client chat" and create client threads */
  userRole?: ChatParticipantRole | null;
  /** Increment to force refetch of chat list (e.g. after creating a client chat from the conversation page) */
  refreshTrigger?: number;
  /** If provided, skip fetching /api/user and start loading chats immediately */
  currentUserId?: string | null;
}

type RawChat = {
  chatId: string;
  participantId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageTime: string;
  clientName: string | null;
};

type ParticipantGroup = {
  participantId: string;
  name: string;
  avatarUrl: string | null;
  lastMessageTime: string;
  chats: Array<{
    chatId: string;
    clientName: string | null;
    lastMessage: string;
    lastMessageTime: string;
  }>;
};

export function ConversationsSidebar({
  selectedId,
  selectedChatId,
  onSelect,
  userRole = null,
  refreshTrigger = 0,
  currentUserId: currentUserIdProp = null,
}: ConversationsSidebarProps) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const currentUserRef = useRef<string | null>(null);
  const lastMarkedChatRef = useRef<string | null>(null);
  const markReadTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const { perChat, markRead, markUnread, shouldSkipAutoRead } = useUnread();

  // New client chat dialog
  const [clientChatDialogOpen, setClientChatDialogOpen] = useState(false);
  const [clientChatParticipantId, setClientChatParticipantId] = useState<string | null>(null);
  const [clientNameInput, setClientNameInput] = useState("");
  const [creatingClientChat, setCreatingClientChat] = useState(false);
  const [openingGeneralChatFor, setOpeningGeneralChatFor] = useState<string | null>(null);
  const [removingChatId, setRemovingChatId] = useState<string | null>(null);
  const [deleteConfirmChatId, setDeleteConfirmChatId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentUserIdProp) {
        currentUserRef.current = currentUserIdProp;
        return;
      }
      try {
        const res = await fetch('/api/user');
        const json = await res.json().catch(() => ({}));
        if (!cancelled && json?.ok && json.user?.id) currentUserRef.current = json.user.id;
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true };
  }, [currentUserIdProp]);

  const [allChats, setAllChats] = useState<RawChat[]>([]);
  const chatIdsRef = useRef<Set<string>>(new Set());
  const [internalRefreshTrigger, setInternalRefreshTrigger] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false };
  }, []);

  useEffect(() => {
    const userId = currentUserIdProp ?? currentUserRef.current;
    if (!userId) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        const res = await fetch('/api/chats', { cache: 'no-store' });
        if (!res.ok || cancelled) return;

        const json = await res.json().catch(() => ({}));
        if (!json?.ok || !Array.isArray(json.chats) || cancelled) return;

        const chatsList: RawChat[] = [];
        const cids = new Set<string>();

        json.chats.forEach((chat: {
          chatId?: string;
          id?: string;
          otherParticipant?: { id?: string; name?: string; avatarUrl?: string | null };
          lastMessage?: string;
          lastMessageTime?: string;
          createdAt?: string;
          clientName?: string | null;
        }) => {
          const chatId = chat.chatId || chat.id;
          const otherParticipant = chat.otherParticipant;
          if (!chatId || !otherParticipant?.id) return;

          const participantId = otherParticipant.id;
          const lastMessageTime = chat.lastMessageTime || chat.createdAt || '';
          cids.add(chatId);

          chatsList.push({
            chatId,
            participantId,
            name: otherParticipant.name || 'User',
            avatarUrl: otherParticipant.avatarUrl ?? null,
            lastMessage: chat.lastMessage || '',
            lastMessageTime,
            clientName: chat.clientName ?? null,
          });
        });

        chatIdsRef.current = cids;
        if (!cancelled) {
          setAllChats(chatsList.sort((a, b) => b.lastMessageTime.localeCompare(a.lastMessageTime)));
        }

        if (!cancelled && cids.size > 0) {
          channel = supabase
            .channel('sidebar:messages:all')
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'chat_messages' },
              (payload) => {
                if (!mountedRef.current || cancelled) return;
                const newMsg = payload.new as { chat_id?: string; message?: string; created_at?: string };
                if (!newMsg?.chat_id) return;
                const cid = newMsg.chat_id as string;
                if (!cids.has(cid)) return;
                const messageText = (newMsg.message || '') as string;
                const createdAt = (newMsg.created_at || new Date().toISOString()) as string;
                setAllChats((prev) =>
                  prev.map((c) =>
                    c.chatId === cid
                      ? { ...c, lastMessage: messageText, lastMessageTime: createdAt }
                      : c
                  ).sort((a, b) => b.lastMessageTime.localeCompare(a.lastMessageTime))
                );
              }
            )
            .subscribe();
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserIdProp, refreshTrigger, internalRefreshTrigger]);

  // Per-chat unread (keyed by chatId)
  useEffect(() => {
    const entries = Object.entries(perChat || {});
    if (entries.length === 0) {
      setUnreadCounts({});
      return;
    }
    const next: Record<string, number> = {};
    for (const [chatId, count] of entries) {
      next[chatId] = typeof count === 'number' ? count : 0;
    }
    setUnreadCounts(next);
  }, [perChat]);

  // Group by participant, sort chats: General first, then client name
  const groups: ParticipantGroup[] = useMemo(() => {
    const byParticipant = new Map<string, ParticipantGroup>();

    for (const c of allChats) {
      let group = byParticipant.get(c.participantId);
      if (!group) {
        group = {
          participantId: c.participantId,
          name: c.name,
          avatarUrl: c.avatarUrl,
          lastMessageTime: c.lastMessageTime,
          chats: [],
        };
        byParticipant.set(c.participantId, group);
      }
      group.chats.push({
        chatId: c.chatId,
        clientName: c.clientName,
        lastMessage: c.lastMessage,
        lastMessageTime: c.lastMessageTime,
      });
      if (c.lastMessageTime > group.lastMessageTime) {
        group.lastMessageTime = c.lastMessageTime;
      }
    }

    for (const g of byParticipant.values()) {
      g.chats.sort((a, b) => {
        const aLabel = a.clientName ?? '';
        const bLabel = b.clientName ?? '';
        if (aLabel === '' && bLabel !== '') return -1;
        if (aLabel !== '' && bLabel === '') return 1;
        return b.lastMessageTime.localeCompare(a.lastMessageTime);
      });
    }

    return Array.from(byParticipant.values()).sort(
      (a, b) => b.lastMessageTime.localeCompare(a.lastMessageTime)
    );
  }, [allChats]);

  const groupsFiltered = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups.filter((g) => {
      const nameMatch = g.name.toLowerCase().includes(q);
      const anyMessage = g.chats.some((c) => c.lastMessage.toLowerCase().includes(q));
      const anyClient = g.chats.some((c) => (c.clientName || '').toLowerCase().includes(q));
      return nameMatch || anyMessage || anyClient;
    });
  }, [groups, searchQuery]);

  // Expand the group only when a client (subcategory) chat is selected, so the user sees which client is selected.
  // When the user clicks the guide/agent name and opens the original chat, do NOT expand the subcategory.
  useEffect(() => {
    if (!selectedId || groups.length === 0) return;
    const group = groups.find((g) => g.chats.some((c) => c.chatId === selectedId));
    if (!group) return;
    const selectedChat = group.chats.find((c) => c.chatId === selectedId);
    const isClientChat = selectedChat && !!selectedChat.clientName && selectedChat.clientName !== "";
    if (isClientChat) {
      setExpandedParticipants((prev) => new Set(prev).add(group.participantId));
    }
  }, [selectedId, groups]);

  useEffect(() => {
    if (!selectedId) return;
    if (markReadTimeoutRef.current) {
      window.clearTimeout(markReadTimeoutRef.current);
      markReadTimeoutRef.current = null;
    }

    if (!shouldSkipAutoRead(selectedId)) {
      setUnreadCounts((prev) => ({ ...prev, [selectedId]: 0 }));
    }

    if (shouldSkipAutoRead(selectedId)) {
      return;
    }

    markReadTimeoutRef.current = window.setTimeout(async () => {
      try {
        if (selectedId && lastMarkedChatRef.current !== selectedId) {
          await markRead(selectedId);
          lastMarkedChatRef.current = selectedId;
        }
      } catch (err) {
        console.error('Error marking conversation as read:', err);
      } finally {
        markReadTimeoutRef.current = null;
      }
    }, 300);

    return () => {
      if (markReadTimeoutRef.current) {
        window.clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, [selectedId, markRead, shouldSkipAutoRead]);

  const toggleExpanded = (participantId: string) => {
    setExpandedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const openNewClientChatDialog = (participantId: string) => {
    setClientChatParticipantId(participantId);
    setClientNameInput("");
    setClientChatDialogOpen(true);
  };

  const handleOpenGeneralChat = async (group: ParticipantGroup) => {
    const generalChat = group.chats.find((c) => !c.clientName || c.clientName === "");
    if (generalChat) {
      onSelect(generalChat.chatId);
      return;
    }
    if (!userRole || !currentUserRef.current) return;
    const agencyId = userRole === "agent" ? currentUserRef.current : group.participantId;
    const guideId = userRole === "agent" ? group.participantId : currentUserRef.current;
    setOpeningGeneralChatFor(group.participantId);
    try {
      const res = await fetch("/api/chats/ensure-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, guideId }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (res.ok && json?.ok && json?.chatId) {
        onSelect(json.chatId);
      } else {
        toast.error(json?.error || "Failed to open chat");
      }
    } catch (err) {
      console.error("Error opening general chat:", err);
      toast.error("Failed to open chat");
    } finally {
      setOpeningGeneralChatFor(null);
    }
  };

  const createClientChat = async () => {
    const participantId = clientChatParticipantId;
    const currentUserId = currentUserRef.current;
    if (!participantId || !currentUserId || !userRole || !clientNameInput.trim()) {
      toast.error("Please enter a client or travel order name.");
      return;
    }
    const agencyId = userRole === 'agent' ? currentUserId : participantId;
    const guideId = userRole === 'agent' ? participantId : currentUserId;
    setCreatingClientChat(true);
    try {
      const res = await fetch('/api/chats/ensure-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId,
          guideId,
          clientName: clientNameInput.trim(),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: 'Failed to parse response' }));
      if (res.ok && json?.ok && json?.chatId) {
        setClientChatDialogOpen(false);
        setClientChatParticipantId(null);
        setClientNameInput("");
        setInternalRefreshTrigger((t) => t + 1);
        onSelect(json.chatId);
        // Landing in an existing thread is a legitimate outcome, but it has to be said —
        // silently reusing one is what made "+" look broken.
        toast.success(
          json?.created
            ? `New thread started for ${clientNameInput.trim()}.`
            : `Opened the existing thread for ${json?.clientName || clientNameInput.trim()}.`
        );
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

  const handleMarkUnread = async (chatId: string, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    await markUnread(chatId);
    lastMarkedChatRef.current = null;
    toast.success("Marked as unread");
  };

  const handleRemoveChat = async (chatId: string) => {
    const group = groups.find((g) => g.chats.some((c) => c.chatId === chatId));
    const generalChat = group?.chats.find((c) => !c.clientName || c.clientName === "");
    setRemovingChatId(chatId);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false, error: "Failed to remove chat" }));
      if (res.ok && json?.ok) {
        setDeleteConfirmChatId(null);
        setAllChats((prev) => prev.filter((c) => c.chatId !== chatId));
        setInternalRefreshTrigger((t) => t + 1);
        if (selectedId === chatId || selectedChatId === chatId) {
          onSelect(generalChat?.chatId ?? "");
        }
        toast.success("Chat removed");
      } else {
        toast.error(json?.error || "Failed to remove chat");
      }
    } catch (err) {
      console.error("Error removing chat:", err);
      toast.error("Failed to remove chat");
    } finally {
      setRemovingChatId(null);
    }
  };

  return (
    <div className="border border-border bg-card flex flex-col h-full min-h-0 w-full lg:w-1/4 xl:w-1/5 rounded-lg">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          All Conversations
        </h2>
        <Input
          placeholder="Search by name or message"
          className="h-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {groupsFiltered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <ul className="py-1">
            {groupsFiltered.map((group) => {
              const isExpanded = expandedParticipants.has(group.participantId);
              const generalChat = group.chats.find((c) => !c.clientName || c.clientName === "");
              const clientChats = group.chats.filter((c) => !!c.clientName && c.clientName !== "");
              const isGeneralSelected =
                generalChat &&
                (selectedId === generalChat.chatId || selectedChatId === generalChat.chatId);
              const isOpeningGeneral = openingGeneralChatFor === group.participantId;
              const generalUnread = generalChat ? unreadCounts[generalChat.chatId] || 0 : 0;

              return (
                <li key={group.participantId} className="border-b border-border/50 last:border-0">
                  <div className="group/participant flex items-center gap-1 w-full">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(group.participantId);
                      }}
                      className="p-1 rounded hover:bg-muted shrink-0"
                      aria-label={isExpanded ? "Collapse client list" : "Expand client list"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenGeneralChat(group)}
                      disabled={isOpeningGeneral}
                      className={`flex-1 min-w-0 flex items-center gap-2 py-2 pr-2 rounded-md text-left ${isGeneralSelected ? "bg-[#F9F5E8]" : "hover:bg-muted"}`}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage
                          src={typeof group.avatarUrl === "string" ? group.avatarUrl : undefined}
                          alt={group.name}
                        />
                        <AvatarFallback>{group.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground truncate flex-1">
                        {group.name}
                      </span>
                      {generalUnread > 0 && (
                        <span className="shrink-0 bg-yellow-500 text-black text-xs font-bold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
                          {generalUnread > 99 ? "99+" : generalUnread}
                        </span>
                      )}
                      {isOpeningGeneral && (
                        <span className="text-xs text-muted-foreground shrink-0">Opening…</span>
                      )}
                    </button>
                    {userRole && generalChat && (
                      <button
                        type="button"
                        onClick={(e) => void handleMarkUnread(generalChat.chatId, e)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 opacity-0 group-hover/participant:opacity-100 transition-opacity"
                        title="Mark as unread"
                        aria-label="Mark as unread"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                    )}
                    {userRole && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openNewClientChatDialog(group.participantId);
                        }}
                        title="New chat for client / travel order"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {isExpanded && clientChats.length > 0 && (
                    <ul className="pl-6 pb-2">
                      {clientChats.map((chat) => {
                        const isSelected =
                          selectedId === chat.chatId || selectedChatId === chat.chatId;
                        const unread = unreadCounts[chat.chatId] || 0;
                        const isRemoving = removingChatId === chat.chatId;
                        return (
                          <li key={chat.chatId} className="group/chat flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelect(chat.chatId)}
                              className={`flex-1 min-w-0 px-3 py-2 flex items-center gap-2 rounded-md text-left ${isSelected ? "bg-[#F9F5E8]" : "hover:bg-muted"}`}
                            >
                              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {chat.clientName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {chat.lastMessage || "No messages yet"}
                                </p>
                              </div>
                              {unread > 0 && (
                                <span className="shrink-0 bg-yellow-500 text-black text-xs font-bold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
                                  {unread > 99 ? "99+" : unread}
                                </span>
                              )}
                            </button>
                            {userRole && (
                              <button
                                type="button"
                                onClick={(e) => void handleMarkUnread(chat.chatId, e)}
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 opacity-0 group-hover/chat:opacity-100 transition-opacity"
                                title="Mark as unread"
                                aria-label="Mark as unread"
                              >
                                <Mail className="h-4 w-4" />
                              </button>
                            )}
                            {userRole && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmChatId(chat.chatId);
                                }}
                                disabled={isRemoving}
                                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover/chat:opacity-100 transition-opacity disabled:opacity-50"
                                title="Remove chat room"
                                aria-label="Remove chat room"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
            onKeyDown={(e) => e.key === "Enter" && createClientChat()}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setClientChatDialogOpen(false)} disabled={creatingClientChat}>
              Cancel
            </Button>
            <Button onClick={createClientChat} disabled={creatingClientChat || !clientNameInput.trim()}>
              {creatingClientChat ? "Creating…" : "Start chat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmChatId !== null} onOpenChange={(open) => !open && setDeleteConfirmChatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove chat room</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this chat room and all its messages? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmChatId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmChatId && handleRemoveChat(deleteConfirmChatId)}
              disabled={!!removingChatId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingChatId ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
