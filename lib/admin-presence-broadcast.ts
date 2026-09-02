import { after } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { ADMIN_USER_PRESENCE_CHANNEL } from "@/lib/admin-user-presence-channel";
import { authLog } from "@/lib/ops-log";

export type UserPresenceBroadcastPayload = {
  userId: string;
  presence_state: string;
  presence_updated_at: string;
};

/**
 * Realtime `httpSend` opens a connection and waits for an ack. Long enough to survive a slow
 * hop, short enough that it cannot dominate the invocation it is attached to.
 */
const BROADCAST_TIMEOUT_MS = 3_000;

/**
 * Push a presence change to admin subscribers via Supabase Realtime.
 *
 * This used to be a detached `void (async () => …)` with a 15-second timeout. In a serverless
 * function the invocation ends as soon as the response is written, so the pending send was
 * aborted every single time — 1,953 `AbortError` warnings in one 8-hour window of production
 * logs, and not one broadcast ever delivered. The giveaway was that most of them were logged
 * under `/api/panic/user`, a route that never calls this: they were orphaned promises from
 * earlier invocations dying on a later one.
 *
 * `after()` registers the work with the runtime so it runs once the response is sent and the
 * invocation is kept alive for it.
 */
export function broadcastUserPresenceUpdate(payload: UserPresenceBroadcastPayload): void {
  after(async () => {
    let supabase: ReturnType<typeof getSupabaseServer>;
    try {
      supabase = getSupabaseServer();
    } catch {
      return;
    }

    const channel = supabase.channel(ADMIN_USER_PRESENCE_CHANNEL);
    try {
      await channel.httpSend("presence", payload, { timeout: BROADCAST_TIMEOUT_MS });
    } catch (e) {
      // A missed presence tick is cosmetic — the admin list re-derives from
      // presence_updated_at — so this stays a warning, but it is now a real signal rather
      // than something that fired several times a minute regardless of health.
      authLog.warn("presence.broadcast_failed", {
        userId: payload.userId,
        state: payload.presence_state,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      try {
        await supabase.removeChannel(channel);
      } catch {
        /* channel teardown is best-effort */
      }
    }
  });
}
