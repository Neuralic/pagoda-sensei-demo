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
 * Admin overall access — read a conversation and its messages.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { chatId } = await context.params;
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "Chat id required" }, { status: 400 });
    }

    const { data: chat, error: chatErr } = await auth.supabase
      .from("chats")
      .select("id, job_id, application_id, agency_id, guide_id, client_name, created_at")
      .eq("id", chatId)
      .maybeSingle();

    if (chatErr) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
    if (!chat) {
      return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
    }

    const participantIds = [chat.agency_id, chat.guide_id].filter(Boolean) as string[];

    const [usersRes, messagesRes] = await Promise.all([
      auth.supabase
        .from("users")
        .select("id, first_name, last_name, email, role")
        .in("id", participantIds),
      auth.supabase
        .from("chat_messages")
        .select(
          "id, chat_id, sender_id, message, message_type, file_path, created_at, is_deleted, is_edited, source_channel"
        )
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(300),
    ]);

    const usersById = new Map(
      (usersRes.data ?? []).map((u) => [u.id as string, u])
    );

    const senderIds = [
      ...new Set((messagesRes.data ?? []).map((m) => m.sender_id).filter(Boolean)),
    ] as string[];

    const { data: profiles } =
      senderIds.length > 0
        ? await auth.supabase
            .from("profiles")
            .select("user_id, profile_picture_path")
            .in("user_id", senderIds)
        : { data: [] };

    const profileByUser = new Map(
      (profiles ?? []).map((p) => [p.user_id as string, p.profile_picture_path])
    );

    const messages = await Promise.all(
      (messagesRes.data ?? []).map(async (msg) => {
        const sender = usersById.get(msg.sender_id as string);
        const raw = (msg.message as string) || "";
        const displayMessage =
          msg.is_deleted || msg.message_type !== "text"
            ? raw
            : maskSensitiveChatContent(raw);

        let avatarUrl: string | null = null;
        const path = profileByUser.get(msg.sender_id as string);
        if (path && typeof path === "string" && !path.startsWith("http")) {
          try {
            const { data: signed } = await auth.supabase.storage
              .from(BUCKETS.avatars)
              .createSignedUrl(path, 60 * 60);
            avatarUrl = signed?.signedUrl ?? null;
          } catch {
            avatarUrl = null;
          }
        } else if (path?.startsWith("http")) {
          avatarUrl = path;
        }

        return {
          id: msg.id,
          sender_id: msg.sender_id,
          sender_name: displayName(sender ?? null),
          sender_avatar: avatarUrl,
          message: displayMessage,
          message_type: msg.message_type,
          file_path: msg.file_path,
          created_at: msg.created_at,
          is_deleted: msg.is_deleted,
          is_edited: msg.is_edited,
          source_channel: msg.source_channel,
        };
      })
    );

    const agency = usersById.get(chat.agency_id as string);
    const guide = usersById.get(chat.guide_id as string);

    return NextResponse.json({
      ok: true,
      chat: {
        id: chat.id,
        job_id: chat.job_id,
        application_id: chat.application_id,
        client_name: chat.client_name,
        created_at: chat.created_at,
        agency: agency
          ? { id: agency.id, name: displayName(agency), email: agency.email }
          : null,
        guide: guide
          ? { id: guide.id, name: displayName(guide), email: guide.email }
          : null,
      },
      messages,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
