"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useBootstrap } from '@/components/shared/bootstrap-context';

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/auth') ||
    pathname === '/guide/login' ||
    pathname === '/agent/login' ||
    pathname === '/admin/login'
  );
}

type UnreadContextValue = {
  total: number;
  perChat: Record<string, number>;
  refresh: () => Promise<void>;
  markRead: (chatId: string) => Promise<void>;
  markUnread: (chatId: string) => Promise<void>;
  shouldSkipAutoRead: (chatId: string) => boolean;
  clearSkipAutoRead: () => void;
};

const UnreadContext = createContext<UnreadContextValue | undefined>(undefined);

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootstrap = useBootstrap();
  const [perChat, setPerChat] = useState<Record<string, number>>({});
  const currentUserRef = useRef<string | null>(null);
  const lastReadAtRef = useRef<Record<string, string | null>>({}); // chatId -> last_read_at
  const userChatIdsRef = useRef<Set<string>>(new Set()); // Track which chats user participates in
  const mountedRef = useRef(true);
  const initialLoadRef = useRef(false);
  const updateQueueRef = useRef<Map<string, number>>(new Map()); // Batch updates
  const updateTimeoutRef = useRef<number | null>(null);
  const skipAutoReadChatIdRef = useRef<string | null>(null);

  // Calculate total from perChat using useMemo to avoid recalculation
  const total = useMemo(() => {
    return Object.values(perChat).reduce((sum, count) => sum + count, 0);
  }, [perChat]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { 
      mountedRef.current = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Batch state updates to reduce re-renders
  const flushUpdates = useCallback(() => {
    if (updateQueueRef.current.size === 0) return;
    
    setPerChat((prev) => {
      const updated = { ...prev };
      updateQueueRef.current.forEach((increment, chatId) => {
        updated[chatId] = (updated[chatId] || 0) + increment;
      });
      updateQueueRef.current.clear();
      return updated;
    });
    
    updateTimeoutRef.current = null;
  }, []);

  const queueUpdate = useCallback((chatId: string, increment: number) => {
    const current = updateQueueRef.current.get(chatId) || 0;
    updateQueueRef.current.set(chatId, current + increment);
    
    // Batch updates: flush after 100ms or immediately if queue is getting large
    if (updateTimeoutRef.current === null) {
      updateTimeoutRef.current = window.setTimeout(flushUpdates, 100);
    }
    if (updateQueueRef.current.size > 10) {
      // Flush immediately if queue is too large
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      flushUpdates();
    }
  }, [flushUpdates]);

  // Fetch initial unread counts and last_read_at values (only once)
  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      const res = await fetch('/api/chats/unread', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (json?.ok) {
        setPerChat((json.perChat || {}) as Record<string, number>);
        // Update last_read_at ref
        if (json.lastReadAt && typeof json.lastReadAt === 'object') {
          lastReadAtRef.current = json.lastReadAt as Record<string, string | null>;
          // Update user chat IDs
          userChatIdsRef.current = new Set(Object.keys(json.lastReadAt));
        }
      }
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
    }
  }, []);

  const markRead = useCallback(async (chatId: string) => {
    if (!chatId) return;
    
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST' });
      if (!res.ok) {
        console.error('Failed to mark chat as read:', res.status, res.statusText);
        return;
      }
      
      skipAutoReadChatIdRef.current = null;

      // Update local state immediately - set unread count to 0 for this chat
      setPerChat((prev) => {
        const updated = { ...prev, [chatId]: 0 };
        return updated;
      });
      
      // Update last_read_at ref
      lastReadAtRef.current[chatId] = new Date().toISOString();
    } catch (error) {
      console.error('Failed to mark chat as read:', error);
      // Don't update state if the request failed
    }
  }, []);

  const markUnread = useCallback(async (chatId: string) => {
    if (!chatId) return;

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/unread`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        console.error("Failed to mark chat as unread:", json?.error || res.statusText);
        return;
      }

      skipAutoReadChatIdRef.current = chatId;

      const unreadCount =
        typeof json.unreadCount === "number" ? json.unreadCount : 1;
      setPerChat((prev) => ({ ...prev, [chatId]: unreadCount }));
      lastReadAtRef.current[chatId] =
        typeof json.lastReadAt === "string" ? json.lastReadAt : null;
    } catch (error) {
      console.error("Failed to mark chat as unread:", error);
    }
  }, []);

  const shouldSkipAutoRead = useCallback((chatId: string) => {
    return skipAutoReadChatIdRef.current === chatId;
  }, []);

  const clearSkipAutoRead = useCallback(() => {
    skipAutoReadChatIdRef.current = null;
  }, []);

  // Initialize from bootstrap (no extra network request on first paint)
  const [userIdLoaded, setUserIdLoaded] = useState(false);
  useEffect(() => {
    if (!bootstrap.loaded) return;
    const uid = bootstrap.user?.id;
    if (!uid) {
      currentUserRef.current = null;
      setUserIdLoaded(false);
      setPerChat({});
      lastReadAtRef.current = {};
      userChatIdsRef.current = new Set();
      return;
    }

    currentUserRef.current = uid;
    setUserIdLoaded(true);

    const bUnread = bootstrap.unread;
    if (bUnread && typeof bUnread === 'object') {
      setPerChat((bUnread.perChat || {}) as Record<string, number>);
      if (bUnread.lastReadAt && typeof bUnread.lastReadAt === 'object') {
        lastReadAtRef.current = bUnread.lastReadAt as Record<string, string | null>;
      }
    }

    if (Array.isArray(bootstrap.chatIds) && bootstrap.chatIds.length) {
      userChatIdsRef.current = new Set(bootstrap.chatIds);
    } else if (bUnread?.lastReadAt) {
      userChatIdsRef.current = new Set(Object.keys(bUnread.lastReadAt));
    }
  }, [bootstrap.chatIds, bootstrap.loaded, bootstrap.unread, bootstrap.user?.id]);

  // Fallback fetch only on protected routes (never on login/auth pages).
  useEffect(() => {
    if (!bootstrap.loaded) return;
    if (isAuthRoute(pathname)) {
      initialLoadRef.current = false;
      return;
    }
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    if (!bootstrap.user?.id) {
      void refresh();
    }
  }, [bootstrap.loaded, bootstrap.user?.id, pathname, refresh]);

  // Real-time subscriptions (wait for user ID to be loaded)
  useEffect(() => {
    if (!userIdLoaded || !currentUserRef.current) return;

    const userId = currentUserRef.current;

    // Single optimized channel for both message and participant updates
    const channel = supabase
      .channel('unread:optimized')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          // Early exit checks (most common cases first)
          if (!mountedRef.current || !userId) return;
          
          const newMsg = payload.new as { chat_id?: string; sender_id?: string; created_at?: string };
          if (!newMsg?.chat_id || !newMsg?.sender_id || !newMsg?.created_at) return;
          
          const chatId = newMsg.chat_id as string;
          const senderId = newMsg.sender_id as string;
          
          // Fast path: ignore if not user's chat or from current user
          if (senderId === userId || !userChatIdsRef.current.has(chatId)) return;
          
          const createdAt = newMsg.created_at as string;
          const lastReadAt = lastReadAtRef.current[chatId];
          
          // Check if message is after last_read_at
          if (lastReadAt !== undefined && createdAt <= (lastReadAt || '1970-01-01T00:00:00Z')) {
            return; // Already read
          }
          
          // Queue update (batched)
          queueUpdate(chatId, 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current || !userId) return;
          
          const updated = payload.new as { chat_id?: string; last_read_at?: string | null };
          if (!updated?.chat_id) return;
          
          const chatId = updated.chat_id as string;
          const newLastReadAt = updated.last_read_at as string | null;
          
          // Update last_read_at ref
          lastReadAtRef.current[chatId] = newLastReadAt;
          
          // Set unread to 0 immediately (no batching needed for read status)
          setPerChat((prev) => {
            if (prev[chatId] === 0) return prev; // Already 0, no update needed
            return { ...prev, [chatId]: 0 };
          });
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        // Flush any pending updates
        flushUpdates();
      } catch (error) {
        console.error('Error removing channel:', error);
      }
    };
  }, [userIdLoaded, queueUpdate, flushUpdates]); // Run when user ID is loaded

  return (
    <UnreadContext.Provider value={{ total, perChat, refresh, markRead, markUnread, shouldSkipAutoRead, clearSkipAutoRead }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error('useUnread must be used within UnreadProvider');
  return ctx;
}
