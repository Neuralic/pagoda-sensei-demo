"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Paperclip, Search, Calendar, ChevronUp, ChevronDown, X, Edit, Trash2, Check, X as XIcon, MoreVertical, Image as ImageIcon, File, Download, ZoomIn, Smile, SmilePlus, Mail, Bell, Shield } from "lucide-react";
import Image from "next/image";
import SendIcon from "../../public/assets/icons/send_icon.svg";
import { supabase } from "@/lib/supabase";
import { uploadViaApi } from "@/lib/upload-client";
import { BUCKETS } from "@/lib/buckets";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { formatMessageTime, formatMessageDate } from "@/lib/timezone-utils";
import { useUnread } from "@/components/chat/unread-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
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
import { MessageBoardPolicyBanner } from "@/components/chat/message-board-policy-banner";
import { maskSensitiveChatContent } from "@/lib/chat-message-sanitize";
import { Textarea } from "@/components/ui/textarea";
import { useBootstrap } from "@/components/shared/bootstrap-context";
import toast from "react-hot-toast";


interface Message {
  id: string;
  sender_id: string;
  sender: string;
  avatar: string;
  message: string;
  timestamp: string;
  date: string; // Full date for grouping
  created_at: string; // ISO string for date navigation
  isOwn?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  message_type?: string;
  file_path?: string | null;
  file_url?: string | null;
  reactions?: Record<string, string[]>; // { emoji: [userIds] }
  /** app | whatsapp — set when message was composed inside Pagoda vs ingested from WhatsApp */
  source_channel?: string;
}

interface ChatPanelProps {
  chatId: string | null;
  currentUserId: string | null;
  currentUserAvatar: string | null;
  otherParticipant: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  /** When set, this chat is for a specific client/travel order; show in header */
  clientName?: string | null;
  /** Shown under the peer name (e.g. "Travel agent" on the guide conversation page) */
  peerRoleLabel?: string | null;
  /** When provided, show "New chat for client" button in header */
  onStartClientChat?: () => void;
  /** Compact layout for itinerary floating chat (hides alert / heavy chrome) */
  embedded?: boolean;
}

export function ChatPanel({ chatId, currentUserId, currentUserAvatar, otherParticipant, clientName, peerRoleLabel, onStartClientChat, embedded = false }: ChatPanelProps) {
  // Messages written during admin overall access are attributed to Pagoda, not to the account
  // holder — the composer says so before anything is sent.
  const { impersonation } = useBootstrap();

  // Detect and store user's timezone (client-side only, following industry standard)
  // Store UTC timestamps, display in viewer's local timezone
  const [userTimezone, setUserTimezone] = useState<string>('UTC');

  // Get current timezone function - always gets fresh timezone (client-side only)
  const getCurrentTimezone = useCallback((): string => {
    if (typeof window === 'undefined') {
      return 'UTC';
    }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz || 'UTC';
    } catch (error) {
      console.error('[ChatPanel] Error in getCurrentTimezone:', error);
      return 'UTC';
    }
  }, []);

  // Detect timezone immediately on client-side mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    
    const tz = getCurrentTimezone();
    const offset = -new Date().getTimezoneOffset() / 60;
    
    if (tz && tz !== 'UTC') {
      setUserTimezone(tz);
    } else {
    }
  }, [getCurrentTimezone]); // Run once on mount
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const { markRead, markUnread, shouldSkipAutoRead, clearSkipAutoRead } = useUnread();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [jumpToDate, setJumpToDate] = useState<string>("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState<string>("");
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dateRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastSentTypingRef = useRef<boolean | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertSending, setAlertSending] = useState(false);


  // Turn URLs in plain text into clickable links; style masked contact/price segments
  const renderMessageWithLinks = (text: string): ReactNode => {
    if (!text) return null;
    const segments = text.split(/(\[(?:contact|price) hidden\])/gi);
    if (segments.length === 1) {
      return renderPlainTextWithLinks(text);
    }
    return segments.map((segment, i) => {
      const lower = segment.toLowerCase();
      if (lower === '[contact hidden]' || lower === '[price hidden]') {
        return (
          <span
            key={`masked-${i}`}
            className="italic text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded text-xs font-medium"
          >
            {segment}
          </span>
        );
      }
      return <span key={`seg-${i}`}>{renderPlainTextWithLinks(segment)}</span>;
    });
  };

  const renderPlainTextWithLinks = (text: string): ReactNode => {
    if (!text) return null;
    // Match http/https URLs until whitespace; avoid trailing punctuation when possible
    const urlRegex = /(https?:\/\/[^\s)]+)(?=[\s)|]|$)/g;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(urlRegex)) {
      const url = match[0];
      const index = match.index ?? 0;
      if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
      nodes.push(
        <a
          key={`${index}-${url}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-all"
        >
          {url}
        </a>
      );
      lastIndex = index + url.length;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
  };

  // Enhanced search function with better matching
  const matchesSearch = (text: string, query: string): boolean => {
    if (!query.trim()) return true;
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase().trim();

    // Exact phrase match
    if (normalizedText.includes(normalizedQuery)) return true;

    // Word boundary matching (each word in query must appear)
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    return queryWords.every(word => normalizedText.includes(word));
  };

  // Highlight search matches while preserving URLs
  const highlightMessage = (text: string, query: string, isHighlighted: boolean = false): ReactNode => {
    if (!query.trim()) return renderMessageWithLinks(text);

    const normalizedQuery = query.trim();
    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // First, extract URLs to preserve them
    const urlRegex = /(https?:\/\/[^\s)]+)(?=[\s)|]|$)/g;
    const urlMatches: Array<{ url: string; start: number; end: number }> = [];
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      urlMatches.push({
        url: match[0],
        start: match.index!,
        end: match.index! + match[0].length,
      });
    }

    // Check if query matches within a URL - if so, don't highlight (preserve URL)
    const isInUrl = (index: number) => {
      return urlMatches.some(url => index >= url.start && index < url.end);
    };

    // Split text by search query, but skip matches inside URLs
    const parts: Array<{ text: string; isMatch: boolean; isUrl: boolean }> = [];
    let lastIndex = 0;
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    let regexMatch;
    while ((regexMatch = regex.exec(text)) !== null) {
      const matchStart = regexMatch.index!;
      const matchEnd = matchStart + regexMatch[0].length;

      // Skip if match is inside a URL
      if (isInUrl(matchStart)) {
        continue;
      }

      // Add text before match
      if (matchStart > lastIndex) {
        const beforeText = text.slice(lastIndex, matchStart);
        // Check if this segment contains URLs
        const urlInSegment = urlMatches.find(url =>
          url.start >= lastIndex && url.start < matchStart
        );
        if (urlInSegment) {
          parts.push({ text: beforeText, isMatch: false, isUrl: true });
        } else {
          parts.push({ text: beforeText, isMatch: false, isUrl: false });
        }
      }

      // Add match
      parts.push({ text: regexMatch[0], isMatch: true, isUrl: false });
      lastIndex = matchEnd;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      const urlInSegment = urlMatches.find(url => url.start >= lastIndex);
      parts.push({ text: remainingText, isMatch: false, isUrl: !!urlInSegment });
    }

    // If no matches found (all were in URLs), just render normally
    if (parts.length === 0 || (parts.length === 1 && !parts[0].isMatch)) {
      return renderMessageWithLinks(text);
    }

    // Render parts
    return (
      <>
        {parts.map((part, i) => {
          if (part.isUrl) {
            return <span key={i}>{renderMessageWithLinks(part.text)}</span>;
          }
          if (part.isMatch) {
            return (
              <mark
                key={i}
                className={`bg-yellow-200 dark:bg-yellow-900 ${isHighlighted ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              >
                {part.text}
              </mark>
            );
          }
          return <span key={i}>{part.text}</span>;
        })}
      </>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Track the last message count to detect new messages (not just updates)
  const lastMessageCountRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only scroll to bottom if:
    // 1. New messages were added (count increased)
    // 2. Or the last message ID changed (new message at the end)
    const currentLastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const messageCountIncreased = messages.length > lastMessageCountRef.current;
    const lastMessageChanged = currentLastMessageId !== lastMessageIdRef.current;

    if (messageCountIncreased || (lastMessageChanged && messages.length > 0)) {
    scrollToBottom();
    }

    // Update refs
    lastMessageCountRef.current = messages.length;
    lastMessageIdRef.current = currentLastMessageId;
  }, [messages]);

  // Reset search index when query changes
  useEffect(() => {
    setCurrentSearchIndex(-1);
  }, [searchQuery]);

  // Track if we've already marked this chat as read to prevent duplicate calls
  const lastReadChatIdRef = useRef<string | null>(null);
  const readTimeoutRef = useRef<number | null>(null);

  // No need to re-format messages - we format on-the-fly during render
  // This follows industry best practice: store UTC, display in viewer's timezone

  // Load messages when chatId changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/chats/messages/${chatId}`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.messages)) {
          // Following industry standard: Store UTC, display in viewer's timezone
          // We format timestamps on-the-fly during render, so no need to format here
          
          const formatted = (json.messages as Record<string, unknown>[]).map((m) => {
            const mRec = m as Record<string, unknown>
            const senderId = typeof mRec.sender_id === 'string' ? mRec.sender_id : ''
            const isOwn = senderId === currentUserId

            // Always show "You" for current user's messages, otherwise use sender name from API or fallback
            const senderName = isOwn
              ? 'You'
              : (typeof mRec.sender_name === 'string'
                ? mRec.sender_name
                : (otherParticipant?.name || 'User'))

            // Use sender avatar from API if available, otherwise fallback
            const senderAvatar = typeof mRec.sender_avatar === 'string' && mRec.sender_avatar
              ? mRec.sender_avatar
              : (isOwn ? (currentUserAvatar || '') : (otherParticipant?.avatar || ''))

            const createdAt = typeof mRec.created_at === 'string' ? mRec.created_at : ''

            const filePath = typeof mRec.file_path === 'string' ? mRec.file_path : null;
            const messageType = typeof mRec.message_type === 'string' ? mRec.message_type : 'text';
            const rawMessage = typeof mRec.message === 'string' ? mRec.message : '';
            const isDeleted = typeof mRec.is_deleted === 'boolean' ? mRec.is_deleted : false;
            const displayMessage =
              isDeleted || messageType !== 'text'
                ? rawMessage
                : maskSensitiveChatContent(rawMessage);

            // Store UTC timestamp - format on-the-fly during render (industry standard)
            // This ensures timestamps always use current timezone
            return {
              id: typeof mRec.id === 'string' ? mRec.id : '',
              sender_id: senderId,
              sender: senderName,
              avatar: senderAvatar,
              message: displayMessage,
              timestamp: '', // Will be formatted on-the-fly
              date: '', // Will be formatted on-the-fly
              created_at: createdAt, // Store UTC ISO string
              isOwn,
              is_deleted: isDeleted,
              deleted_at: typeof mRec.deleted_at === 'string' ? mRec.deleted_at : null,
              is_edited: typeof mRec.is_edited === 'boolean' ? mRec.is_edited : false,
              edited_at: typeof mRec.edited_at === 'string' ? mRec.edited_at : null,
              message_type: messageType,
              file_path: filePath,
              file_url: null as string | null, // Will be set below
              reactions: typeof mRec.reactions === 'object' && mRec.reactions !== null
                ? (mRec.reactions as Record<string, string[]>)
                : {},
              source_channel:
                typeof mRec.source_channel === 'string' ? mRec.source_channel : 'app',
            }
          });

          // Get signed URLs for all files using API (more reliable)
          const filesToSign = formatted.filter(msg => msg.file_path).map(msg => ({
            bucket: BUCKETS.documents,
            path: msg.file_path!,
            expiresIn: 60 * 60 * 24 * 7, // 7 days
          }));

          if (filesToSign.length > 0) {
            try {
              const signedResults = await getSignedUrls(filesToSign);
              const pathToUrl = new Map<string, string>();
              signedResults.forEach(result => {
                const url = result.signedUrl || result.publicUrl;
                if (url) {
                  pathToUrl.set(result.path, url);
                }
              });

              const messagesWithUrls = formatted.map(msg => {
                if (msg.file_path && pathToUrl.has(msg.file_path)) {
                  return { ...msg, file_url: pathToUrl.get(msg.file_path)! };
                }
                return msg;
              });

              setMessages(messagesWithUrls);
            } catch (err) {
              console.error('Failed to get signed URLs via API, using fallback:', err);
              // Fallback: try client-side signing
              const messagesWithUrls = await Promise.all(
                formatted.map(async (msg) => {
                  if (msg.file_path) {
                    try {
                      const { data: signedData } = await supabase.storage
                        .from(BUCKETS.documents)
                        .createSignedUrl(msg.file_path, 60 * 60 * 24 * 7);
                      if (signedData?.signedUrl) {
                        return { ...msg, file_url: signedData.signedUrl };
                      }
                    } catch {
                      // Try public URL
                      const { data: publicData } = supabase.storage
                        .from(BUCKETS.documents)
                        .getPublicUrl(msg.file_path);
                      if (publicData?.publicUrl) {
                        return { ...msg, file_url: publicData.publicUrl };
                      }
                    }
                  }
                  return msg;
                })
              );
              setMessages(messagesWithUrls);
            }
          } else {
          setMessages(formatted);
          }
        }
      } catch (e) {
        console.error('Failed to load messages:', e);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUserId]); // userTimezone handled by re-format effect to avoid unnecessary reloads

  // Mark chat as read on open/when chatId becomes active (debounced to prevent spam)
  useEffect(() => {
    if (!chatId || !currentUserId) return;

    // Clear any pending read call
    if (readTimeoutRef.current) {
      window.clearTimeout(readTimeoutRef.current);
      readTimeoutRef.current = null;
    }

    // Only mark as read if this is a different chat or we haven't marked it recently
    if (lastReadChatIdRef.current === chatId) {
      return; // Already marked this chat as read
    }

    if (shouldSkipAutoRead(chatId)) {
      return;
    }

    // Debounce the read call to prevent rapid-fire requests
    readTimeoutRef.current = window.setTimeout(async () => {
      try {
        await markRead(chatId);
        lastReadChatIdRef.current = chatId; // Remember we've marked this chat as read
      } catch {
        // ignore
      } finally {
        readTimeoutRef.current = null;
      }
    }, 500); // 500ms debounce

    return () => {
      if (readTimeoutRef.current) {
        window.clearTimeout(readTimeoutRef.current);
        readTimeoutRef.current = null;
      }
    };
  }, [chatId, currentUserId, markRead, shouldSkipAutoRead]);

  // Subscribe to real-time message updates
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const newMsg = payload.new as Record<string, unknown>;
          const senderId = typeof newMsg.sender_id === 'string' ? newMsg.sender_id : ''
          const isOwn = senderId === currentUserId

          // For real-time messages, we need to fetch sender info or use fallback
          // The API will include sender info, but for real-time we use otherParticipant as fallback
          const senderName = isOwn ? 'You' : (otherParticipant?.name || 'User')
          const senderAvatar = isOwn ? (currentUserAvatar || '') : (otherParticipant?.avatar || '')

          const createdAt = typeof newMsg.created_at === 'string' ? newMsg.created_at : ''

          const filePath = typeof newMsg.file_path === 'string' ? newMsg.file_path : null;
          const messageType = typeof newMsg.message_type === 'string' ? newMsg.message_type : 'text';

          const rawMessage = typeof newMsg.message === 'string' ? newMsg.message : '';
          const displayMessage =
            messageType !== 'text'
              ? rawMessage
              : maskSensitiveChatContent(rawMessage);

          // Store UTC timestamp - format on-the-fly during render
          const formatted: Message = {
            id: typeof newMsg.id === 'string' ? newMsg.id : '',
            sender_id: senderId,
            sender: senderName,
            avatar: senderAvatar,
            message: displayMessage,
            timestamp: '', // Will be formatted on-the-fly
            date: '', // Will be formatted on-the-fly
            created_at: createdAt, // Store UTC ISO string
            isOwn,
            is_deleted: typeof newMsg.is_deleted === 'boolean' ? newMsg.is_deleted : false,
            deleted_at: typeof newMsg.deleted_at === 'string' ? newMsg.deleted_at : null,
            is_edited: typeof newMsg.is_edited === 'boolean' ? newMsg.is_edited : false,
            edited_at: typeof newMsg.edited_at === 'string' ? newMsg.edited_at : null,
            message_type: messageType,
            file_path: filePath,
            file_url: null as string | null, // Will be set asynchronously
            reactions: {},
            source_channel:
              typeof newMsg.source_channel === 'string'
                ? (newMsg.source_channel as string)
                : 'app',
          };

          // Get file URL asynchronously if file_path exists using API
          if (filePath) {
            getSignedUrls([{
              bucket: BUCKETS.documents,
              path: filePath,
              expiresIn: 60 * 60 * 24 * 7,
            }])
              .then((results) => {
                if (results.length > 0) {
                  const url = results[0].signedUrl || results[0].publicUrl;
                  if (url) {
                    setMessages((prev) => {
                      return prev.map((m) => {
                        if (m.id === formatted.id && m.file_path === filePath) {
                          return { ...m, file_url: url };
                        }
                        return m;
                      });
                    });
                  }
                }
              })
              .catch((err) => {
                console.error('Error getting file URL for real-time message:', err);
              });
          }

          // if the new message is from the other participant, clear their typing indicator
          if (formatted.sender_id && formatted.sender_id !== currentUserId) {
            setOtherTyping(false);
          }

          // Only add if not already in list (avoid duplicates / optimistic temp rows)
          setMessages((prev) => {
            if (prev.some((m) => m.id === formatted.id)) return prev;
            const withoutOptimistic = prev.filter((m) => {
              if (!m.id.startsWith("temp-")) return true;
              if (m.sender_id && formatted.sender_id && m.sender_id === formatted.sender_id) {
                return false;
              }
              if (isOwn && m.isOwn) return false;
              return true;
            });
            return [...withoutOptimistic, formatted];
          });
        }
      )
      // Listen for UPDATE events (message edits/deletes)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Record<string, unknown>;
          const messageId = typeof updatedMsg.id === 'string' ? updatedMsg.id : '';

          setMessages((prev) => {
            return prev.map((msg) => {
              if (msg.id === messageId) {
                const rawMessage =
                  typeof updatedMsg.message === 'string' ? updatedMsg.message : msg.message;
                const isDeleted =
                  typeof updatedMsg.is_deleted === 'boolean'
                    ? updatedMsg.is_deleted
                    : msg.is_deleted;
                const displayMessage =
                  isDeleted || msg.message_type !== 'text'
                    ? rawMessage
                    : maskSensitiveChatContent(rawMessage);

                return {
                  ...msg,
                  message: displayMessage,
                  is_deleted: isDeleted,
                  deleted_at: typeof updatedMsg.deleted_at === 'string' ? updatedMsg.deleted_at : updatedMsg.deleted_at === null ? null : msg.deleted_at,
                  is_edited: typeof updatedMsg.is_edited === 'boolean' ? updatedMsg.is_edited : msg.is_edited,
                  edited_at: typeof updatedMsg.edited_at === 'string' ? updatedMsg.edited_at : updatedMsg.edited_at === null ? null : msg.edited_at,
                  source_channel:
                    typeof updatedMsg.source_channel === 'string'
                      ? (updatedMsg.source_channel as string)
                      : msg.source_channel,
                };
              }
              return msg;
            });
          });
        }
      )
      // Listen for typing broadcast events on the same channel
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: unknown) => {
          try {
            const anyPayload = payload as { payload?: { chatId?: string; userId?: string; typing?: boolean } };
            const p = anyPayload?.payload ?? (payload as Record<string, unknown>);
            type PayloadShape = { chatId?: string; userId?: string; typing?: boolean };
            const chatIdPayload = (p as PayloadShape)?.chatId;
            if (!p || chatIdPayload !== chatId) return;
            const userIdPayload = (p as PayloadShape)?.userId;
            // ignore events from ourselves
            if (userIdPayload && userIdPayload === currentUserId) return;
            setOtherTyping(Boolean((p as PayloadShape)?.typing));
          } catch {
            // ignore malformed payloads
          }
        }
      )
      .subscribe();

    // Subscribe to reaction changes
    const reactionChannel = supabase
      .channel(`chat-reactions:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_reactions',
        },
        async (payload) => {
          
          // Reload reactions for the affected message
          const reaction = payload.new as Record<string, unknown> | null;
          const oldReaction = payload.old as Record<string, unknown> | null;
          const messageId = (reaction?.message_id || oldReaction?.message_id) as string;

          if (!messageId) {
            return;
          }

          // Verify the message belongs to this chat by checking if it exists in our messages
          // We'll verify by checking the message's chat_id
          try {
            // First, verify the message belongs to this chat
            const { data: message } = await supabase
              .from('chat_messages')
              .select('id, chat_id')
              .eq('id', messageId)
              .eq('chat_id', chatId)
              .maybeSingle();

            if (!message) {
              return;
            }

            // Fetch updated reactions for this message
            const { data: reactions, error: reactionsError } = await supabase
              .from('chat_message_reactions')
              .select('message_id, user_id, emoji')
              .eq('message_id', messageId);

            if (reactionsError) {
              console.error('[ReactionSubscription] Error fetching reactions:', reactionsError);
              return;
            }

            if (reactions) {
              // Group reactions by emoji
              const reactionsByEmoji: Record<string, string[]> = {};
              reactions.forEach((r) => {
                const emoji = r.emoji as string;
                const userId = r.user_id as string;
                if (!reactionsByEmoji[emoji]) {
                  reactionsByEmoji[emoji] = [];
                }
                if (!reactionsByEmoji[emoji].includes(userId)) {
                  reactionsByEmoji[emoji].push(userId);
                }
              });


              // Update message reactions
              setMessages((prev) => {
                const messageExists = prev.some(msg => msg.id === messageId);
                if (!messageExists) {
                  return prev;
                }
                
                return prev.map((msg) => {
                  if (msg.id === messageId) {
                    return { ...msg, reactions: reactionsByEmoji };
                  }
                  return msg;
                });
              });
            } else {
              // No reactions found - clear reactions for this message
              setMessages((prev) => {
                return prev.map((msg) => {
                  if (msg.id === messageId) {
                    return { ...msg, reactions: {} };
                  }
                  return msg;
                });
              });
            }
          } catch (error) {
            console.error('[ReactionSubscription] Failed to update reactions:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('[ReactionSubscription] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionChannel);
    };
  }, [chatId, currentUserId, currentUserAvatar, otherParticipant]);

  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download file:', error);
      // Fallback: open in new tab
      window.open(fileUrl, '_blank');
    }
  };

  const handleViewImage = (imageUrl: string, imageName?: string) => {
    setViewingImageUrl(imageUrl);
    setViewingImageName(imageName || 'Image');
  };

  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = inputValue.substring(0, start) + emoji + inputValue.substring(end);
      setInputValue(newValue);
      // Set cursor position after emoji
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setInputValue(inputValue + emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!chatId) return;

    try {
      const res = await fetch(`/api/chats/messages/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });

      const json = await res.json();
      if (json.ok) {
        // Update local state
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === messageId) {
              const currentReactions = msg.reactions || {};
              const userReactions = (currentReactions[emoji] || []).filter((id): id is string => typeof id === 'string');
              const hasReacted = currentUserId ? userReactions.includes(currentUserId) : false;

              if (hasReacted && currentUserId) {
                // Remove reaction
                const newUserReactions = userReactions.filter(id => id !== currentUserId);
                const newReactions: Record<string, string[]> = { ...currentReactions };
                // Filter out null values and ensure all values are string arrays
                Object.keys(newReactions).forEach(key => {
                  newReactions[key] = (newReactions[key] || []).filter((id): id is string => typeof id === 'string');
                });
                if (newUserReactions.length === 0) {
                  delete newReactions[emoji];
                } else {
                  newReactions[emoji] = newUserReactions;
                }
                return { ...msg, reactions: newReactions };
              } else if (currentUserId) {
                // Add reaction
                const newReactions: Record<string, string[]> = { ...currentReactions };
                // Filter out null values and ensure all values are string arrays
                Object.keys(newReactions).forEach(key => {
                  newReactions[key] = (newReactions[key] || []).filter((id): id is string => typeof id === 'string');
                });
                return {
                  ...msg,
                  reactions: {
                    ...newReactions,
                    [emoji]: [...userReactions, currentUserId],
                  },
                };
              }
              return msg;
            }
            return msg;
          });
        });
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  // Common emojis organized by category
  const emojiCategories = {
    'Smileys & People': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'],
    'Gestures': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
    'Food & Drink': ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🥧', '🧇', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
    'Travel & Places': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩', '💺', '🚁', '🚀', '🛸', '🚤', '🛥', '🛳', '⛴', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🗺', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢', '🎠', '⛲', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔', '🗻', '🏕', '⛺', '🏠', '🏡', '🏘', '🏚', '🏗', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩', '🛤', '🛣', '🗾', '🎑', '🏞', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙', '🌃', '🌌', '🌉', '🌁'],
    'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '✅', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '❗', '❓', '❕', '❔', '‼️', '⁉️', '⚠️', '♻️', '✅', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🚹', '🚺', '🚼', '🚻', '🚮', '📶', 'ℹ️', '🔣', '🔤', '🔡', '🔠', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '▶️', '⏸', '⏯', '⏹', '⏺', '⏭', '⏮', '⏩', '⏪', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '➕', '➖', '➗', '✖️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '⚪', '⚫', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟫', '⬜', '⬛', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪'],
  };

  const handleSend = async (filePath?: string, messageType?: string) => {
    if ((!inputValue.trim() && !filePath) || !chatId) return;

    const messageText = inputValue.trim();
    const optimisticId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimisticType = messageType || (filePath ? "file" : "text");

    // Show immediately — do not wait for realtime (cookie auth has no Supabase realtime session)
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        sender_id: currentUserId || "",
        sender: "You",
        avatar: currentUserAvatar || "",
        message: messageText,
        timestamp: "",
        date: "",
        created_at: nowIso,
        isOwn: true,
        is_deleted: false,
        deleted_at: null,
        is_edited: false,
        edited_at: null,
        message_type: optimisticType,
        file_path: filePath || null,
        file_url: null,
        reactions: {},
        source_channel: "app",
      },
    ]);
    setInputValue("");

    try {
      const res = await fetch(`/api/chats/messages/${chatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText || "",
          type: messageType || "text",
          filePath: filePath || null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        console.error("Failed to send message:", json?.error);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInputValue(messageText);
        toast.error(json?.error || "Failed to send message");
        return;
      }

      const saved = json.message as Record<string, unknown> | undefined;
      if (saved && typeof saved.id === "string") {
        const senderId =
          typeof saved.sender_id === "string" ? saved.sender_id : currentUserId || "";
        const createdAt =
          typeof saved.created_at === "string" ? saved.created_at : nowIso;
        const rawMessage =
          typeof saved.message === "string" ? saved.message : messageText;
        const savedType =
          typeof saved.message_type === "string" ? saved.message_type : optimisticType;
        const savedPath =
          typeof saved.file_path === "string" ? saved.file_path : filePath || null;

        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== optimisticId);
          if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
          return [
            ...withoutTemp,
            {
              id: saved.id as string,
              sender_id: senderId,
              sender: "You",
              avatar: currentUserAvatar || "",
              message:
                savedType !== "text"
                  ? rawMessage
                  : maskSensitiveChatContent(rawMessage),
              timestamp: "",
              date: "",
              created_at: createdAt,
              isOwn: true,
              is_deleted: Boolean(saved.is_deleted),
              deleted_at: null,
              is_edited: Boolean(saved.is_edited),
              edited_at: null,
              message_type: savedType,
              file_path: savedPath,
              file_url: null,
              reactions: {},
              source_channel:
                typeof saved.source_channel === "string"
                  ? saved.source_channel
                  : "app",
            },
          ];
        });

        if (savedPath) {
          void getSignedUrls([
            {
              bucket: BUCKETS.documents,
              path: savedPath,
              expiresIn: 60 * 60 * 24 * 7,
            },
          ]).then((results) => {
            const url = results[0]?.signedUrl || results[0]?.publicUrl;
            if (!url) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === saved.id ? { ...m, file_url: url } : m
              )
            );
          });
        }
      } else {
        // Fallback: replace temp with server id only
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId && typeof json.id === "string"
              ? { ...m, id: json.id }
              : m
          )
        );
      }
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInputValue(messageText);
      toast.error("Failed to send message");
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !chatId) return;

    setUploading(true);
    try {
      const file = files[0];
      const isImage = file.type.startsWith('image/');
      const messageType = isImage ? 'image' : 'file';

      // Upload file
      const uploaded = await uploadViaApi(file, {
        bucket: BUCKETS.documents,
        folder: 'chat',
        signed: true,
        expiresIn: 60 * 60 * 24 * 365, // 1 year
      });

      if (uploaded.length > 0 && uploaded[0].path) {
        // Send message with file - use the signed URL from upload response
        const filePath = uploaded[0].path;
        const signedUrl = uploaded[0].signedUrl || uploaded[0].publicUrl;

        // Send message with file path
        await handleSend(filePath, messageType);

        // Update the message with the URL immediately after it's created
        // The real-time subscription will add the message, then we update it with the URL
        if (signedUrl) {
          // Update immediately
          setMessages((prev) => {
            return prev.map((m) => {
              // Match by file_path since the message might not have an ID yet
              if (m.file_path === filePath && !m.file_url) {
                return { ...m, file_url: signedUrl };
              }
              return m;
            });
          });

          // Also update after real-time message arrives
          setTimeout(() => {
            setMessages((prev) => {
              return prev.map((m) => {
                if (m.file_path === filePath && !m.file_url) {
                  return { ...m, file_url: signedUrl };
                }
                return m;
              });
            });
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteClick = (messageId: string) => {
    setDeleteConfirmId(messageId);
    setOpenDropdownId(null);
  };

  const handleConfirmDelete = async () => {
    if (!chatId || !deleteConfirmId) return;

    try {
      const res = await fetch(`/api/chats/messages/${chatId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: deleteConfirmId }),
      });

      const json = await res.json();
      if (!json.ok) {
        console.error('Failed to delete message:', json.error);
      } else {
        setDeleteConfirmId(null);
      }
    } catch {
      console.error('Failed to delete message');
    }
  };

  const handleStartEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditInputValue(message.message);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditInputValue("");
  };

  const handleSaveEdit = async () => {
    if (!chatId || !editingMessageId || !editInputValue.trim()) return;

    try {
      const res = await fetch(`/api/chats/messages/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: editingMessageId, message: editInputValue.trim() }),
      });

      const json = await res.json();
      if (!json.ok) {
        console.error('Failed to edit message:', json.error);
      } else {
        setEditingMessageId(null);
        setEditInputValue("");
      }
    } catch {
      console.error('Failed to edit message');
    }
  };

  // Send typing broadcast (debounced by callers)
  const sendTyping = (typing: boolean) => {
    try {
      if (!chatId) return;
      // Avoid sending duplicate consecutive typing states
      if (lastSentTypingRef.current === typing) return;
      lastSentTypingRef.current = typing;

      const ch = supabase.channel(`chat:${chatId}`);
      ch.send({ type: 'broadcast', event: 'typing', payload: { chatId, userId: currentUserId, typing } }).catch(() => { });
    } catch {
      // ignore
    }
  };

  // Input onChange handler with typing debounce
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (!chatId) return;

    // notify typing true immediately
    sendTyping(true);

    // reset debounce timer
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      sendTyping(false);
      typingTimeoutRef.current = null;
    }, 1500);
  };

  // Clear typing timeout and read timeout when unmounting or chatId changes
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      lastSentTypingRef.current = null;
      if (readTimeoutRef.current) {
        window.clearTimeout(readTimeoutRef.current);
        readTimeoutRef.current = null;
      }
      clearSkipAutoRead();
      // Reset lastReadChatIdRef when chatId changes so we can mark the new chat as read
      lastReadChatIdRef.current = null;
    };
  }, [chatId, clearSkipAutoRead]);

  // Filter messages by search query
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter((msg) =>
      matchesSearch(msg.message, searchQuery) ||
      matchesSearch(msg.sender, searchQuery)
    );
  }, [messages, searchQuery]);

  // Get search result indices
  const searchResultIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return filteredMessages.map((_, index) => index);
  }, [filteredMessages, searchQuery]);

  // Navigate to search result
  const scrollToSearchResult = useCallback((index: number) => {
    if (index < 0 || index >= filteredMessages.length) return;
    const message = filteredMessages[index];
    const element = messageRefs.current[message.id];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentSearchIndex(index);
    }
  }, [filteredMessages]);

  const handleNextSearch = useCallback(() => {
    if (searchResultIndices.length === 0) return;
    const nextIndex = currentSearchIndex < 0
      ? 0
      : (currentSearchIndex + 1) % searchResultIndices.length;
    scrollToSearchResult(nextIndex);
  }, [searchResultIndices.length, currentSearchIndex, scrollToSearchResult]);

  const handlePreviousSearch = useCallback(() => {
    if (searchResultIndices.length === 0) return;
    const prevIndex = currentSearchIndex <= 0
      ? searchResultIndices.length - 1
      : currentSearchIndex - 1;
    scrollToSearchResult(prevIndex);
  }, [searchResultIndices.length, currentSearchIndex, scrollToSearchResult]);

  // Get unique dates for navigation
  const uniqueDates = useMemo(() => {
    // Use created_at (ISO string) for accurate date comparison and sorting
    const dateMap = new Map<string, { display: string; iso: string; date: Date }>();

    // Get current timezone for date formatting
    const tz = userTimezone !== 'UTC' ? userTimezone : getCurrentTimezone();

    messages.forEach(m => {
      // Format date on-the-fly using the same logic as in render
      const msgDate = formatMessageDate(m.created_at, tz);
      
      if (!dateMap.has(msgDate)) {
        // Use the ISO string (created_at) for accurate date parsing
        const dateObj = new Date(m.created_at);
        dateMap.set(msgDate, {
          display: msgDate,
          iso: m.created_at,
          date: dateObj,
        });
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [messages, userTimezone, getCurrentTimezone]);

  // Navigate to a specific date
  const navigateToDate = useCallback((dateStr: string) => {
    const dateElement = dateRefs.current[dateStr];
    if (dateElement) {
      dateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSelectedDate(dateStr);
      setShowDatePicker(false);
      // Clear selection after a delay
      setTimeout(() => setSelectedDate(null), 2000);
    }
  }, []);

  // Handle jump to date from input
  const handleJumpToDate = useCallback(() => {
    if (!jumpToDate) return;

    // Try to find the closest date
    const targetDate = new Date(jumpToDate);
    if (isNaN(targetDate.getTime())) return;

    // Find the closest date in uniqueDates
    let closestDate = uniqueDates[0];
    let minDiff = Math.abs(targetDate.getTime() - uniqueDates[0].date.getTime());

    for (const dateInfo of uniqueDates) {
      const diff = Math.abs(targetDate.getTime() - dateInfo.date.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestDate = dateInfo;
      }
    }

    if (closestDate) {
      navigateToDate(closestDate.display);
      setJumpToDate("");
    }
  }, [jumpToDate, uniqueDates, navigateToDate]);

  // Keyboard shortcuts for search (defined after functions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }

      // Escape to close search
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setCurrentSearchIndex(-1);
      }

      // Enter or F3 to go to next result (when search is active)
      if (showSearch && searchQuery.trim() && (e.key === 'Enter' || e.key === 'F3')) {
        e.preventDefault();
        handleNextSearch();
      }

      // Shift+Enter or Shift+F3 to go to previous result
      if (showSearch && searchQuery.trim() && ((e.shiftKey && e.key === 'Enter') || (e.shiftKey && e.key === 'F3'))) {
        e.preventDefault();
        handlePreviousSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, searchQuery, handleNextSearch, handlePreviousSearch]);

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background border border-border rounded-lg">
        <p className="text-muted-foreground">Select a conversation to start chatting</p>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-background w-full overflow-hidden min-h-0 ${embedded ? "border-0 rounded-none h-full" : "border border-border rounded-lg"}`}>
      {/* Header */}
      <div className={`flex-shrink-0 w-full border-b border-border ${embedded ? "px-4 py-3" : "px-6 py-4"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <h2 className={`font-bold text-foreground truncate ${embedded ? "text-base" : "text-2xl"}`}>
              {otherParticipant?.name || 'Private Chat'}
              {clientName && !embedded ? (
                <span className="text-lg font-medium text-muted-foreground ml-2">(Client: {clientName})</span>
              ) : null}
            </h2>
            {peerRoleLabel && otherParticipant ? (
              <p className="text-sm text-muted-foreground mt-0.5">{peerRoleLabel}</p>
            ) : null}
            {embedded && clientName ? (
              <p className="text-xs text-muted-foreground truncate">{clientName}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!embedded && chatId && currentUserId ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
                onClick={() => {
                  setAlertMessage("");
                  setAlertOpen(true);
                }}
                title="Send an alert to Pagoda support"
              >
                <Bell className="h-4 w-4 mr-1.5" />
                Alert support
              </Button>
            ) : null}
            {!embedded ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => chatId && void markUnread(chatId)}
              title="Mark as unread"
            >
              <Mail className="h-4 w-4 mr-1.5" />
              Mark unread
            </Button>
            ) : null}
            {!embedded && typeof onStartClientChat === 'function' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onStartClientChat}
                title="Start a separate chat for a client or travel order"
              >
                New chat for client
              </Button>
            ) : null}
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Jump to date"
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Jump to Date</h4>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={jumpToDate}
                        onChange={(e) => setJumpToDate(e.target.value)}
                        className="h-9"
                        placeholder="Select a date"
                      />
                      <Button
                        onClick={handleJumpToDate}
                        disabled={!jumpToDate}
                        size="sm"
                        className="h-9"
                      >
                        Go
                      </Button>
        </div>
                  </div>
                  {uniqueDates.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Or select a date:</p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {uniqueDates.map((dateInfo) => (
                          <button
                            key={dateInfo.display}
                            onClick={() => navigateToDate(dateInfo.display)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${selectedDate === dateInfo.display
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 font-medium'
                                : ''
                              }`}
                          >
                            {dateInfo.display}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSearch(!showSearch)}
              className="h-8 w-8"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {showSearch && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                ref={searchInputRef}
                placeholder="Search messages... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleNextSearch();
                  } else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    handlePreviousSearch();
                  }
                }}
                className="h-9 flex-1"
              />
              {searchQuery.trim() && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentSearchIndex(-1);
                  }}
                  className="h-9 w-9"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {searchQuery.trim() && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {filteredMessages.length > 0 ? (
                    <>
                      {currentSearchIndex >= 0 ? (
                        <>Found {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''} ({currentSearchIndex + 1} of {filteredMessages.length})</>
                      ) : (
                        <>Found {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}</>
                      )}
                    </>
                  ) : (
                    'No results found'
                  )}
                </span>
                {filteredMessages.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handlePreviousSearch}
                      className="h-7 w-7"
                      title="Previous (Shift+Enter)"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleNextSearch}
                      className="h-7 w-7"
                      title="Next (Enter)"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!embedded ? <MessageBoardPolicyBanner /> : null}

      {/* Messages - scrollable area */}
      <div className={`flex-1 overflow-y-auto py-4 space-y-4 min-h-0 ${embedded ? "px-4" : "px-6"}`}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          (() => {
            let lastDate = '';
            return (
              <>
                {/* Messages */}
                {filteredMessages.length === 0 && searchQuery.trim() ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">No messages found matching "{searchQuery}"</p>
                  </div>
                ) : (
                  filteredMessages.map((msg, index) => {
                    // Format date on-the-fly for comparison and display
                    // Always get fresh timezone - use state if available, otherwise detect on-the-fly
                    const tz = userTimezone !== 'UTC' ? userTimezone : getCurrentTimezone();
                    // Debug first message
                    if (index === 0) {
                      const testUTC = formatMessageTime(msg.created_at, 'UTC');
                      const testTZ = formatMessageTime(msg.created_at, tz);
                    }
                    const msgDate = formatMessageDate(msg.created_at, tz);
                    const showDateSeparator = msgDate !== lastDate;
                    if (showDateSeparator) lastDate = msgDate;
                    const isHighlighted = currentSearchIndex === index;
                    const isDateSelected = selectedDate === msgDate && showDateSeparator;

                    return (
            <div
              key={msg.id}
                        data-message-id={msg.id}
                        ref={(el) => {
                          if (el) messageRefs.current[msg.id] = el;
                        }}
                        className={isHighlighted ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg p-1 -m-1' : ''}
                      >
                        {showDateSeparator && (
                          <div
                            ref={(el) => {
                              if (el) dateRefs.current[msgDate] = el;
                            }}
                            className={`flex items-center justify-center my-4 transition-all ${isDateSelected ? 'scale-105' : ''
                              }`}
                          >
                            <button
                              onClick={() => navigateToDate(msgDate)}
                              className={`flex items-center gap-2 px-4 py-2 bg-muted rounded-full transition-all hover:bg-muted/80 hover:scale-105 cursor-pointer ${isDateSelected
                                  ? 'bg-yellow-200 dark:bg-yellow-900/50 ring-2 ring-yellow-400 dark:ring-yellow-600'
                                  : ''
                                }`}
                              title="Click to jump to this date"
                            >
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className={`text-sm font-medium ${isDateSelected
                                  ? 'text-yellow-900 dark:text-yellow-100'
                                  : 'text-muted-foreground'
                                }`}>
                                {msgDate}
                              </span>
                            </button>
                          </div>
                        )}
                        <div
              className={`flex gap-3 ${msg.isOwn ? "flex-row-reverse" : ""}`}
                          onMouseEnter={() => {
                            if (!editingMessageId && openDropdownId !== msg.id) {
                              setHoveredMessageId(msg.id);
                            }
                          }}
                          onMouseLeave={(e) => {
                            // Don't hide if dropdown is open or mouse is moving to dropdown or reaction picker
                            if (openDropdownId === msg.id || openReactionPickerId === msg.id) return;
                            const relatedTarget = e.relatedTarget;
                            // Check if relatedTarget is an HTMLElement and has closest method
                            if (relatedTarget && typeof relatedTarget === 'object' && 'closest' in relatedTarget) {
                              const element = relatedTarget as HTMLElement;
                              if (
                                element.closest('[role="menu"]') ||
                                element.closest('[data-radix-popper-content-wrapper]')
                              ) {
                                return;
                              }
                            }
                            setHoveredMessageId(null);
                          }}
                        >
                          <div className="shrink-0">
                            <Avatar className="h-8 w-8">
                {msg.avatar ? (
                  <AvatarImage src={msg.avatar} alt={msg.sender} />
                ) : null}
                <AvatarFallback>{msg.sender.charAt(0)}</AvatarFallback>
              </Avatar>
                          </div>
              <div
                className={`flex-1 ${msg.isOwn ? "flex flex-col items-end" : ""}`}
              >
                            <div className={`flex items-baseline gap-2 ${msg.isOwn ? "flex-row-reverse" : ""}`}>
                  <p className="text-sm font-medium text-foreground">
                    {msg.sender}
                  </p>
                  <p 
                    className="text-xs text-muted-foreground"
                    title={`${formatMessageTime(msg.created_at, tz)} (your local time)`}
                  >
                    {formatMessageTime(msg.created_at, tz)}
                  </p>
                              {msg.is_edited && !msg.is_deleted && (
                                <span className="text-xs text-muted-foreground">(edited)</span>
                              )}
                </div>
                            <div className="relative group flex items-start gap-2">
                              {msg.isOwn && !msg.is_deleted && (hoveredMessageId === msg.id || openDropdownId === msg.id) && (
                                <DropdownMenu
                                  open={openDropdownId === msg.id}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      setOpenDropdownId(msg.id);
                                    } else {
                                      setOpenDropdownId(null);
                                      // Small delay to allow dropdown to close before hiding button
                                      setTimeout(() => {
                                        if (hoveredMessageId !== msg.id) {
                                          setHoveredMessageId(null);
                                        }
                                      }, 100);
                                    }
                                  }}
                                >
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 opacity-70 hover:opacity-100 transition-opacity shrink-0 mt-1"
                                    >
                                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    side="left"
                                    sideOffset={8}
                                    className="w-40 z-50"
                                    onInteractOutside={(e) => {
                                      // Prevent closing when clicking on the message
                                      const target = e.target as HTMLElement;
                                      if (target.closest(`[data-message-id="${msg.id}"]`)) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        setOpenDropdownId(null);
                                        handleStartEdit(msg);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Edit className="mr-2 h-4 w-4" />
                                      <span>Edit message</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        handleDeleteClick(msg.id);
                                      }}
                                      className="cursor-pointer text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Delete message</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {editingMessageId === msg.id ? (
                                <div className="flex-1 mt-1 max-w-md">
                                  <Input
                                    value={editInputValue}
                                    onChange={(e) => setEditInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSaveEdit();
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        handleCancelEdit();
                                      }
                                    }}
                                    className={`text-sm rounded-lg px-3 py-2 mb-2 ${msg.isOwn
                                        ? "bg-[#F9F5E8]"
                                        : "bg-[#F9FAFB]"
                                      }`}
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={handleSaveEdit}
                                      className="h-7 px-3 text-xs"
                                      disabled={!editInputValue.trim()}
                                    >
                                      <Check className="mr-1.5 h-3.5 w-3.5" />
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={handleCancelEdit}
                                      className="h-7 px-3 text-xs"
                                    >
                                      <XIcon className="mr-1.5 h-3.5 w-3.5" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`text-base text-foreground mt-1 min-w-0 max-w-[85%] sm:max-w-md rounded-lg px-3 py-2 flex-1 relative break-words ${msg.is_deleted
                                      ? 'text-muted-foreground'
                                      : msg.isOwn
                                        ? "bg-[#F9F5E8]"
                                        : "bg-[#F9FAFB]"
                                    }`}
                                >
                                  {msg.is_deleted ? (
                                    <span className="text-muted-foreground">removed message</span>
                                  ) : (
                                    <>
                                      {(msg.message_type === 'image' || msg.message_type === 'file') && msg.file_path && (
                                        <>
                                          {msg.message_type === 'image' ? (
                                            <div className="mb-2 relative group">
                                              {msg.file_url ? (
                                                <>
                                                  <img
                                                    src={msg.file_url}
                                                    alt="Shared image"
                                                    className="max-w-full h-auto rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                                                    style={{ maxHeight: '300px' }}
                                                    onClick={() => handleViewImage(msg.file_url!, msg.file_path?.split('/').pop() || 'Image')}
                                                    onError={(e) => {
                                                      // If URL fails, try to get signed URL
                                                      if (msg.file_path) {
                                                        supabase.storage
                                                          .from(BUCKETS.documents)
                                                          .createSignedUrl(msg.file_path, 60 * 60 * 24 * 7)
                                                          .then(({ data }) => {
                                                            if (data?.signedUrl) {
                                                              (e.target as HTMLImageElement).src = data.signedUrl;
                                                            }
                                                          })
                                                          .catch(() => {
                                                            // Try public URL as fallback
                                                            const { data } = supabase.storage
                                                              .from(BUCKETS.documents)
                                                              .getPublicUrl(msg.file_path!);
                                                            if (data?.publicUrl) {
                                                              (e.target as HTMLImageElement).src = data.publicUrl;
                                                            }
                                                          });
                                                      }
                                                    }}
                                                  />
                                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                    <Button
                                                      size="sm"
                                                      variant="secondary"
                                                      className="h-7 w-7 p-0 bg-black/50 hover:bg-black/70 text-white"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleViewImage(msg.file_url!, msg.file_path?.split('/').pop() || 'Image');
                                                      }}
                                                      title="View full size"
                                                    >
                                                      <ZoomIn className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="secondary"
                                                      className="h-7 w-7 p-0 bg-black/50 hover:bg-black/70 text-white"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadFile(msg.file_url!, msg.file_path?.split('/').pop() || 'image');
                                                      }}
                                                      title="Download"
                                                    >
                                                      <Download className="h-3.5 w-3.5" />
                                                    </Button>
                </div>
                                                </>
                                              ) : (
                                                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                                  <span className="text-xs text-muted-foreground">Loading image...</span>
              </div>
                                              )}
            </div>
                                          ) : (
                                            <div className="mb-2 flex items-center gap-2 p-2 bg-background rounded border">
                                              <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                              {msg.file_url ? (
                                                <>
                                                  <a
                                                    href={msg.file_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 hover:underline truncate flex-1"
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      handleDownloadFile(msg.file_url!, msg.file_path?.split('/').pop() || 'file');
                                                    }}
                                                  >
                                                    {msg.file_path.split('/').pop() || 'Download file'}
                                                  </a>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 shrink-0"
                                                    onClick={() => handleDownloadFile(msg.file_url!, msg.file_path?.split('/').pop() || 'file')}
                                                    title="Download"
                                                  >
                                                    <Download className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              ) : (
                                                <span className="text-sm text-muted-foreground truncate flex-1">
                                                  {msg.file_path.split('/').pop() || 'File'} (loading...)
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      )}
                                      {msg.message && (
                                        <div className="text-base break-words whitespace-pre-wrap">
                                          {highlightMessage(msg.message, searchQuery, isHighlighted)}
                                        </div>
                                      )}
                                      {msg.source_channel === "whatsapp" && (
                                        <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wide">
                                          WhatsApp
                                        </p>
                                      )}
                                    </>
                                  )}

                                  {/* Reactions */}
                                  {!msg.is_deleted && (
                                    <>
                                      {/* Display existing reactions */}
                                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                                          {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                                            const userIdsArray = Array.isArray(userIds) ? userIds.filter((id): id is string => typeof id === 'string') : [];
                                            const hasReacted = currentUserId ? userIdsArray.includes(currentUserId) : false;
                                            const count = userIdsArray.length;
                                            return (
                                              <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => handleReaction(msg.id, emoji)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm border transition-colors ${hasReacted
                                                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                                                  }`}
                                                title={`${count} ${count === 1 ? 'reaction' : 'reactions'}`}
                                              >
                                                <span>{emoji}</span>
                                                <span className="text-xs font-medium">{count}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* Add reaction button - absolutely positioned at bottom */}
                                      <div
                                        className={`absolute bottom-[-10px] ${msg.isOwn ? 'left-1' : 'right-1'} transition-opacity duration-200 ${(hoveredMessageId === msg.id || openReactionPickerId === msg.id)
                                            ? 'opacity-100 pointer-events-auto'
                                            : 'opacity-0 pointer-events-none'
                                          }`}
                                      >
                                        <Popover
                                          open={openReactionPickerId === msg.id}
                                          onOpenChange={(open) => {
                                            if (open) {
                                              setOpenReactionPickerId(msg.id);
                                            } else {
                                              setOpenReactionPickerId(null);
                                            }
                                          }}
                                        >
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shadow-sm"
                                              title="Add reaction"
                                            >
                                              <SmilePlus className="h-3.5 w-3.5 text-[#D4AA25]" />
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-64 h-64 p-0" align="start">
                                            <div className="flex flex-col h-full">
                                              <div className="p-2 border-b">
                                                <div className="text-xs font-semibold text-muted-foreground">Add Reaction</div>
                                              </div>
                                              <div className="flex-1 overflow-y-auto p-2">
                                                <div className="grid grid-cols-6 gap-1">
                                                  {Array.from(new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '🎉', '💯', '✅', '❌', '😀', '😍', '🤔', '😴', '👎', '💔', '😊', '😡', '🤯', '😱', '🤗', '🤝', '🙌', '👌', '✌️'])).map((emoji) => (
                                                    <button
                                                      key={emoji}
                                                      type="button"
                                                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                                                      onClick={() => {
                                                        handleReaction(msg.id, emoji);
                                                        setOpenReactionPickerId(null);
                                                      }}
                                                      title={emoji}
                                                    >
                                                      {emoji}
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            );
          })()
        )}

        <div ref={messagesEndRef} />

        {otherTyping && otherParticipant ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-5 w-5">
              {otherParticipant.avatar ? (
                <AvatarImage src={otherParticipant.avatar} alt={otherParticipant.name} />
              ) : null}
              <AvatarFallback>{(otherParticipant.name || 'U').charAt(0)}</AvatarFallback>
            </Avatar>
            <span>typing...</span>
          </div>
        ) : null}

      </div>

      {/* Image View Modal */}
      <Dialog open={!!viewingImageUrl} onOpenChange={(open) => !open && setViewingImageUrl(null)}>
        <DialogContent className="!max-w-[98vw] !max-h-[98vh] !w-[98vw] !h-[98vh] !p-0 bg-black/98 border-none rounded-none">
          {viewingImageUrl && (
            <div className="relative w-full h-full flex flex-col">
              {/* Header with controls */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5 bg-gradient-to-b from-black/90 via-black/80 to-transparent backdrop-blur-lg border-b border-white/10">
                <div className="flex-1 min-w-0 pr-4">
                  {viewingImageName && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
                        <File className="h-5 w-5 text-white/90" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/60 text-xs uppercase tracking-wide mb-0.5">File Name</div>
                        <div className="text-white font-semibold text-lg truncate" title={viewingImageName}>
                          {viewingImageName}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-11 px-5 bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm shadow-lg transition-all font-medium"
                    onClick={() => handleDownloadFile(viewingImageUrl, viewingImageName || 'image')}
                    title="Download"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <DialogClose>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-11 w-11 p-0 bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm shadow-lg transition-all"
                      title="Close (Esc)"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </DialogClose>
                </div>
              </div>

              {/* Image container */}
              <div className="flex-1 flex items-center justify-center p-6 sm:p-8 md:p-12 overflow-auto" style={{ paddingTop: '100px', paddingBottom: '80px' }}>
                <img
                  src={viewingImageUrl}
                  alt={viewingImageName || 'Image'}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxHeight: 'calc(98vh - 180px)' }}
                />
              </div>

              {/* Footer with file info */}
              {viewingImageName && (
                <div className="absolute bottom-0 left-0 right-0 px-6 py-5 bg-gradient-to-t from-black/90 via-black/80 to-transparent backdrop-blur-lg border-t border-white/10">
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
                      <File className="h-4 w-4 text-white/80" />
                    </div>
                    <div className="text-white/90 font-medium text-base truncate max-w-3xl" title={viewingImageName}>
                      {viewingImageName}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Input area - pinned to bottom */}
      <div className="sticky bottom-0 shrink-0 border-t border-border px-6 py-3 bg-background z-10">
        {/* Overall access sends as Pagoda, not as the account holder — say so before they
            type, not after the message lands under someone else's name. */}
        {impersonation ? (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Sending as Pagoda Support
            {impersonation.targetName ? ` — ${impersonation.targetName} will see it as a message from Pagoda.` : "."}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 border border-border rounded-lg px-4 py-2 bg-background">
          <textarea
            ref={inputRef}
            placeholder="Write your message… Press Enter for a new line. Click the send arrow to deliver."
            value={inputValue}
            onChange={handleInputChange}
            rows={4}
            className="flex-1 min-h-16 max-h-48 w-full resize-y border-0 bg-transparent py-2 px-0 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:outline-none shadow-none overflow-y-auto"
          />

          <div className="flex items-center justify-between">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              disabled={uploading}
            />
            <div className="flex items-center gap-1">
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
            <Button
                    type="button"
              variant="ghost"
              size="icon"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title="Add emoji"
                  >
                    <Smile size={20} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 h-96 p-0" align="start">
                  <div className="flex flex-col h-full">
                    <div className="p-3 border-b">
                      <div className="text-sm font-semibold">Emoji</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                      {Object.entries(emojiCategories).map(([category, emojis]) => (
                        <div key={category} className="mb-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2 px-2">{category}</div>
                          <div className="grid grid-cols-8 gap-1">
                            {emojis.map((emoji, idx) => (
                              <button
                                key={`${category}-${idx}`}
                                type="button"
                                className="w-9 h-9 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                                onClick={() => handleEmojiSelect(emoji)}
                                title={emoji}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Upload file or photo"
              >
                {uploading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
              <Paperclip size={20} />
                )}
            </Button>
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim()}
              className="shrink-0 disabled:opacity-50"
              title="Send message"
              aria-label="Send message"
            >
              <Image src={SendIcon} alt="Send" width={24} height={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => {
        if (!open) setDeleteConfirmId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Assistance Required</h3>
            <Textarea
              value={alertMessage}
              onChange={(e) => setAlertMessage(e.target.value)}
              placeholder="What do you need help with?"
              rows={4}
              disabled={alertSending}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={alertSending}
                onClick={() => setAlertOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={alertSending || !alertMessage.trim() || !chatId}
                onClick={async () => {
                  if (!chatId || !alertMessage.trim()) return;
                  setAlertSending(true);
                  try {
                    const res = await fetch("/api/panic", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        chat_id: chatId,
                        message: alertMessage.trim(),
                        mark_solved: false,
                      }),
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                      throw new Error(data?.error || "Failed to send alert");
                    }
                    toast.success("Alert sent to Pagoda support");
                    setAlertOpen(false);
                    setAlertMessage("");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to send alert");
                  } finally {
                    setAlertSending(false);
                  }
                }}
              >
                {alertSending ? "Sending…" : "Send alert"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
