import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";

export const dynamic = "force-dynamic";

/**
 * POST /api/chats/[chatId]/unread
 * Mark a conversation as unread (email-style reminder).
 */
export async function POST(_req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const jar = await cookies();
    const meId = jar.get("userId")?.value;
    if (!meId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { chatId } = await context.params;
    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(meId, supabase);
    if (activityBlock) return activityBlock;

    const { data: chat } = await supabase
      .from("chats")
      .select("id, agency_id, guide_id")
      .eq("id", chatId)
      .maybeSingle();

    if (!chat || (chat.agency_id !== meId && chat.guide_id !== meId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: lastFromOther } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("chat_id", chatId)
      .neq("sender_id", meId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastFromOther?.created_at) {
      return NextResponse.json({
        ok: true,
        unreadCount: 0,
        lastReadAt: null,
        message: "No messages from the other party to mark as unread.",
      });
    }

    const lastReadAt = new Date(
      new Date(lastFromOther.created_at as string).getTime() - 1
    ).toISOString();

    const { error } = await supabase
      .from("chat_participants")
      .upsert(
        { chat_id: chatId, user_id: meId, last_read_at: lastReadAt },
        { onConflict: "chat_id,user_id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { count, error: countErr } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .neq("sender_id", meId)
      .gt("created_at", lastReadAt);

    const unreadCount = countErr ? 1 : typeof count === "number" ? count : 1;

    return NextResponse.json({ ok: true, unreadCount, lastReadAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
