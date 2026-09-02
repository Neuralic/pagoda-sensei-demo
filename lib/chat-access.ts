import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatRow = {
  id: string;
  agency_id: string | null;
  guide_id: string | null;
  chat_kind?: string | null;
  itinerary_id?: string | null;
  client_name?: string | null;
  job_id?: string | null;
  application_id?: string | null;
};

/**
 * Allow access if the user is agency_id, guide_id, listed in chat_participants,
 * or an active admin on an itinerary_support chat.
 */
export async function assertUserCanAccessChat(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  opts?: { role?: string | null }
): Promise<{ ok: true; chat: ChatRow } | { ok: false; status: number; error: string }> {
  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, agency_id, guide_id, chat_kind, itinerary_id, client_name, job_id, application_id")
    .eq("id", chatId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Database error" };
  }
  if (!chat) {
    return { ok: false, status: 404, error: "Chat not found" };
  }

  if (chat.agency_id === userId || chat.guide_id === userId) {
    return { ok: true, chat: chat as ChatRow };
  }

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (participant) {
    return { ok: true, chat: chat as ChatRow };
  }

  // Admins may not be in chat_participants if user_id FK → users only.
  // Grant access to itinerary_support threads for any active admin session.
  if (opts?.role === "admin" && chat.chat_kind === "itinerary_support") {
    const { data: admin } = await supabase
      .from("admin")
      .select("id")
      .eq("id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (admin) {
      return { ok: true, chat: chat as ChatRow };
    }
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

export function isItinerarySupportChat(chat: Pick<ChatRow, "chat_kind">): boolean {
  return chat.chat_kind === "itinerary_support";
}
