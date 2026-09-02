import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePresenceDisplay } from "@/lib/presence";

/** One email per recipient per chat during this window (follow-up messages stay in-app). */
export const CHAT_EMAIL_COOLDOWN_MS = 30 * 60 * 1000;

export function recipientIsActiveInApp(row: {
  presence_state?: string | null;
  presence_updated_at?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  const display = derivePresenceDisplay(row.presence_state, row.presence_updated_at);
  return display === "online" || display === "idle";
}

/**
 * Returns true if we should send a chat notification email now.
 * Claims the cooldown slot atomically enough for this app (upsert after check).
 */
export async function claimChatEmailSlot(
  supabase: SupabaseClient,
  chatId: string,
  recipientKey: string
): Promise<boolean> {
  const key = String(recipientKey || "").trim();
  const id = String(chatId || "").trim();
  if (!key || !id) return false;

  try {
    const { data, error } = await supabase
      .from("chat_email_cooldowns")
      .select("last_sent_at")
      .eq("chat_id", id)
      .eq("recipient_key", key)
      .maybeSingle();

    if (error) {
      // Table missing until migration — do not flood; skip extra emails only if we can track.
      if (/chat_email_cooldowns|does not exist|schema cache/i.test(error.message || "")) {
        return true;
      }
      console.warn("[chat-email] cooldown lookup failed", error.message);
      return true;
    }

    if (data?.last_sent_at) {
      const t = new Date(String(data.last_sent_at)).getTime();
      if (Number.isFinite(t) && Date.now() - t < CHAT_EMAIL_COOLDOWN_MS) {
        return false;
      }
    }

    const { error: upErr } = await supabase.from("chat_email_cooldowns").upsert(
      {
        chat_id: id,
        recipient_key: key,
        last_sent_at: new Date().toISOString(),
      },
      { onConflict: "chat_id,recipient_key" }
    );
    if (upErr) {
      console.warn("[chat-email] cooldown upsert failed", upErr.message);
    }
    return true;
  } catch (e) {
    console.warn("[chat-email] cooldown error", e);
    return true;
  }
}
