"use client";

import React, { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/dialog";
import { CheckCircle2, ChevronDown, Send, Trash2, UserIcon, X } from "lucide-react";
import toast from "react-hot-toast";
import { TicketWithMessages } from "@/app/types";
import Image from "next/image";
import { Button } from "../ui/button";

interface PanicModalProps {
  isOpen: boolean;
  onClose: (value: boolean) => void;
  ticketInfo: TicketWithMessages | undefined;
  setCount: (value: number) => void;
  count: number;
  initialTab?: "overview" | "response" | "resolution";
  onDeleted?: (ticketId: string) => void;
}

type ThreadMessage = {
  id?: string | number;
  ticket_id?: string;
  sender_id?: string | null;
  sender_name?: string | null;
  message?: string | null;
  created_at?: string | null;
};

const ViewPanicModal = ({
  isOpen,
  onClose,
  ticketInfo,
  setCount,
  count,
  initialTab = "response",
  onDeleted,
}: PanicModalProps) => {
  const [panicResponse, setPanicResponse] = useState("");
  const [sending, setSending] = useState(false);
  const [userPanic, setUserPanic] = useState<ThreadMessage[]>([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activityOpen, setActivityOpen] = useState(false);
  const [localSolved, setLocalSolved] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { id: "response" as const, label: "Conversation" },
    { id: "overview" as const, label: "Details" },
    { id: "resolution" as const, label: "Status" },
  ];
  const activityTypes = ["Solved", "In progress"];

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setPanicResponse("");
      setLocalSolved(
        Boolean(ticketInfo?.mark_solved || ticketInfo?.is_all_solved)
      );
    }
  }, [isOpen, initialTab, ticketInfo?.ticket_id, ticketInfo?.mark_solved, ticketInfo?.is_all_solved]);

  useEffect(() => {
    if (!isOpen || !ticketInfo?.ticket_id) return;
    void fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketInfo.ticket_id }),
    }).catch(() => {
      /* ignore */
    });
  }, [isOpen, ticketInfo?.ticket_id]);

  const loadUserPanic = async () => {
    try {
      if (!ticketInfo?.sender_id || !ticketInfo?.ticket_id) return;
      setLoadingThread(true);
      const res = await fetch(
        `/api/panic/${ticketInfo.sender_id}?job_id=${ticketInfo.ticket_id}`,
        { cache: "no-store" }
      );
      const data: { ok: boolean; panicList?: ThreadMessage[] } = await res.json();
      if (!data.ok || !data.panicList) return;
      setUserPanic(data.panicList);
    } catch (error) {
      console.error("Error loading panic", error);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadUserPanic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ticketInfo?.ticket_id]);

  useEffect(() => {
    if (activeTab === "response") {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [userPanic, activeTab, isOpen]);

  const handleSend = async () => {
    const message = panicResponse.trim();
    if (!message || !ticketInfo?.ticket_id || !ticketInfo?.sender_id) {
      toast.error("Please enter a reply.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketInfo.ticket_id,
          receiver_id: ticketInfo.sender_id,
          message,
          mark_solved: false,
        }),
      });

      if (res.ok) {
        toast.success("Reply sent");
        await loadUserPanic();
        setPanicResponse("");
        setCount(count + 1);
      } else {
        toast.error("Failed to send reply. Please try again.");
      }
    } catch {
      toast.error("Something went wrong while sending.");
    } finally {
      setSending(false);
    }
  };

  const handleSetStatus = async (markSolved: boolean) => {
    if (!ticketInfo?.ticket_id) {
      toast.error("Missing alert id");
      return;
    }
    if (localSolved === markSolved) return;

    setStatusSaving(true);
    try {
      const response = await fetch("/api/panic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketInfo.ticket_id,
          mark_solved: markSolved,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "Something went wrong!");
        return;
      }
      setLocalSolved(Boolean(result.mark_solved));
      toast.success(
        result.mark_solved ? "Marked as solved" : "Marked as in progress"
      );
      setCount(count + 1);
    } catch (err) {
      console.error("API error:", err);
      toast.error("Failed to update alert status");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleDelete = async () => {
    const ticketId = ticketInfo?.ticket_id;
    if (!ticketId || deleting) return;
    if (
      !window.confirm(
        "Delete this support alert? This cannot be undone."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/panic", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete alert");
      }
      toast.success("Alert deleted");
      onDeleted?.(ticketId);
      onClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete alert");
    } finally {
      setDeleting(false);
    }
  };

  const initials = (ticketInfo?.sender_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const solved = localSolved;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {isOpen ? (
        <div className="fixed inset-0 z-[500]">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden
            onClick={() => onClose(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F3E9C8] text-[#8A7010] flex items-center justify-center text-sm font-semibold shrink-0">
                {ticketInfo?.signedProfileUrl ? (
                  <Image
                    src={ticketInfo.signedProfileUrl}
                    alt={ticketInfo?.sender_name || "User"}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {ticketInfo?.sender_name || "Unknown user"}
                </h2>
                <p className="text-sm text-gray-500 truncate capitalize">
                  {ticketInfo?.role || "user"}
                  {ticketInfo?.sender_email
                    ? ` · ${ticketInfo.sender_email}`
                    : ""}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {ticketInfo?.job_name || "General support request"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onClose(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-5 border-b border-gray-100 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AA25]" />
                )}
              </button>
            ))}
          </div>

          {/* Content — only one scroll region at a time */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === "overview" && (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Contact
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Name</dt>
                      <dd className="text-gray-900 text-right">
                        {ticketInfo?.sender_name || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Email</dt>
                      <dd className="text-gray-900 text-right break-all">
                        {ticketInfo?.sender_email || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Phone</dt>
                      <dd className="text-gray-900 text-right">
                        {ticketInfo?.sender_phone || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Role</dt>
                      <dd className="text-gray-900 text-right capitalize">
                        {ticketInfo?.role || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Context
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Tour / job</dt>
                      <dd className="text-gray-900 text-right">
                        {ticketInfo?.job_name || "General support"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Location</dt>
                      <dd className="text-gray-900 text-right">
                        {ticketInfo?.job_location || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-[#F0D0CB] bg-[#FFF7F5] p-4">
                  <h3 className="text-sm font-semibold text-[#AC434A] mb-2">
                    Latest message
                  </h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {ticketInfo?.last_message || "No message"}
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full bg-[#D4AA25] hover:bg-[#c49b1f] text-white"
                  onClick={() => setActiveTab("response")}
                >
                  Open conversation
                </Button>
              </div>
            )}

            {activeTab === "response" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  {loadingThread && userPanic.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      Loading conversation…
                    </p>
                  ) : null}
                  {!loadingThread && userPanic.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      No messages in this thread yet.
                    </p>
                  ) : null}
                  {userPanic.map((alert, index) => {
                    const isAdmin = alert.sender_id !== ticketInfo?.sender_id;
                    return (
                      <div
                        key={`${alert.id ?? index}-${alert.created_at}`}
                        className={`flex gap-2.5 ${
                          isAdmin ? "flex-row-reverse" : ""
                        }`}
                      >
                        <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                          {!isAdmin && ticketInfo?.signedProfileUrl ? (
                            <Image
                              src={ticketInfo.signedProfileUrl}
                              alt=""
                              width={32}
                              height={32}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserIcon className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                        <div
                          className={`max-w-[80%] ${
                            isAdmin ? "items-end" : "items-start"
                          } flex flex-col`}
                        >
                          <div
                            className={`flex items-center gap-2 mb-1 ${
                              isAdmin ? "flex-row-reverse" : ""
                            }`}
                          >
                            <span className="text-xs font-medium text-gray-700">
                              {isAdmin
                                ? "You"
                                : alert.sender_name ||
                                  ticketInfo?.sender_name ||
                                  "User"}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {alert.created_at
                                ? new Date(alert.created_at).toLocaleString()
                                : ""}
                            </span>
                          </div>
                          <div
                            className={`text-sm rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap ${
                              isAdmin
                                ? "bg-[#F7EFCF] text-gray-900 rounded-tr-md"
                                : "bg-gray-100 text-gray-900 rounded-tl-md"
                            }`}
                          >
                            {alert.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div className="shrink-0 border-t border-gray-100 p-4 bg-white">
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={panicResponse}
                      onChange={(e) => setPanicResponse(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder={`Reply to ${ticketInfo?.sender_name || "them"}…`}
                      rows={3}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AA25]/40 focus:border-[#D4AA25] resize-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={sending || !panicResponse.trim()}
                      className="shrink-0 p-3 bg-[#D4AA25] hover:bg-[#c49b1f] disabled:opacity-50 text-white rounded-xl transition-colors"
                      aria-label="Send reply"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Press Enter to send · Shift+Enter for a new line
                  </p>
                </div>
              </div>
            )}

            {activeTab === "resolution" && (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Alert status
                  </h3>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActivityOpen(!activityOpen)}
                      disabled={statusSaving}
                      className="w-full justify-between border-input h-10"
                    >
                      {solved ? "Solved" : "In progress"}
                      <ChevronDown
                        className={`ml-2 h-4 w-4 transition-transform ${
                          activityOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                    {activityOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                        {activityTypes.map((activity) => {
                          const nextSolved = activity === "Solved";
                          return (
                            <button
                              key={activity}
                              type="button"
                              disabled={statusSaving}
                              onClick={() => {
                                setActivityOpen(false);
                                void handleSetStatus(nextSolved);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50 ${
                                solved === nextSolved
                                  ? "bg-gray-50 font-medium"
                                  : ""
                              }`}
                            >
                              {activity}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`rounded-xl border-l-4 p-4 ${
                    solved
                      ? "border-l-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-l-amber-500 bg-amber-50 text-amber-800"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-1">
                        {solved ? "Solved" : "In progress"}
                      </h3>
                      <p className="text-sm opacity-90">
                        {solved
                          ? "This alert is marked as resolved. You can still reopen it if needed."
                          : "Keep the conversation going until the issue is resolved, then mark it solved."}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting || !ticketInfo?.ticket_id}
                  onClick={() => void handleDelete()}
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? "Deleting…" : "Delete this alert"}
                </Button>
              </div>
            )}
          </div>
          </aside>
        </div>
      ) : null}
    </Dialog>
  );
};

export default ViewPanicModal;
