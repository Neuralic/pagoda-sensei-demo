/**
 * Itinerary support chat (Pagoda admin ↔ travel advisor on a specific trip).
 * Pure helpers used by API routes and test scripts.
 */

export const PAGODA_SUPPORT_PEER_ID = "pagoda-support";

export type ChatListRow = {
  id: string;
  job_id?: string | null;
  application_id?: string | null;
  agency_id?: string | null;
  guide_id?: string | null;
  client_name?: string | null;
  chat_kind?: string | null;
  itinerary_id?: string | null;
  created_at: string;
};

export type EnrichedChatListItem = {
  id: string;
  chatId: string;
  jobId: string | null;
  applicationId: string | null;
  clientName: string | null;
  chatKind: "itinerary_support" | "marketplace";
  itineraryId: string | null;
  otherParticipant: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    role: string | null;
  };
  lastMessage: string;
  lastMessageTime: string;
  createdAt: string;
};

export function isItinerarySupportChatKind(
  chatKind: string | null | undefined
): boolean {
  return chatKind === "itinerary_support";
}

/** Advisor inbox: show Pagoda Support as the counterparty. */
export function enrichItinerarySupportChatForAdvisorList(
  chat: ChatListRow,
  meId: string,
  lastMessages: Record<string, { content: string; created_at: string } | null>
): EnrichedChatListItem | null {
  if (!isItinerarySupportChatKind(chat.chat_kind)) return null;
  const agencyId = chat.agency_id;
  if (!agencyId || agencyId !== meId) return null;

  const tripLabel = chat.client_name?.trim() || "Itinerary";
  const lastMessage = lastMessages[chat.id]?.content || "";
  const lastMessageTime = lastMessages[chat.id]?.created_at || chat.created_at;

  return {
    id: chat.id,
    chatId: chat.id,
    jobId: chat.job_id ?? null,
    applicationId: chat.application_id ?? null,
    clientName: tripLabel,
    chatKind: "itinerary_support",
    itineraryId: chat.itinerary_id ?? null,
    otherParticipant: {
      id: PAGODA_SUPPORT_PEER_ID,
      name: "Pagoda Support",
      email: null,
      avatarUrl: null,
      role: "admin",
    },
    lastMessage,
    lastMessageTime,
    createdAt: chat.created_at,
  };
}

/** Resolve "other" participant for chat meta when guide_id is null. */
export function resolveSupportChatOtherParticipant(
  chat: Pick<ChatListRow, "chat_kind" | "agency_id" | "guide_id">,
  meId: string,
  meRole: string | null | undefined,
  builtPerson: (userId: string) => {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  }
): { id: string; name: string; email: string | null; avatarUrl: string | null } {
  if (!isItinerarySupportChatKind(chat.chat_kind)) {
    const agencyId = String(chat.agency_id || "");
    const guideId = String(chat.guide_id || "");
    return meId === agencyId ? builtPerson(guideId) : builtPerson(agencyId);
  }

  if (meRole === "admin" || meId !== chat.agency_id) {
    return builtPerson(String(chat.agency_id || ""));
  }

  return {
    id: PAGODA_SUPPORT_PEER_ID,
    name: "Pagoda Support",
    email: null,
    avatarUrl: null,
  };
}

export type SupportNotifyDecision = {
  shouldEmail: boolean;
  skipReason?: "no_recipient_email" | "cooldown" | "none";
};

/**
 * Admin → advisor on itinerary support: always attempt email (ignore in-app presence).
 * Advisor → admin: keep presence + cooldown behavior via caller.
 */
export function shouldEmailAdvisorForAdminSupportMessage(opts: {
  senderIsAdmin: boolean;
  advisorEmail: string | null | undefined;
  cooldownAllowed: boolean;
}): SupportNotifyDecision {
  if (!opts.senderIsAdmin) {
    return { shouldEmail: false, skipReason: "none" };
  }
  const email = String(opts.advisorEmail || "").trim();
  if (!email) {
    return { shouldEmail: false, skipReason: "no_recipient_email" };
  }
  if (!opts.cooldownAllowed) {
    return { shouldEmail: false, skipReason: "cooldown" };
  }
  return { shouldEmail: true };
}

export function buildAdvisorSupportChatOpenUrl(
  baseUrl: string,
  opts: { chatId: string; itineraryId?: string | null }
): string {
  const base = baseUrl.replace(/\/$/, "");
  const chatId = encodeURIComponent(opts.chatId);
  // Prefer Messages inbox now that support threads appear there.
  const path = `/agent/conversation?chatId=${chatId}`;
  return base ? `${base}${path}` : path;
}

export function buildAdminSupportChatOpenUrl(
  baseUrl: string,
  opts: { chatId: string; itineraryId?: string | null }
): string {
  const base = baseUrl.replace(/\/$/, "");
  const chatId = encodeURIComponent(opts.chatId);
  const itineraryId = opts.itineraryId?.trim();
  const path = itineraryId
    ? `/admin/itineraries/${encodeURIComponent(itineraryId)}/edit?openChat=1`
    : `/admin/conversations?chatId=${chatId}`;
  return base ? `${base}${path}` : path;
}
