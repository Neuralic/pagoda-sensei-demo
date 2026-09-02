"use client";

import { TicketWithMessages } from "@/app/types";
import { useUnread } from "@/components/chat/unread-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  Briefcase,
  Library,
  LogOut,
  MessageCircle,
  Settings,
  ShieldAlert,
  Star,
  User,
  UserSearch,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import Logo from "../../public/assets/images/pagodalogo.jpg";
import PanicAlert from "../panic/panic-alert";
import { AdvisorGuideReviewModal } from "@/components/reviews/advisor-guide-review-modal";
import { TimezoneConverter } from "./timezone-converter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface HeaderProps {
  user?: {
    id?: string;
    name: string;
    email: string;
    avatar?: string;
    role?: string;
    /** When false, agent/guide is pending admin approval — only profile/settings. */
    guideApproved?: boolean;
    isOperator?: boolean;
  };
}


export default function Header({ user }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [userPanic, setUserPanic] = useState<TicketWithMessages[]>([]);
  const [panicUnreadCount, setPanicUnreadCount] = useState(0);
  const [jobId, setJobId] = useState("");

  const [panicText, setPanicText] = useState(false);
  const { total: totalUnread, perChat } = useUnread();
  const [warningModal, setWarningModal] = useState<boolean>(false);
  const [panicResponse, setPanicResponse] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [pendingEndRequests, setPendingEndRequests] = useState(0);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const pendingActivity =
    (user?.role === "agent" || user?.role === "guide") && user?.guideApproved === false;
  const canUsePanic =
    !pendingActivity &&
    (user?.role === "agent" || user?.role === "guide" || user?.role === "agency");

  const loadUserPanic = async () => {
    try {
      if (user) {
        const res = await fetch(`/api/panic/user`, {
          cache: "no-store",
        });

        const data = await res.json();
        if (!data.ok || !data.allJobAlert) return;
        setUserPanic(data.allJobAlert);
        setPanicUnreadCount(
          typeof data.unreadCount === "number" ? data.unreadCount : 0
        );
      }
    } catch (error) {
      console.log("Error loading panic", error);
    }
  };

  const markPanicRead = async (ticketId?: string) => {
    try {
      await fetch("/api/panic/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ticketId ? { ticket_id: ticketId } : {}),
      });
      await loadUserPanic();
    } catch (error) {
      console.log("Error marking panic read", error);
    }
  };

  // Close dropdown when clicking outside; load panic + realtime unread
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    const channels: ReturnType<typeof supabase.channel>[] = [];

    if (canUsePanic && user?.id) {
      loadUserPanic();

      const panicInsert = supabase
        .channel(`header:panic:insert:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "panic",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => {
            void loadUserPanic();
          }
        )
        .subscribe();
      channels.push(panicInsert);

      const panicUpdate = supabase
        .channel(`header:panic:update:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "panic",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => {
            void loadUserPanic();
          }
        )
        .subscribe();
      channels.push(panicUpdate);

      // Fallback poll in case realtime is delayed
      const pollId = window.setInterval(() => {
        void loadUserPanic();
      }, 30000);

      // Load pending end requests for guides using real-time subscriptions
      if (user.role === "guide" && !pendingActivity) {
        const loadEndRequests = async () => {
          try {
            const res = await fetch("/api/jobs/end-request");
            const data = await res.json();
            if (data.ok && Array.isArray(data.requests)) {
              const pending = data.requests.filter((r: any) => r.status === "pending");
              setPendingEndRequests(pending.length);
            }
          } catch (error) {
            console.error("Error loading end requests:", error);
          }
        };

        loadEndRequests();

        const insertChannel = supabase
          .channel("header:end-requests:insert")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "job_end_requests",
              filter: `guide_id=eq.${user.id}`,
            },
            () => {
              loadEndRequests();
            }
          )
          .subscribe();
        channels.push(insertChannel);

        const updateChannel = supabase
          .channel("header:end-requests:update")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "job_end_requests",
              filter: `guide_id=eq.${user.id}`,
            },
            () => {
              loadEndRequests();
            }
          )
          .subscribe();
        channels.push(updateChannel);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.clearInterval(pollId);
        channels.forEach((ch) => supabase.removeChannel(ch));
      };
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [user, pendingActivity, canUsePanic]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors; still attempt redirect
    } finally {
      setIsProfileOpen(false);
      router.push("/agent/login");
    }
  };

  const sendPanicToAdmin = async () => {
    if (!user?.id) {
      toast.error("You must be logged in to send an alert.");
      return;
    }
    const message = composeMessage.trim();
    if (!message) {
      toast.error("Please enter a message.");
      return;
    }

    setComposeSending(true);
    try {
      const res = await fetch("/api/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: user.id,
          message,
          mark_solved: false,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to send alert");
      }

      toast.success("Alert sent! Pagoda admin has been notified.");
      setComposeMessage("");
      setComposeOpen(false);
      await loadUserPanic();

      if (typeof data.ticket_id === "string" && data.ticket_id) {
        setJobId(data.ticket_id);
        setWarningModal(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send alert");
    } finally {
      setComposeSending(false);
    }
  };

  const openExistingAlert = (ticketId: string) => {
    setJobId(ticketId);
    setComposeOpen(false);
    setWarningModal(true);
    void markPanicRead(ticketId);
  };
  // const markAllAsRead = async () => {
  //   try {
  //     const res = await fetch(`/api/panic/${user?.id}`, {
  //       method: "PUT",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //     });

  //     const data = await res.json();

  //     if (data.ok) {
  //       await loadUserPanic();
  //     } else {
  //       console.error("Failed to mark messages as read:", data.error);
  //     }
  //   } catch (err) {
  //     console.error("Error calling API:", err);
  //   }
  // };


  return (
    <>
      <header className="shrink-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between">
            {/* Logo - Responsive sizing */}
            <Link href="/" className="flex items-center space-x-2 flex-shrink-0">
              <Image
                src={Logo}
                alt="Pagoda.travel"
                className="h-7 w-auto sm:h-8 md:h-9 lg:h-10"
                priority
              />
            </Link>

            <div className="flex items-center gap-3 space-x-2 sm:space-x-2 lg:space-x-2">
              {!pendingActivity && user?.role === "guide" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/guide/landing")}
                  className="hidden sm:inline-flex border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10"
                >
                  <Briefcase className="h-4 w-4 mr-1.5" />
                  Jobs Board
                </Button>
              )}

              {/* Tour operators: team guides (available even while account is pending approval) */}
              {user?.role === "guide" && user?.isOperator && (
                <>
                  <Link
                    href="/guide/my-guides"
                    prefetch
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "hidden md:inline-flex border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10"
                    )}
                  >
                    <Users className="h-4 w-4 mr-1.5" />
                    My Guides
                  </Link>
                  <Link
                    href="/guide/tour-library"
                    prefetch
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "hidden md:inline-flex border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10"
                    )}
                  >
                    <Library className="h-4 w-4 mr-1.5" />
                    Tour Library
                  </Link>
                </>
              )}

              {/* Tour Library + Timezone — agents (Tour Library also on itineraries next to New Itinerary) */}
              {!pendingActivity && user?.role === "agent" && (
                <>
                  <Link
                    href="/agent/tour-library"
                    prefetch
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "hidden sm:inline-flex border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10"
                    )}
                  >
                    <Library className="h-4 w-4 mr-1.5" />
                    Tour Library
                  </Link>
                  <TimezoneConverter />
                </>
              )}

              {!pendingActivity && user?.role === "agent" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/agent/find-guide")}
                  className="hidden sm:inline-flex border-[#D4AA25] text-[#D4AA25] hover:bg-[#D4AA25]/10"
                >
                  <UserSearch className="h-4 w-4 mr-1.5" />
                  Find a guide
                </Button>
              )}

              {/* Reviews Icon - Only for Agents */}
              {!pendingActivity && user?.role === "agent" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setReviewModalOpen(true)}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                  title="Leave a guide review"
                >
                  <Star className="h-8 w-8 sm:h-5 sm:w-5 text-gray-600" />
                </Button>
              )}

              {/* Job End Request Notification Badge - For Guides */}
              {!pendingActivity && user?.role === "guide" && pendingEndRequests > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/guide/landing")}
                  className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-orange-100 hover:bg-orange-200 transition-colors"
                  title={`${pendingEndRequests} pending job termination request${pendingEndRequests > 1 ? 's' : ''}`}
                >
                  <Bell className="h-8 w-8 sm:h-5 sm:w-5 text-orange-600" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] sm:text-xs font-medium text-white">
                    {pendingEndRequests > 9 ? '9+' : pendingEndRequests}
                  </span>
                </Button>
              )}

              {!pendingActivity && (
                <>
                  {/* Chat Icon */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const conversationPath = user?.role === "guide" ? "/guide/conversation" : "/agent/conversation";

                      // If there are unread messages, navigate to the most recent one
                      if (totalUnread > 0 && perChat && Object.keys(perChat).length > 0) {
                        // Find the chat with the most recent unread message
                        try {
                          const chatsRes = await fetch("/api/chats", { cache: 'no-store' });
                          const chatsJson = await chatsRes.json().catch(() => ({}));

                          if (chatsJson?.ok && Array.isArray(chatsJson.chats)) {
                            // Filter chats with unread messages and sort by most recent
                            const unreadChats = chatsJson.chats
                              .filter((chat: any) => {
                                const chatId = chat.chatId || chat.id;
                                return perChat[chatId] && perChat[chatId] > 0;
                              })
                              .sort((a: any, b: any) => {
                                const aTime = a.createdAt || '';
                                const bTime = b.createdAt || '';
                                return bTime.localeCompare(aTime);
                              });

                            if (unreadChats.length > 0) {
                              const mostRecentChatId = unreadChats[0].chatId || unreadChats[0].id;
                              router.push(`${conversationPath}?chatId=${encodeURIComponent(mostRecentChatId)}`);
                              return;
                            }
                          }
                        } catch (error) {
                          console.error("Error fetching chats:", error);
                        }
                      }

                      // Fallback to conversation page without specific chat
                      router.push(conversationPath);
                    }}
                    className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <MessageCircle className="h-8 w-8 sm:h-5 sm:w-5 text-gray-600" />
                    {totalUnread > 0 ? (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-yellow-500 text-[10px] sm:text-xs font-medium text-black">
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </span>
                    ) : null}
                  </Button>
                  {/* Panic button — advisors & guides */}
                  {canUsePanic && (
                    <Button
                      variant="ghost"
                      className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 bg-red-600 hover:bg-red-700 transition-colors cursor-pointer shadow-sm"
                      onClick={() => {
                        setComposeMessage("");
                        setComposeOpen(true);
                      }}
                      title="Panic — contact Pagoda admin"
                      aria-label="Panic button — contact admin"
                    >
                      <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                      {panicUnreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-white text-[10px] sm:text-xs font-bold text-red-600 ring-2 ring-red-600">
                          {panicUnreadCount > 99 ? "99+" : panicUnreadCount}
                        </span>
                      ) : null}
                    </Button>
                  )}
                </>
              )}

              {/* Profile Dropdown */}
              <div className="relative" ref={profileRef}>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                >
                  {user?.avatar ? (
                    <Image
                      src={user.avatar}
                      alt="Profile"
                      width={32}
                      height={32}
                      className="rounded-full h-8 w-8 sm:h-9 sm:w-9"
                    />
                  ) : (
                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#D4AA25] to-[#b78916]">
                      <span className="text-xs sm:text-sm font-medium text-white">
                        {user?.name?.charAt(0).toUpperCase() || "U"}
                      </span>
                    </div>
                  )}
                </Button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 top-12 z-50 w-56 sm:w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                    {/* User Info */}
                    <div className="border-b border-gray-100 px-3 sm:px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user?.name || "User Name"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user?.email || "user@example.com"}
                      </p>
                    </div>

                    {/* Dropdown Items */}
                    <div className="py-2">
                      {user?.role === "agent" && (
                        <>
                          <Link
                            href="/agent/tour-library"
                            className="flex items-center px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors sm:hidden"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            <Library className="mr-3 h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">Tour Library</span>
                          </Link>
                          <Link
                            href="/agent/profile"
                            className="flex items-center px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            <User className="mr-3 h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">Public Profile</span>
                          </Link>
                        </>
                      )}

                      {user?.role === "guide" && user?.isOperator && (
                        <>
                          <Link
                            href="/guide/tour-library"
                            className="flex items-center px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors md:hidden"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            <Library className="mr-3 h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">Tour Library</span>
                          </Link>
                          <Link
                            href="/guide/my-guides"
                            className="flex items-center px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors md:hidden"
                            onClick={() => setIsProfileOpen(false)}
                          >
                            <Users className="mr-3 h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">My Guides</span>
                          </Link>
                        </>
                      )}

                      <Link
                        href={user?.role === "agent" ? "/agent/settings" : "/settings"}
                        className="flex items-center px-3 sm:px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <Settings className="mr-3 h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">Account Settings</span>
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="flex w-full cursor-pointer items-center px-3 sm:px-4 py-2 text-sm text-red-600 hover:bg-gray-50 transition-colors"
                      >
                        <LogOut className="mr-3 h-4 w-4 text-red-400 flex-shrink-0" />
                        <span className="truncate">Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </header>

      {/* Advisor leave-a-guide-review */}
      <AdvisorGuideReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
      />

      {/* Panic compose — message admin */}
      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          if (composeSending) return;
          setComposeOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
              Contact Pagoda Admin
            </DialogTitle>
            <DialogDescription>
              Send an urgent message to the Pagoda admin team. They will be notified by email.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={composeMessage}
            onChange={(e) => setComposeMessage(e.target.value)}
            placeholder="Describe what you need help with…"
            rows={4}
            disabled={composeSending}
            className="resize-none mb-4"
          />

          {userPanic.length > 0 ? (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Recent alerts
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-md border border-border p-1">
                {userPanic.slice(0, 5).map((ticket) => (
                  <button
                    key={ticket.ticket_id}
                    type="button"
                    onClick={() => openExistingAlert(ticket.ticket_id)}
                    className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
                  >
                    <span className="block text-sm font-medium text-foreground truncate">
                      {ticket.job_name || "Support thread"}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {ticket.message || "No messages yet"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={composeSending}
              onClick={() => setComposeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={composeSending || !composeMessage.trim()}
              onClick={() => void sendPanicToAdmin()}
            >
              {composeSending ? "Sending…" : "Send to admin"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Panic alert thread */}
      <PanicAlert
        isOpen={warningModal}
        title="Assistance Required"
        onCancel={() => setWarningModal(false)}
        panicResponse={panicResponse}
        setPanicResponse={setPanicResponse}
        userPanic={userPanic}
        panicText={panicText}
        setPanicText={setPanicText}
        jobId={jobId}
        userId={user?.id}
      />
    </>
  );
}
