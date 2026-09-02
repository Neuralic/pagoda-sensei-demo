import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { MiniUser } from "@/app/types";
import { requireSessionActor } from "@/lib/itinerary-access";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ panic_id: string }> }
) {
  // Panic alerts carry the reporter's identity and location — never anonymous.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const { panic_id } = await context.params;

    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get("job_id");

    if (!panic_id || !job_id) {
      return NextResponse.json(
        { ok: false, error: "Missing panic_id or job_id" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Fetch panic messages
    const { data: panicList, error } = await supabase
      .from("panic")
      .select("*")
      .eq("ticket_id", job_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Utility: fetch name from users OR admin
    const getName = async (id: string) => {
      if (!id) return null;

      // Try USERS first
      const { data: user } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", id)
        .maybeSingle();

      if (user) {
        return `${user.first_name} ${user.last_name}`;
      }

      // Try ADMIN if not found in users
      const { data: admin } = await supabase
        .from("admin")
        .select("first_name, last_name")
        .eq("id", id)
        .maybeSingle();

      if (admin) {
        return `${admin.first_name} ${admin.last_name}`;
      }

      return null;
    };

    // Enrich all panic rows
    const enriched = await Promise.all(
      panicList.map(async (p) => {
        const senderName = await getName(p.sender_id);
        const receiverName = await getName(p.receiver_id);

        // Job info
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

    return NextResponse.json({
      ok: true,
      panicList: enriched,
    });

  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}


export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ panic_id: string }> }
) {
  // Panic alerts carry the reporter's identity and location — never anonymous.
  const session = await requireSessionActor();
  if (!session.ok) return session.response;

  try {
    const { panic_id } = await context.params;

    if (!panic_id) {
      return NextResponse.json({ ok: false, error: "Missing panic_id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // 1) Get all messages for this user
    const { data: panicRows, error: panicError } = await supabase
      .from("panic")
      .select("ticket_id")
      .eq("sender_id", panic_id);

    if (panicError) {
      return NextResponse.json({ ok: false, error: panicError.message }, { status: 500 });
    }

    const ticketIds = Array.from(
      new Set(
        (panicRows ?? [])
          .map((p) => p.ticket_id)
          .filter((id): id is string => !!id)
      )
    );

    if (!ticketIds.length) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // 2) Update all messages in those tickets
    const { data, error: updateError } = await supabase
      .from("panic")
      .update({ is_read: true })
      .in("ticket_id", ticketIds)
      .select();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
