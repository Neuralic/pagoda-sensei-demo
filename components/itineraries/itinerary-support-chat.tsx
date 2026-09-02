"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useUnread } from "@/components/chat/unread-context";
import toast from "react-hot-toast";
import { useBootstrap } from "@/components/shared/bootstrap-context";

type Peer = {
  id: string;
  name: string;
  role: "advisor" | "admin";
  email?: string | null;
};

type Props = {
  itineraryId: string;
  /** Auto-open when landing from email (?openChat=1) */
  autoOpen?: boolean;
};

/**
 * Floating itinerary support chat: Pagoda admin ↔ travel advisor.
 */
export function ItinerarySupportChat({ itineraryId, autoOpen = false }: Props) {
  const { impersonating } = useBootstrap();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [itineraryName, setItineraryName] = useState<string | null>(null);
  const { perChat, markRead, refresh } = useUnread();

  const unread = chatId ? perChat[chatId] || 0 : 0;

  const ensureChat = useCallback(async () => {
    if (!itineraryId) return null;
    setLoading(true);
    try {
      const res = await fetch("/api/chats/ensure-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itineraryId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.chatId) {
        throw new Error(data?.error || "Could not open chat");
      }
      setChatId(data.chatId);
      setCurrentUserId(data.currentUserId || null);
      setPeer(data.peer || null);
      setItineraryName(data.itineraryName || null);
      void refresh();
      return data.chatId as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open chat");
      return null;
    } finally {
      setLoading(false);
    }
  }, [itineraryId, refresh]);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    const id = chatId || (await ensureChat());
    if (id) void markRead(id);
  }, [chatId, ensureChat, markRead]);

  useEffect(() => {
    if (!autoOpen || !itineraryId) return;
    void handleOpen();
  }, [autoOpen, itineraryId, handleOpen]);

  useEffect(() => {
    if (!itineraryId || chatId) return;
    void ensureChat();
  }, [itineraryId, chatId, ensureChat]);

  if (!itineraryId) return null;

  /**
   * While an admin is in someone else's account, this thread reaches the advisor: the message
   * is attributed to Pagoda Support and the notification goes to the itinerary owner.
   *
   * It used to render a fixed amber panel here instead of the button, telling the admin to
   * return to admin and message from there. That advice described behaviour that no longer
   * exists, and the panel sat over the buttons in the bottom-right corner where it could not
   * be dismissed.
   */
  const buttonLabel = impersonating
    ? "Message advisor"
    : peer?.role === "advisor"
      ? "Message advisor"
      : "Message Pagoda";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => void handleOpen()}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#D4AA25] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#c49b1f] focus:outline-none focus:ring-2 focus:ring-[#D4AA25]/50"
          aria-label={buttonLabel}
        >
          <span className="relative">
            <MessageSquare className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
          <span className="hidden sm:inline">{buttonLabel}</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 z-50 flex h-[min(640px,100dvh)] w-full max-w-md flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl sm:bottom-4 sm:right-4 sm:rounded-2xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-lg bg-white/90 p-1.5 text-gray-500 shadow-sm hover:bg-gray-100"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col">
            {loading && !chatId ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Opening chat…
              </div>
            ) : (
              <>
                {peer?.role === "advisor" ? (
                  <p className="shrink-0 border-b border-gray-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                    Messages go to the itinerary owner&apos;s advisor account
                    {peer.name ? ` (${peer.name})` : ""}. They appear under{" "}
                    <strong>Messages → Pagoda Support</strong> and we email them when you write
                    (even if they are online elsewhere in Pagoda).
                  </p>
                ) : null}
                <ChatPanel
                  chatId={chatId}
                  currentUserId={currentUserId}
                  currentUserAvatar={null}
                  otherParticipant={
                    peer
                      ? { id: peer.id, name: peer.name, avatar: null }
                      : null
                  }
                  clientName={itineraryName}
                  peerRoleLabel={
                    peer?.role === "advisor" ? "Travel advisor" : "Pagoda team"
                  }
                  embedded
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
