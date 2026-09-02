import type { SupabaseClient } from "@supabase/supabase-js";

/** Travel advisor / agency side of a marketplace chat. */
export function isAgencyChatRole(role: string | null | undefined): boolean {
  return role === "agent" || role === "agency";
}

/** Guide side of a marketplace chat. */
export function isGuideChatRole(role: string | null | undefined): boolean {
  return role === "guide";
}

/**
 * Chats are agent ↔ guide only. Reject pairs where either side has the wrong
 * users.role (e.g. another travel advisor stored as guide_id).
 */
export async function assertAgentGuideChatPair(
  supabase: SupabaseClient,
  agencyId: string,
  guideId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (agencyId === guideId) {
    return { ok: false, error: "Cannot start a chat with yourself", status: 400 };
  }

  const { data: rows, error } = await supabase
    .from("users")
    .select("id, role, first_name, last_name")
    .in("id", [agencyId, guideId]);

  if (error) {
    return { ok: false, error: "Could not verify chat participants", status: 500 };
  }

  const byId = new Map((rows || []).map((r) => [String(r.id), r]));
  const agency = byId.get(agencyId);
  const guide = byId.get(guideId);

  if (!agency || !guide) {
    return { ok: false, error: "Chat participant not found", status: 404 };
  }

  if (!isAgencyChatRole(agency.role as string | null)) {
    return {
      ok: false,
      error: "The agency side must be a travel advisor account",
      status: 400,
    };
  }

  if (!isGuideChatRole(guide.role as string | null)) {
    return {
      ok: false,
      error: "You can only message guides — this account is not a guide",
      status: 400,
    };
  }

  return { ok: true };
}

/** True when both chat columns point at the expected roles. */
export function isValidAgentGuideChatPair(
  agencyRole: string | null | undefined,
  guideRole: string | null | undefined
): boolean {
  return isAgencyChatRole(agencyRole) && isGuideChatRole(guideRole);
}
