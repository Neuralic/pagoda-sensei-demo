import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  sendAgentTransferzResultEmail,
  type AgentTransferzResultEmailOptions,
} from "@/lib/mailer";

/** Provider booking id and journey code from a stored Transferz payload (for emails). */
export function transferzPayloadRefsForAgentEmail(payload: Record<string, unknown>): {
  providerBookingId: string | null;
  journeyCode: string | null;
} {
  const bid = payload.bookingId;
  const providerBookingId =
    typeof bid === "number" && Number.isFinite(bid)
      ? String(Math.trunc(bid))
      : typeof bid === "string" && bid.trim()
        ? bid.trim()
        : null;
  const jc = payload.journeyCode;
  const journeyCode =
    typeof jc === "string" && jc.trim()
      ? jc.trim()
      : typeof jc === "number" && Number.isFinite(jc)
        ? String(Math.trunc(jc))
        : null;
  return { providerBookingId, journeyCode };
}

/**
 * Load the agent's email and send a Transferz outcome notification (fire-and-forget).
 */
export function notifyAgentTransferzByUserId(
  userId: string,
  options: AgentTransferzResultEmailOptions
): void {
  void (async () => {
    try {
      const supabase = getSupabaseServer();
      const { data: user, error } = await supabase
        .from("users")
        .select("email, first_name, last_name")
        .eq("id", userId)
        .maybeSingle();
      if (error || !user) return;
      const toEmail = typeof user.email === "string" ? user.email.trim() : "";
      if (!toEmail) return;
      const agentName =
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Agent";
      await sendAgentTransferzResultEmail(toEmail, agentName, options);
    } catch (e) {
      console.error("[notifyAgentTransferzByUserId]", e);
    }
  })();
}
