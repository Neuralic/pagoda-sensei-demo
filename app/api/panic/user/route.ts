import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { EnrichedPanic } from "@/app/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // 1. Get userId from cookies
    const jar = await cookies();
    const userId = jar.get("userId")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServer();

    // 2. Fetch messages where user is sender OR receiver
    const { data: panicList, error } = await supabase
      .from("panic")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = panicList ?? [];

    // Unread = messages addressed to this user that they have not read yet
    const unreadCount = rows.filter(
      (p) => p.receiver_id === userId && p.is_read === false
    ).length;

    // 3. Helper: get sender/receiver name
    const getName = async (id: string | null) => {
      if (!id) return null;

      const { data: user } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", id)
        .maybeSingle();

      if (user) return `${user.first_name} ${user.last_name}`;

      const { data: admin } = await supabase
        .from("admin")
        .select("first_name, last_name")
        .eq("id", id)
        .maybeSingle();

      if (admin) return `${admin.first_name} ${admin.last_name}`;

      return null;
    };

    // 4. Enrich all messages
    const enriched = await Promise.all(
      rows.map(async (p) => {
        const senderName = await getName(p.sender_id);
        const receiverName = await getName(p.receiver_id);

        const { data: job } = await supabase
          .from("jobs")
          .select("name")
          .eq("id", p.ticket_id)
          .single();

        return {
          ...p,
          sender_name: senderName,
          receiver_name: receiverName,
          job_name: job?.name || null,
        };
      })
    );

    // 5. Group by ticket_id → keep only LAST message
    const lastMessages = Object.values(
      enriched.reduce<{ [key: string]: EnrichedPanic }>((acc, msg) => {
        const tId = msg.ticket_id;

        if (
          !acc[tId] ||
          new Date(msg.created_at) > new Date(acc[tId].created_at)
        ) {
          acc[tId] = msg;
        }
        return acc;
      }, {})
    );

    return NextResponse.json({
      ok: true,
      allJobAlert: lastMessages, // only the last message per ticket_id
      unreadCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

/** Mark panic messages addressed to the current user as read (optionally one ticket). */
export async function PATCH(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
    } | null;

    const ticketId =
      typeof body?.ticket_id === "string" && body.ticket_id.trim()
        ? body.ticket_id.trim()
        : null;

    const supabase = getSupabaseServer();

    let query = supabase
      .from("panic")
      .update({ is_read: true })
      .eq("receiver_id", userId)
      .eq("is_read", false);

    if (ticketId) {
      query = query.eq("ticket_id", ticketId);
    }

    const { data, error } = await query.select("id");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      updated: data?.length ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
