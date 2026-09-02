import type { ConversationPortal } from "@/lib/conversation-portal";
import {
  conversationBasePath,
  conversationPortalForRole,
} from "@/lib/conversation-portal";

/**
 * Full URL to open a specific chat thread. Used in notification emails and
 * matches paths handled by guide/agent/agency conversation pages (?chatId=…).
 */
export function getConversationDeepLinkUrl(
  recipientPortal: ConversationPortal,
  chatId: string
): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const path = `${conversationBasePath(recipientPortal)}?chatId=${encodeURIComponent(chatId)}`;
  return `${base}${path}`;
}

/** Login URL that returns to the conversation after sign-in (mobile email clients). */
export function getConversationLoginDeepLinkUrl(
  recipientPortal: ConversationPortal,
  chatId: string
): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const afterLogin = `${conversationBasePath(recipientPortal)}?chatId=${encodeURIComponent(chatId)}`;
  const loginPath = recipientPortal === "guide" ? "/guide/login" : "/agent/login";
  return `${base}${loginPath}?redirect=${encodeURIComponent(afterLogin)}`;
}

export function conversationPortalFromUserRole(
  role: string | null | undefined
): ConversationPortal {
  return conversationPortalForRole(role);
}
