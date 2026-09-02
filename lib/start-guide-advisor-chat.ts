/**
 * Open (or create) an advisor ↔ guide chat from the itinerary UI.
 * Admins act on behalf of the itinerary owner, then enter overall access to view the thread.
 */
import { startAdminOverallAccess } from "@/lib/admin-overall-access-client";

async function ensurePair(opts: {
  agencyId: string;
  guideId: string;
  clientName?: string;
}): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  const res = await fetch("/api/chats/ensure-pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agencyId: opts.agencyId,
      guideId: opts.guideId,
      ...(opts.clientName ? { clientName: opts.clientName } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json?.chatId) {
    return { ok: false, error: json?.error || "Failed to start chat" };
  }
  return { ok: true, chatId: String(json.chatId) };
}

export async function startGuideAdvisorChat(opts: {
  guideId: string;
  /** Advisor/agency user id that owns the itinerary (chat agency_id). */
  advisorUserId: string;
  itineraryName?: string | null;
  itineraryId?: string | null;
}): Promise<{ ok: true; chatId: string; href: string } | { ok: false; error: string }> {
  const guideId = String(opts.guideId || "").trim();
  const advisorUserId = String(opts.advisorUserId || "").trim();
  if (!guideId || !advisorUserId) {
    return { ok: false, error: "Missing information to start chat" };
  }
  if (guideId === advisorUserId) {
    return { ok: false, error: "Cannot message yourself" };
  }

  const clientName = opts.itineraryName?.trim() || "";
  const itineraryId = String(opts.itineraryId || "").trim();

  // Prefer a per-itinerary thread; if that fails (legacy unique pair constraint), open general chat
  let pair = await ensurePair({
    agencyId: advisorUserId,
    guideId,
    ...(clientName ? { clientName } : {}),
  });
  if (!pair.ok && clientName) {
    pair = await ensurePair({ agencyId: advisorUserId, guideId });
  }
  if (!pair.ok) {
    return { ok: false, error: pair.error };
  }

  const chatId = pair.chatId;
  let role: string | null = null;
  try {
    const boot = await fetch("/api/bootstrap", { cache: "no-store" });
    const bootJson = await boot.json().catch(() => null);
    role = bootJson?.user?.role ?? null;
  } catch {
    role = null;
  }

  const params = new URLSearchParams({ chatId });
  if (itineraryId) params.set("itineraryId", itineraryId);
  if (typeof window !== "undefined") {
    const here = `${window.location.pathname}${window.location.search}`;
    if (here.startsWith("/") && !here.includes("/conversation")) {
      params.set("from", here);
    }
  }

  if (role === "admin") {
    const access = await startAdminOverallAccess(advisorUserId);
    if (!access.ok) {
      return {
        ok: false,
        error:
          access.error ||
          "Chat is ready, but could not open the advisor account to view it. Use Access account, then open Messages.",
      };
    }
    return {
      ok: true,
      chatId,
      href: `/agent/conversation?${params.toString()}`,
    };
  }

  const base =
    role === "agency"
      ? "/agency/conversation"
      : role === "guide"
        ? "/guide/conversation"
        : "/agent/conversation";

  return {
    ok: true,
    chatId,
    href: `${base}?${params.toString()}`,
  };
}
