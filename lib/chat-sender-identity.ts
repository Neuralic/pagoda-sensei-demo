/**
 * Who is really writing a chat message.
 *
 * Admin overall-access swaps the session cookies to the target account: `userId` and `role`
 * become the advisor's, and only `impersonator_id` remembers that an admin is driving. Code
 * that read `role` alone concluded the advisor had sent the message — so a Pagoda admin
 * writing to an advisor from inside their itinerary stored the message as *from* that advisor
 * and emailed the notification to the admin team, i.e. back to themselves.
 *
 * Every chat write path resolves identity through here so "who sent this" and "who should be
 * told" are answered once, from the same source.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readImpersonation } from "@/lib/admin-impersonation";

export const PAGODA_SUPPORT_SENDER_NAME = "Pagoda Support";

type CookieJar = { get: (name: string) => { value: string } | undefined };

export type ChatSenderIdentity = {
  /** Whose id goes on the message row — the admin when one is acting through an account. */
  senderId: string;
  /** "admin" whenever an admin is writing, impersonating or not. */
  senderRole: string;
  /** True only when an admin is writing from inside someone else's session. */
  isAdminActing: boolean;
  /** The account whose session is in use — the advisor during overall access. */
  sessionUserId: string;
  displayName: string;
};

/**
 * Resolve the acting sender. Returns null when there is no session at all.
 *
 * `supabase` is used only to look up the display name; identity itself comes from cookies.
 */
export async function resolveChatSenderIdentity(
  jar: CookieJar,
  supabase: SupabaseClient
): Promise<ChatSenderIdentity | null> {
  const sessionUserId = jar.get("userId")?.value;
  const sessionRole = jar.get("role")?.value;
  if (!sessionUserId) return null;

  const impersonation = readImpersonation(jar);
  const adminId = impersonation?.adminId ?? (sessionRole === "admin" ? sessionUserId : null);

  if (adminId) {
    const { data: admin } = await supabase
      .from("admin")
      .select("first_name, last_name")
      .eq("id", adminId)
      .maybeSingle();

    return {
      senderId: adminId,
      senderRole: "admin",
      isAdminActing: Boolean(impersonation),
      sessionUserId,
      displayName:
        [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() ||
        PAGODA_SUPPORT_SENDER_NAME,
    };
  }

  const { data: user } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", sessionUserId)
    .maybeSingle();

  return {
    senderId: sessionUserId,
    senderRole: sessionRole || "",
    isAdminActing: false,
    sessionUserId,
    displayName:
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || "You",
  };
}
