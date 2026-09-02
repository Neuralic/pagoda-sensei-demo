"use client";

import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import Logo from "../../public/assets/images/pagodalogo.jpg";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  SquareCheck,
  Shield,
  LogOut,
  User,
  MapPin,
  ReceiptText,
  ClipboardList,
  MessageSquare,
  AlertTriangle,
  UserCheck,
  Briefcase,
  ScrollText,
} from "lucide-react";
import { LayoutDashboard, Users, Percent } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  type: "panic" | "approval" | "job";
  title: string;
  body: string;
  href: string;
  created_at: string | null;
  ticket_id?: string;
};

type NotificationSummary = {
  total: number;
  unreadPanic: number;
  pendingApprovals: number;
  jobsNeedingAttention: number;
  items: NotificationItem[];
};

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
}

function typeIcon(type: NotificationItem["type"]) {
  if (type === "panic") return AlertTriangle;
  if (type === "approval") return UserCheck;
  return Briefcase;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationSummary>({
    total: 0,
    unreadPanic: 0,
    pendingApprovals: 0,
    jobsNeedingAttention: 0,
    items: [],
  });
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  /** Set when this tab's cookies no longer belong to an admin — see the 401/403 branch below. */
  const [sessionChangedElsewhere, setSessionChangedElsewhere] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      // Overall access swaps the session cookies for the whole browser, so an admin tab left
      // open in the background starts polling as the advisor and 403s every minute. Production
      // logs for 27 Aug show 183 of these across 76 minutes, entirely silent. Stop, and say why.
      if (res.status === 401 || res.status === 403) {
        setSessionChangedElsewhere(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) return;
      setNotifications({
        total: typeof data.total === "number" ? data.total : 0,
        unreadPanic: typeof data.unreadPanic === "number" ? data.unreadPanic : 0,
        pendingApprovals:
          typeof data.pendingApprovals === "number" ? data.pendingApprovals : 0,
        jobsNeedingAttention:
          typeof data.jobsNeedingAttention === "number"
            ? data.jobsNeedingAttention
            : 0,
        items: Array.isArray(data.items) ? data.items : [],
      });
    } catch (e) {
      console.error("Failed to load admin notifications", e);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || sessionChangedElsewhere) return;
    void loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    const channel = supabase
      .channel("admin:notifications:panic")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "panic" },
        () => {
          void loadNotifications();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [mounted, loadNotifications, sessionChangedElsewhere]);

  // Refresh when navigating between admin pages
  useEffect(() => {
    if (!mounted) return;
    void loadNotifications();
  }, [pathname, mounted, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!mounted) return null;

  const handleLogout = async () => {
    try {
      const loadingToast = toast.loading("Logging out...");
      await fetch("/api/auth/logout", { method: "POST" });
      toast.dismiss(loadingToast);
      toast.success("Logged out successfully");
      router.push("/admin/login");
    } catch {
      toast.error("Error during logout, redirecting...");
      router.push("/admin/login");
    } finally {
      setIsProfileOpen(false);
    }
  };

  const badgeCount = notifications.total;
  const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

  const menu = [
    {
      name: "Dashboard",
      href: "/admin/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "User Management",
      href: "/admin/user",
      icon: Users,
      badge: notifications.pendingApprovals,
    },
    {
      name: "Administrators",
      href: "/admin/admins",
      icon: Shield,
    },
    {
      name: "Security log",
      href: "/admin/security",
      icon: ScrollText,
    },
    {
      name: "Alerts",
      href: "/admin/panic",
      icon: AlertTriangle,
      badge: notifications.unreadPanic,
    },
    {
      name: "Job Management",
      href: "/admin/jobs",
      icon: SquareCheck,
      badge: notifications.jobsNeedingAttention,
    },
    {
      name: "All Itineraries",
      href: "/admin/itineraries",
      icon: ClipboardList,
    },
    {
      name: "Conversations",
      href: "/admin/conversations",
      icon: MessageSquare,
    },
    {
      name: "Tour Management",
      href: "/admin/tours",
      icon: MapPin,
    },
    {
      name: "Commission Settings",
      href: "/admin/commission-settings",
      icon: Percent,
    },
    {
      name: "Transfer Invoices",
      href: "/admin/invoice-transfers",
      icon: ReceiptText,
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {sessionChangedElsewhere && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-6 py-2.5 text-sm text-amber-950">
          This tab is no longer signed in as an admin — you opened another account elsewhere in
          this browser. Admin data here is out of date.{" "}
          <button
            type="button"
            onClick={() => window.location.assign("/admin/dashboard")}
            className="font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Reload as admin
          </button>
        </div>
      )}
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div>
                <Image
                  src={Logo}
                  alt="Pagoda.travel"
                  className="h-7 w-auto sm:h-8 md:h-9 lg:h-10"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen((v) => !v);
                  setIsProfileOpen(false);
                  void loadNotifications();
                }}
                className="relative p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                {badgeCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                    {badgeLabel}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Notifications
                      </p>
                      <p className="text-xs text-gray-500">
                        {badgeCount > 0
                          ? `${badgeCount} item${badgeCount === 1 ? "" : "s"} need attention`
                          : "You're all caught up"}
                      </p>
                    </div>
                    {notifications.unreadPanic > 0 && (
                      <button
                        type="button"
                        className="text-xs text-[#af8a10] hover:underline"
                        onClick={async () => {
                          await fetch("/api/admin/notifications", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ mark_all: true }),
                          });
                          void loadNotifications();
                        }}
                      >
                        Mark alerts read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.items.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-500">
                        No new notifications
                      </div>
                    ) : (
                      notifications.items.map((item) => {
                        const Icon = typeIcon(item.type);
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={() => {
                              setIsNotifOpen(false);
                              if (item.type === "panic" && item.ticket_id) {
                                void fetch("/api/admin/notifications", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    ticket_id: item.ticket_id,
                                  }),
                                }).then(() => loadNotifications());
                              }
                            }}
                            className="flex gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            <div
                              className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                item.type === "panic"
                                  ? "bg-[#FFECE7] text-[#AC434A]"
                                  : item.type === "approval"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-gray-600 line-clamp-2">
                                {item.body}
                              </p>
                              {item.created_at && (
                                <p className="text-[11px] text-gray-400 mt-1">
                                  {formatWhen(item.created_at)}
                                </p>
                              )}
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>

                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex gap-3 text-xs">
                    <Link
                      href="/admin/panic"
                      className="text-[#af8a10] hover:underline"
                      onClick={() => setIsNotifOpen(false)}
                    >
                      All alerts
                    </Link>
                    <Link
                      href="/admin/conversations"
                      className="text-gray-600 hover:underline"
                      onClick={() => setIsNotifOpen(false)}
                    >
                      Conversations
                    </Link>
                    <Link
                      href="/admin/user?approvalStatus=pending"
                      className="text-gray-600 hover:underline"
                      onClick={() => setIsNotifOpen(false)}
                    >
                      Pending users
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotifOpen(false);
                }}
                className="w-10 h-10 bg-linear-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-semibold hover:opacity-90 transition-opacity"
              >
                <User className="w-5 h-5" />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      Admin Account
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      System Administrator
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto overflow-x-hidden p-6">
          <div className="mb-8 shrink-0">
            <h2 className="text-2xl font-bold text-gray-900">Admin</h2>
            <p className="text-sm text-gray-500">Control Center</p>
          </div>

          <nav className="space-y-2 min-w-0">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              const badge =
                typeof item.badge === "number" && item.badge > 0
                  ? item.badge
                  : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium flex-1 truncate">{item.name}</span>
                  {badge > 0 && (
                    <span
                      className={`min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
                        item.href === "/admin/panic"
                          ? "bg-[#AC434A]"
                          : "bg-red-500"
                      }`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
