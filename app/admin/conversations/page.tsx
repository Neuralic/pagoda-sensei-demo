"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Search, MessageSquare, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ChatRow = {
  id: string;
  job_id: string | null;
  client_name: string | null;
  created_at: string;
  agency: { id: string; name: string; email: string | null; role: string | null } | null;
  guide: { id: string; name: string; email: string | null; role: string | null } | null;
  last_message: string;
  last_message_at: string;
};

type ChatMessage = {
  id: string;
  sender_name: string;
  message: string;
  created_at: string;
  is_deleted?: boolean;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AdminConversationsInner() {
  const searchParams = useSearchParams();
  const filterUserId = searchParams.get("userId") || "";
  const deepLinkChatId = searchParams.get("chatId") || "";

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatMeta, setChatMeta] = useState<{
    agency?: { name: string } | null;
    guide?: { name: string } | null;
    client_name?: string | null;
  } | null>(null);

  const perPage = 20;

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        search,
      });
      if (filterUserId) params.set("userId", filterUserId);

      const res = await fetch(`/api/admin/chats?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setChats(data.chats ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filterUserId, page, search]);

  const openChat = useCallback(async (chatId: string) => {
    setSelectedChatId(chatId);
    setMessagesLoading(true);
    setMessages([]);
    setChatMeta(null);
    try {
      const res = await fetch(`/api/admin/chats/${chatId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages ?? []);
        setChatMeta(data.chat ?? null);
      }
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!deepLinkChatId) return;
    void openChat(deepLinkChatId);
  }, [deepLinkChatId, openChat]);

  useEffect(() => {
    setPage(1);
  }, [search, filterUserId]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Conversations</h1>
          <p className="text-gray-600 mt-1">
            View all advisor and guide message board threads on the platform.
          </p>
          {filterUserId && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
              Filtered by user
              <Link href="/admin/conversations" className="text-[#af8a10] hover:underline">
                Clear
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="search"
                    placeholder="Search by name, email, or message…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#af8a10]/30"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading conversations…
                </div>
              ) : chats.length === 0 ? (
                <div className="py-16 text-center text-gray-500">No conversations found.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {chats.map((chat) => (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => void openChat(chat.id)}
                        className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors ${
                          selectedChatId === chat.id ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0 text-gray-400">
                            <MessageSquare className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium text-gray-900 truncate">
                                {chat.agency?.name ?? "Advisor"} ↔ {chat.guide?.name ?? "Guide"}
                              </span>
                              {chat.client_name && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                  {chat.client_name}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {chat.last_message || "No messages yet"}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatWhen(chat.last_message_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedChatId && (
            <div className="w-full lg:w-[420px] shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col max-h-[70vh] lg:sticky lg:top-24">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {chatMeta?.agency?.name} ↔ {chatMeta?.guide?.name}
                    </p>
                    {chatMeta?.client_name && (
                      <p className="text-xs text-gray-500">Client: {chatMeta.client_name}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedChatId(null)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messagesLoading ? (
                    <div className="flex justify-center py-8 text-gray-500 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No messages.</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="text-sm">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-gray-900">{msg.sender_name}</span>
                          <span className="text-xs text-gray-400">
                            {formatWhen(msg.created_at)}
                          </span>
                        </div>
                        <p
                          className={`mt-0.5 text-gray-700 whitespace-pre-wrap break-words ${
                            msg.is_deleted ? "italic text-gray-400" : ""
                          }`}
                        >
                          {msg.message || "(empty)"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default function AdminConversationsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
            Loading…
          </div>
        </AdminLayout>
      }
    >
      <AdminConversationsInner />
    </Suspense>
  );
}
