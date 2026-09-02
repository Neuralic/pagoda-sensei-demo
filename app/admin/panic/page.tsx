"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Mail,
  MessageSquare,
  Search,
  Send,
  Trash2,
  UserIcon,
} from "lucide-react";
import { TicketWithMessages } from "@/app/types";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { BUCKETS } from "@/lib/buckets";
import Image from "next/image";
import AdminLayout from "@/components/admin_layout/admin-layout";
import ViewPanicModal from "@/components/view_user/view-panic-modal";
import toast from "react-hot-toast";

type StatusFilter = "all" | "unread" | "open" | "in_progress" | "solved";
type PeriodFilter = "all" | "weekly" | "monthly" | "yearly";

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function roleLabel(role?: string | null): string {
  if (!role) return "User";
  if (role === "agent") return "Advisor";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function statusMeta(ticket: TicketWithMessages): {
  label: string;
  className: string;
} {
  if (ticket.mark_solved || ticket.is_all_solved) {
    return {
      label: "Solved",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if ((ticket.total_messages ?? 0) <= 1) {
    return {
      label: "New",
      className: "bg-sky-50 text-sky-700 border-sky-200",
    };
  }
  return {
    label: "In progress",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  };
}

function Page() {
  const searchParams = useSearchParams();
  const highlightTicket = searchParams.get("ticket") || "";

  const [panicList, setPanicList] = useState<TicketWithMessages[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewModal, setViewModal] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<TicketWithMessages>();
  const [openReplyOnLoad, setOpenReplyOnLoad] = useState(false);

  const [solved, setSolved] = useState(0);
  const [openTicket, setOpenTicket] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [unread, setUnread] = useState(0);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);

  const openChat = useCallback((ticket?: TicketWithMessages, reply = true) => {
    if (!ticket) return;
    setOpenReplyOnLoad(reply);
    setTicketInfo(ticket);
    setViewModal(true);
  }, []);

  const deleteAlert = useCallback(async (ticket: TicketWithMessages) => {
    const id = ticket.ticket_id;
    if (!id) return;
    const who = ticket.sender_name || "this user";
    if (
      !window.confirm(
        `Delete this support alert from ${who}? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingTicketId(id);
    try {
      const res = await fetch("/api/panic", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete alert");
      }
      setPanicList((prev) => prev.filter((t) => t.ticket_id !== id));
      setTotal((n) => Math.max(0, n - 1));
      if (ticketInfo?.ticket_id === id) {
        setViewModal(false);
        setTicketInfo(undefined);
      }
      toast.success("Alert deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete alert");
    } finally {
      setDeletingTicketId(null);
    }
  }, [ticketInfo?.ticket_id]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!highlightTicket) return;

    async function openLinkedTicket() {
      try {
        const res = await fetch(
          `/api/panic?ticket=${encodeURIComponent(highlightTicket)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;

        const data: {
          ok: boolean;
          ticket?: TicketWithMessages;
          panicList?: TicketWithMessages[];
        } = await res.json();

        const ticket = data.ticket ?? data.panicList?.[0];
        if (!data.ok || !ticket) return;

        let signedProfileUrl: string | undefined;
        const path = ticket.sender_image;
        if (typeof path === "string" && path) {
          const [signed] = await getSignedUrls([
            { bucket: BUCKETS.avatars, path },
          ]);
          signedProfileUrl =
            signed?.signedUrl || signed?.publicUrl || undefined;
        }

        openChat({ ...ticket, signedProfileUrl }, true);
      } catch (e) {
        console.error("Failed to open linked alert", e);
      }
    }

    void openLinkedTicket();
  }, [highlightTicket, openChat]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("page", page.toString());
        params.append("perPage", perPage.toString());
        if (search) params.append("search", search);
        if (period !== "all") params.append("period", period);
        if (status !== "all") params.append("status", status);

        const resPanic = await fetch(`/api/panic?${params.toString()}`, {
          cache: "no-store",
        });
        if (!resPanic.ok) throw new Error("Failed to fetch panic list");

        const panicData: {
          ok: boolean;
          solved: number;
          open: number;
          in_progress: number;
          unread?: number;
          total: number;
          panicList?: TicketWithMessages[];
        } = await resPanic.json();

        if (!panicData.ok || !panicData.panicList) return;

        const panicListWithUrls = await Promise.all(
          panicData.panicList.map(async (ticket) => {
            const path = ticket.sender_image;
            if (typeof path === "string" && path) {
              const [signed] = await getSignedUrls([
                { bucket: BUCKETS.avatars, path },
              ]);
              return {
                ...ticket,
                signedProfileUrl:
                  signed?.signedUrl || signed?.publicUrl || undefined,
              };
            }
            return { ...ticket, signedProfileUrl: undefined };
          })
        );

        setSolved(panicData.solved);
        setOpenTicket(panicData.open);
        setInProgress(panicData.in_progress);
        setUnread(panicData.unread ?? 0);
        setPanicList(panicListWithUrls);
        setTotal(panicData.total || 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [count, page, perPage, search, period, status]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allCount = solved + openTicket + inProgress;

  const statusFilters: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    icon: React.ElementType;
    accent: string;
  }> = [
    {
      id: "all",
      label: "All alerts",
      count: allCount,
      icon: Inbox,
      accent: "border-gray-200 hover:border-gray-300",
    },
    {
      id: "unread",
      label: "Unread",
      count: unread,
      icon: Mail,
      accent: "border-red-200 hover:border-red-300",
    },
    {
      id: "open",
      label: "New",
      count: openTicket,
      icon: AlertTriangle,
      accent: "border-sky-200 hover:border-sky-300",
    },
    {
      id: "in_progress",
      label: "In progress",
      count: inProgress,
      icon: Clock,
      accent: "border-amber-200 hover:border-amber-300",
    },
    {
      id: "solved",
      label: "Solved",
      count: solved,
      icon: CheckCircle2,
      accent: "border-emerald-200 hover:border-emerald-300",
    },
  ];

  const emptyCopy =
    status === "unread"
      ? "No unread support alerts — nice work."
      : status === "solved"
        ? "No solved alerts in this view yet."
        : status === "in_progress"
          ? "Nothing currently in progress."
          : status === "open"
            ? "No new alerts waiting for a first reply."
            : "No support alerts found.";

  return (
    <>
      <AdminLayout>
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                Support Alerts
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Click any alert to open the conversation and reply directly to
                the advisor or guide.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name, email, or message…"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AA25]/40 focus:border-[#D4AA25] text-sm bg-white"
                />
              </div>
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value as PeriodFilter);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#D4AA25]/40"
              >
                <option value="all">All time</option>
                <option value="weekly">Past week</option>
                <option value="monthly">Past month</option>
                <option value="yearly">Past year</option>
              </select>
            </div>
          </div>

          {/* Status filter cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {statusFilters.map((item) => {
              const Icon = item.icon;
              const active = status === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStatus(item.id);
                    setPage(1);
                  }}
                  className={`text-left rounded-xl border bg-white px-4 py-4 transition-all ${
                    item.accent
                  } ${
                    active
                      ? "ring-2 ring-[#D4AA25] border-[#D4AA25] shadow-sm"
                      : "hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">
                        {item.count}
                      </p>
                    </div>
                    <span
                      className={`rounded-lg p-2 ${
                        item.id === "unread"
                          ? "bg-red-50 text-red-600"
                          : item.id === "solved"
                            ? "bg-emerald-50 text-emerald-600"
                            : item.id === "in_progress"
                              ? "bg-amber-50 text-amber-600"
                              : item.id === "open"
                                ? "bg-sky-50 text-sky-600"
                                : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 lg:px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/80">
              <p className="text-sm text-gray-600">
                {loading
                  ? "Loading alerts…"
                  : total === 0
                    ? "No matching alerts"
                    : `${total} alert${total === 1 ? "" : "s"}`}
              </p>
            </div>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-white">
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      From
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Message
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Updated
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!loading && panicList.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-16 text-center text-sm text-gray-500"
                      >
                        {emptyCopy}
                      </td>
                    </tr>
                  )}
                  {panicList.map((ticket) => {
                    const meta = statusMeta(ticket);
                    const highlighted =
                      highlightTicket &&
                      String(ticket.ticket_id) === highlightTicket;
                    return (
                      <tr
                        key={ticket.ticket_id}
                        onClick={() => openChat(ticket, true)}
                        className={`cursor-pointer transition-colors hover:bg-[#FBF8EE] ${
                          highlighted
                            ? "bg-amber-50"
                            : ticket.has_unread
                              ? "bg-red-50/40"
                              : "bg-white"
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
                              {ticket.signedProfileUrl ? (
                                <Image
                                  src={ticket.signedProfileUrl}
                                  alt={ticket.sender_name || "User"}
                                  width={40}
                                  height={40}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <UserIcon className="w-5 h-5 text-gray-500" />
                              )}
                              {ticket.has_unread ? (
                                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`text-sm truncate ${
                                    ticket.has_unread
                                      ? "font-semibold text-gray-900"
                                      : "font-medium text-gray-900"
                                  }`}
                                >
                                  {ticket.sender_name || "Unknown user"}
                                </p>
                                {ticket.has_unread &&
                                (ticket.unread_count ?? 0) > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {ticket.unread_count}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-gray-500 truncate">
                                {roleLabel(ticket.role)}
                                {ticket.sender_email
                                  ? ` · ${ticket.sender_email}`
                                  : ""}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {ticket.job_name || "General support"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-md">
                          <p
                            className={`text-sm line-clamp-2 ${
                              ticket.has_unread
                                ? "font-medium text-gray-900"
                                : "text-gray-600"
                            }`}
                          >
                            {ticket.last_message || "No message"}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatRelative(ticket.last_message_time)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div
                            className="inline-flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ticket.chat_id ? (
                              <Link
                                href={`/admin/conversations?chatId=${encodeURIComponent(ticket.chat_id)}`}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                                title="Open related conversation"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Board
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openChat(ticket, true)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#D4AA25] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c49b1f]"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Reply
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteAlert(ticket)}
                              disabled={deletingTicketId === ticket.ticket_id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50"
                              title="Delete this alert"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {deletingTicketId === ticket.ticket_id
                                ? "Deleting…"
                                : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {!loading && panicList.length === 0 && (
                <div className="px-4 py-12 text-center text-sm text-gray-500">
                  {emptyCopy}
                </div>
              )}
              {panicList.map((ticket) => {
                const meta = statusMeta(ticket);
                return (
                  <div
                    key={ticket.ticket_id}
                    className={`w-full text-left px-4 py-4 ${
                      ticket.has_unread ? "bg-red-50/40" : "bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openChat(ticket, true)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
                          {ticket.signedProfileUrl ? (
                            <Image
                              src={ticket.signedProfileUrl}
                              alt={ticket.sender_name || "User"}
                              width={40}
                              height={40}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserIcon className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {ticket.sender_name || "Unknown user"}
                            </p>
                            <span className="text-[11px] text-gray-400 shrink-0">
                              {formatRelative(ticket.last_message_time)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {roleLabel(ticket.role)}
                          </p>
                          <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                            {ticket.last_message || "No message"}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                            {ticket.has_unread ? (
                              <span className="text-[11px] font-semibold text-red-600">
                                Unread
                            </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void deleteAlert(ticket)}
                        disabled={deletingTicketId === ticket.ticket_id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingTicketId === ticket.ticket_id
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-xs lg:text-sm text-gray-600">
                {total === 0
                  ? "No alerts to show"
                  : `Showing ${(page - 1) * perPage + 1}–${Math.min(
                      page * perPage,
                      total
                    )} of ${total}`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1 || loading}
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>

      <ViewPanicModal
        isOpen={viewModal}
        onClose={(open) => {
          setViewModal(open);
          if (!open) setCount((c) => c + 1);
        }}
        onDeleted={(ticketId) => {
          setPanicList((prev) => prev.filter((t) => t.ticket_id !== ticketId));
          setTotal((n) => Math.max(0, n - 1));
          setTicketInfo(undefined);
        }}
        ticketInfo={ticketInfo}
        count={count}
        setCount={setCount}
        initialTab={openReplyOnLoad ? "response" : "overview"}
      />
    </>
  );
}

export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-muted-foreground">Loading alerts…</div>
      }
    >
      <Page />
    </Suspense>
  );
}
