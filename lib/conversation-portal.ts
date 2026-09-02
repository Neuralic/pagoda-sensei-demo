export type ConversationPortal = "guide" | "agent" | "agency";

export function isAdvisorRole(role: string | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  return r === "agent" || r === "agency";
}

/** Conversation inbox path prefix for a marketplace role. */
export function conversationPortalForRole(role: string | null | undefined): ConversationPortal {
  const r = String(role || "").toLowerCase();
  if (r === "guide") return "guide";
  if (r === "agency") return "agency";
  return "agent";
}

export function conversationBasePath(portal: ConversationPortal): string {
  if (portal === "guide") return "/guide/conversation";
  if (portal === "agency") return "/agency/conversation";
  return "/agent/conversation";
}

export function conversationPathWithChatId(portal: ConversationPortal, chatId: string): string {
  const params = new URLSearchParams({ chatId: String(chatId).trim() });
  return `${conversationBasePath(portal)}?${params.toString()}`;
}

/**
 * When an advisor opens a link meant for the other portal (/agent vs /agency),
 * rewrite to the portal that matches their role (preserves query string).
 */
export function advisorConversationPathForRole(
  pathname: string,
  search: string,
  role: string | null | undefined
): string | null {
  if (!pathname.startsWith("/agent/conversation") && !pathname.startsWith("/agency/conversation")) {
    return null;
  }
  const portal = conversationPortalForRole(role);
  const expectedBase = conversationBasePath(portal);
  if (pathname === expectedBase) return null;
  if (portal === "agency" && pathname.startsWith("/agent/conversation")) {
    return pathname.replace(/^\/agent/, "/agency") + search;
  }
  if (portal === "agent" && pathname.startsWith("/agency/conversation")) {
    return pathname.replace(/^\/agency/, "/agent") + search;
  }
  return null;
}

/** Guide vs advisor inbox when a deep link uses the wrong portal. */
export function normalizeConversationPathForRole(
  pathname: string,
  search: string,
  role: string | null | undefined
): string | null {
  const advisorFix = advisorConversationPathForRole(pathname, search, role);
  if (advisorFix) return advisorFix;

  const portal = conversationPortalForRole(role);
  const expected = conversationBasePath(portal);
  const isConversationPath =
    pathname === "/guide/conversation" ||
    pathname === "/agent/conversation" ||
    pathname === "/agency/conversation";

  if (!isConversationPath) return null;
  if (pathname === expected) return null;

  if (isAdvisorRole(role) && pathname.startsWith("/guide/conversation")) {
    return expected + search;
  }
  if (portal === "guide" && (pathname.startsWith("/agent/conversation") || pathname.startsWith("/agency/conversation"))) {
    return expected + search;
  }
  return null;
}
