import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy default admin receiver for alert threads. */
const FALLBACK_ADMIN_RECEIVER_ID = "104bd4ed-41f9-4a2a-b998-21012ea68b22";

type NotificationItem = {
  id: string;
  type: "panic" | "approval" | "job";
  title: string;
  body: string;
  href: string;
  created_at: string | null;
  ticket_id?: string;
};

/**
 * Admin inbox: unread panic alerts, pending approvals, and jobs needing attention.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { supabase, userId } = auth;

    const [adminRes, unreadPanicRes, pendingUsersRes] = await Promise.all([
      supabase.from("admin").select("id").eq("is_active", true),
      supabase
        .from("panic")
        .select("id, ticket_id, message, created_at, sender_id, receiver_id, is_read, mark_solved")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("users")
        .select("id, first_name, last_name, email, role, created_at", { count: "exact" })
        .in("role", ["agent", "guide"])
        .or("guide_approved.is.null,guide_approved.eq.false")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const adminRows = adminRes.data;
    const unreadPanicRows = unreadPanicRes.data;

    // Optional: jobs released with no applicant notification yet
    let jobsAlertData: Array<{
      id: string;
      name: string | null;
      created_at: string | null;
      released_at: string | null;
    }> = [];
    try {
      const jobsAlertRes = await supabase
        .from("jobs")
        .select("id, name, created_at, released_at, admin_no_applicant_notified_at")
        .not("released_at", "is", null)
        .is("admin_no_applicant_notified_at", null)
        .order("released_at", { ascending: false })
        .limit(20);
      if (!jobsAlertRes.error && jobsAlertRes.data) {
        jobsAlertData = jobsAlertRes.data;
      }
    } catch {
      /* column may not exist in older envs */
    }

    const adminIds = new Set(
      (adminRows ?? []).map((a) => a.id as string).concat(FALLBACK_ADMIN_RECEIVER_ID, userId)
    );

    // Incoming unread = addressed to an admin receiver (or fallback), not sent by an admin
    const incomingUnread = (unreadPanicRows ?? []).filter((row) => {
      const receiver = row.receiver_id as string | null;
      const sender = row.sender_id as string | null;
      if (!receiver || !sender) return false;
      if (adminIds.has(sender)) return false;
      return adminIds.has(receiver) || receiver === FALLBACK_ADMIN_RECEIVER_ID;
    });

    const senderIds = Array.from(
      new Set(incomingUnread.map((r) => r.sender_id as string).filter(Boolean))
    );

    const usersMap = new Map<
      string,
      { name: string; email: string | null; role: string | null }
    >();
    if (senderIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, first_name, last_name, email, role")
        .in("id", senderIds);
      for (const u of users ?? []) {
        const name =
          `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "User";
        usersMap.set(u.id, {
          name,
          email: u.email ?? null,
          role: u.role ?? null,
        });
      }
    }

    // One notification per ticket (most recent unread message)
    const seenTickets = new Set<string>();
    const panicItems: NotificationItem[] = [];
    for (const row of incomingUnread) {
      const ticketId = String(row.ticket_id);
      if (seenTickets.has(ticketId)) continue;
      seenTickets.add(ticketId);
      const sender = usersMap.get(row.sender_id as string);
      const role = sender?.role || "user";
      panicItems.push({
        id: `panic-${ticketId}`,
        type: "panic",
        title: `${sender?.name || "User"} (${role})`,
        body: (row.message as string | null)?.trim().slice(0, 140) || "New support alert",
        href: `/admin/panic?ticket=${encodeURIComponent(ticketId)}`,
        created_at: (row.created_at as string) || null,
        ticket_id: ticketId,
      });
    }

    const pendingUsers = pendingUsersRes.data ?? [];
    const pendingApprovals = pendingUsersRes.count ?? pendingUsers.length;

    const approvalItems: NotificationItem[] = pendingUsers.slice(0, 5).map((u) => {
      const name =
        `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "User";
      return {
        id: `approval-${u.id}`,
        type: "approval" as const,
        title: `${name} awaiting approval`,
        body: `${u.role || "user"} · ${u.email || "no email"}`,
        href: `/admin/user?approvalStatus=pending&search=${encodeURIComponent(u.email || name)}`,
        created_at: (u.created_at as string) || null,
      };
    });

    // Jobs released with no applicants flagged — lightweight signal only
    const jobAlertItems: NotificationItem[] = jobsAlertData.slice(0, 3).map((j) => ({
      id: `job-${j.id}`,
      type: "job" as const,
      title: "Job needs attention",
      body: j.name || "Released job with no applicants yet",
      href: "/admin/jobs",
      created_at: j.released_at || j.created_at || null,
    }));

    const items = [...panicItems, ...approvalItems, ...jobAlertItems].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const unreadPanic = seenTickets.size;
    const jobsNeedingAttention = jobsAlertData.length;
    const total = unreadPanic + pendingApprovals + jobsNeedingAttention;

    return NextResponse.json({
      ok: true,
      total,
      unreadPanic,
      pendingApprovals,
      jobsNeedingAttention,
      items: items.slice(0, 15),
    });
  } catch (e) {
    console.error("[admin/notifications]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

/** Mark panic alert(s) as read for admins. */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
      mark_all?: boolean;
    } | null;

    const ticketId =
      typeof body?.ticket_id === "string" && body.ticket_id.trim()
        ? body.ticket_id.trim()
        : null;
    const markAll = Boolean(body?.mark_all);

    if (!ticketId && !markAll) {
      return NextResponse.json(
        { ok: false, error: "ticket_id or mark_all is required" },
        { status: 400 }
      );
    }

    const { supabase, userId } = auth;
    const { data: adminRows } = await supabase
      .from("admin")
      .select("id")
      .eq("is_active", true);
    const adminIds = [
      ...new Set(
        (adminRows ?? [])
          .map((a) => a.id as string)
          .concat(FALLBACK_ADMIN_RECEIVER_ID, userId)
      ),
    ];

    let query = supabase
      .from("panic")
      .update({ is_read: true })
      .eq("is_read", false)
      .in("receiver_id", adminIds);

    if (ticketId) {
      query = query.eq("ticket_id", ticketId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
