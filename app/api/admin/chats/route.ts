import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { BUCKETS } from "@/lib/buckets";
import { maskSensitiveChatContent } from "@/lib/chat-message-sanitize";

export const runtime = "nodejs";

function displayName(
  u: { first_name?: string | null; last_name?: string | null; email?: string | null } | null
): string {
  if (!u) return "User";
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return name || u.email || "User";
}

/**
 * Admin overall access — list platform conversations with optional user filter.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const offset = (page - 1) * perPage;
    const userId = (searchParams.get("userId") || "").trim();
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    let query = auth.supabase
      .from("chats")
      .select(
        "id, job_id, application_id, agency_id, guide_id, client_name, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.or(`agency_id.eq.${userId},guide_id.eq.${userId}`);
    }

    const { data: chats, error, count } = await query.range(offset, offset + perPage - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    if (!chats || chats.length === 0) {
      return NextResponse.json({
        ok: true,
        chats: [],
        total: count ?? 0,
        page,
        perPage,
      });
    }

    const chatIds = chats.map((c) => c.id);
    const userIds = new Set<string>();
    for (const c of chats) {
      if (c.agency_id) userIds.add(c.agency_id as string);
      if (c.guide_id) userIds.add(c.guide_id as string);
    }

    const [usersRes, lastMessagesRes] = await Promise.all([
      auth.supabase
        .from("users")
        .select("id, first_name, last_name, email, role")
        .in("id", Array.from(userIds)),
      auth.supabase
        .from("chat_messages")
        .select("chat_id, message, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(chatIds.length * 2, 500)),
    ]);

    const usersById = new Map(
      (usersRes.data ?? []).map((u) => [u.id as string, u])
    );

    const lastByChat = new Map<string, { message: string; created_at: string }>();
    for (const row of lastMessagesRes.data ?? []) {
      const cid = row.chat_id as string;
      if (!lastByChat.has(cid)) {
        lastByChat.set(cid, {
          message: (row.message as string) || "",
          created_at: (row.created_at as string) || "",
        });
      }
    }

    let items = chats.map((chat) => {
      const agency = usersById.get(chat.agency_id as string);
      const guide = usersById.get(chat.guide_id as string);
      const last = lastByChat.get(chat.id);
      const preview = last?.message
        ? maskSensitiveChatContent(last.message).slice(0, 120)
        : "";

      return {
        id: chat.id,
        job_id: chat.job_id,
        application_id: chat.application_id,
        client_name: chat.client_name,
        created_at: chat.created_at,
        agency: agency
          ? { id: agency.id, name: displayName(agency), email: agency.email, role: agency.role }
          : null,
        guide: guide
          ? { id: guide.id, name: displayName(guide), email: guide.email, role: guide.role }
          : null,
        last_message: preview,
        last_message_at: last?.created_at || chat.created_at,
      };
    });

    if (search) {
      items = items.filter((item) => {
        const haystack = [
          item.agency?.name,
          item.agency?.email,
          item.guide?.name,
          item.guide?.email,
          item.client_name,
          item.last_message,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    return NextResponse.json({
      ok: true,
      chats: items,
      total: search ? items.length : (count ?? items.length),
      page,
      perPage,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
