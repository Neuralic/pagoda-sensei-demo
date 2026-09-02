import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { sendAdminAlertNotification } from "@/lib/mailer";
import { getActiveAdminEmails } from "@/lib/admin-emails";
import { requireAdmin } from "@/lib/admin-auth";
import { randomUUID } from "crypto"; // Node.js crypto for UUID

export const dynamic = "force-dynamic";

/** Legacy default admin receiver for alert threads (kept for reply routing). */
const FALLBACK_ADMIN_RECEIVER_ID = "104bd4ed-41f9-4a2a-b998-21012ea68b22";

type MiniUser = {
  id: string;
  phone: string | null;
  role: string | null;
  name: string;
  email: string | null;
  user_image: string | null;
  signedProfileUrl: string | null;
};

type PanicMessage = {
  id: string;
  message: string | null;
  created_at: string;
  sender: MiniUser | null;
  receiver: MiniUser | null;
  status: boolean | null;
  is_read: boolean | null;
};

type GroupedPanic = {
  ticket_id: string;
  mark_solved: boolean | null;
  is_read: boolean | null;
  sender_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  sender_image: string | null;
  role: string | null;
  messages: PanicMessage[];
  first_message_time: string | null;
  last_message_time: string | null;
  total_messages: number;
  is_all_active: boolean;
  is_all_solved: boolean;
  last_message: string | null;
  job_name: string | null;
  job_location: string | null;
  chat_id: string | null;
  has_unread: boolean;
  unread_count: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const jar = await cookies();
    const sessionUserId = jar.get("userId")?.value ?? null;
    const sessionRole = jar.get("role")?.value ?? null;

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const mark_solved = typeof body.mark_solved === "boolean" ? body.mark_solved : false;
    const incomingTicketId =
      typeof body.ticket_id === "string" && body.ticket_id.trim()
        ? body.ticket_id.trim()
        : null;
    const chatId =
      typeof body.chat_id === "string" && body.chat_id.trim() ? body.chat_id.trim() : null;

    // Prefer session user; allow body sender for admin replies to existing tickets.
    const bodySender =
      typeof body.sender_id === "string" && body.sender_id.trim() ? body.sender_id.trim() : null;
    const bodyReceiver =
      typeof body.receiver_id === "string" && body.receiver_id.trim()
        ? body.receiver_id.trim()
        : null;

    const isAdminReply = sessionRole === "admin" && bodyReceiver && bodyReceiver !== sessionUserId;
    const sender_id = isAdminReply
      ? bodySender || sessionUserId || FALLBACK_ADMIN_RECEIVER_ID
      : sessionUserId || bodySender;

    if (!sender_id || !message) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields (message / sender)." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    let ticket_id = incomingTicketId;
    let jobName: string | null = null;

    if (chatId && !ticket_id) {
      const { data: chat } = await supabase
        .from("chats")
        .select("id, job_id")
        .eq("id", chatId)
        .maybeSingle();
      const jobId =
        chat && typeof (chat as { job_id?: string | null }).job_id === "string"
          ? (chat as { job_id: string }).job_id
          : null;
      ticket_id = jobId || chatId;
    }

    ticket_id = ticket_id ?? randomUUID();

    if (ticket_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, name")
        .eq("id", ticket_id)
        .maybeSingle();
      jobName = (job as { name?: string } | null)?.name ?? null;
    }

    const receiver_id = bodyReceiver || FALLBACK_ADMIN_RECEIVER_ID;

    // Inherit ticket solved state so a new reply doesn't reset status to "in progress"
    let effectiveMarkSolved = mark_solved;
    if (incomingTicketId) {
      const { data: existing } = await supabase
        .from("panic")
        .select("mark_solved")
        .eq("ticket_id", ticket_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (existing && existing.length > 0) {
        effectiveMarkSolved = existing.every((row) => row.mark_solved === true);
      }
    }

    const insertRow: Record<string, unknown> = {
      sender_id,
      receiver_id,
      message,
      mark_solved: effectiveMarkSolved,
      ticket_id,
      is_read: false,
    };
    if (chatId) insertRow.chat_id = chatId;

    const { data, error } = await supabase.from("panic").insert([insertRow]).select();

    if (error) {
      // Retry without chat_id if migration not applied yet.
      if (chatId && /chat_id/i.test(error.message || "")) {
        const { data: retryData, error: retryError } = await supabase
          .from("panic")
          .insert([
            {
              sender_id,
              receiver_id,
              message,
              mark_solved: effectiveMarkSolved,
              ticket_id,
              is_read: false,
            },
          ])
          .select();
        if (retryError) {
          console.error("Supabase insert error:", retryError);
          return NextResponse.json(
            { ok: false, error: "Failed to insert alert." },
            { status: 500 }
          );
        }
        void notifyAdminsAboutAlert({
          senderId: sender_id,
          message,
          ticketId: ticket_id,
          chatId,
          jobName,
          isAdminReply: Boolean(isAdminReply),
        });
        return NextResponse.json(
          { ok: true, data: retryData, ticket_id },
          { status: 200 }
        );
      }
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to insert alert." },
        { status: 500 }
      );
    }

    void notifyAdminsAboutAlert({
      senderId: sender_id,
      message,
      ticketId: ticket_id,
      chatId,
      jobName,
      isAdminReply: Boolean(isAdminReply),
    });

    return NextResponse.json({ ok: true, data, ticket_id }, { status: 200 });
  } catch (e) {
    console.error("[panic] exception", e);
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function notifyAdminsAboutAlert(opts: {
  senderId: string;
  message: string;
  ticketId: string;
  chatId: string | null;
  jobName: string | null;
  isAdminReply: boolean;
}) {
  // Don't email admins when an admin is replying into an existing thread.
  if (opts.isAdminReply) return;
  try {
    const supabase = getSupabaseServer();
    const { data: user } = await supabase
      .from("users")
      .select("first_name, last_name, email, role")
      .eq("id", opts.senderId)
      .maybeSingle();
    const senderName =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || "User";
    const adminEmails = await getActiveAdminEmails();
    if (!adminEmails.length) return;
    await sendAdminAlertNotification(adminEmails, {
      senderName,
      senderEmail: user?.email ?? null,
      senderRole: user?.role ?? null,
      message: opts.message,
      ticketId: opts.ticketId,
      chatId: opts.chatId,
      jobName: opts.jobName,
    });
  } catch (e) {
    console.error("[panic] admin alert email failed", e);
  }
}

/** Resolve the advisor/guide who opened the alert (not the admin receiver). */
function resolveRequesterUser(
  rows: Array<{ sender_id?: string | null; receiver_id?: string | null }>,
  usersMap: Record<string, MiniUser>
): MiniUser | null {
  for (const row of rows) {
    if (row.sender_id && row.sender_id !== FALLBACK_ADMIN_RECEIVER_ID) {
      return usersMap[row.sender_id] ?? null;
    }
    if (row.receiver_id && row.receiver_id !== FALLBACK_ADMIN_RECEIVER_ID) {
      return usersMap[row.receiver_id] ?? null;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const supabase = getSupabaseServer();
  const { searchParams } = new URL(req.url);

  const page = parseInt(searchParams.get("page") || "1");
  const perPage = parseInt(searchParams.get("perPage") || "10");
  const searchQuery = (searchParams.get("search") || "").toLowerCase();
  // Back-compat: `filter` used to be the date period; prefer `period` + `status`
  const periodRaw = searchParams.get("period") || searchParams.get("filter") || "all";
  const statusRaw = (searchParams.get("status") || "all").toLowerCase();
  const status =
    statusRaw === "unread" ||
    statusRaw === "solved" ||
    statusRaw === "in_progress" ||
    statusRaw === "open" ||
    statusRaw === "all"
      ? statusRaw
      : "all";
  const period =
    periodRaw === "weekly" || periodRaw === "monthly" || periodRaw === "yearly"
      ? periodRaw
      : "all";
  const ticketParam = searchParams.get("ticket")?.trim() || null;

  // ---------- 0) Filter by date ----------
  const now = new Date();
  let startDate: string | null = null;
  if (period === "weekly") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    startDate = weekAgo.toISOString();
  } else if (period === "monthly") {
    const monthAgo = new Date(now);
    monthAgo.setMonth(now.getMonth() - 1);
    startDate = monthAgo.toISOString();
  } else if (period === "yearly") {
    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    startDate = yearAgo.toISOString();
  }

  try {
    // ---------- 1) Fetch all panic rows ----------
    let panicQuery = supabase.from("panic").select("*").order("ticket_id", { ascending: true }).order("created_at", { ascending: true });
    if (startDate) panicQuery = panicQuery.gte("created_at", startDate);

    const { data: panicRows, error: panicError } = await panicQuery;
    if (panicError) throw panicError;

    const panics = panicRows ?? [];

    // ---------- 2) Collect all sender/receiver user IDs ----------
    const userIds = Array.from(new Set(panics.flatMap(p => [p.sender_id, p.receiver_id]).filter((id): id is string => !!id)));

    // ---------- 3) Users Map ----------
    const usersMap: Record<string, MiniUser> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, phone, first_name, last_name, email, role").in("id", userIds);
      const { data: profiles } = await supabase.from("profiles").select("user_id, profile_picture_path").in("user_id", userIds);

      const profileMap: Record<string, string | null> = {};
      profiles?.forEach((p) => (profileMap[p.user_id] = p.profile_picture_path ?? null));

      users?.forEach((u) => {
        const imagePath = profileMap[u.id] ?? null;
        usersMap[u.id] = {
          id: u.id,
          phone: u.phone ?? null,
          role: u.role ?? null,
          name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
          email: u.email ?? null,
          user_image: imagePath,
          signedProfileUrl: imagePath ?? null,
        };
      });
    }

    // ---------- 4) Group panic messages ----------
    const grouped: Record<string, GroupedPanic> = {};
    const rowsByTicket: Record<string, typeof panics> = {};
    panics.forEach((p) => {
      const key = String(p.ticket_id);
      if (!rowsByTicket[key]) rowsByTicket[key] = [];
      rowsByTicket[key].push(p);
    });

    panics.forEach((p) => {
      const key = String(p.ticket_id);
      const sender = p.sender_id ? usersMap[p.sender_id] ?? null : null;
      const receiver = p.receiver_id ? usersMap[p.receiver_id] ?? null : null;

      if (!grouped[key]) {
        const requester = resolveRequesterUser(rowsByTicket[key] ?? [], usersMap);
        grouped[key] = {
          ticket_id: p.ticket_id,
          mark_solved: p.mark_solved,
          is_read: p.is_read,
          sender_id: requester?.id ?? sender?.id ?? null,
          sender_name: requester?.name ?? sender?.name ?? null,
          sender_email: requester?.email ?? sender?.email ?? null,
          sender_phone: requester?.phone ?? sender?.phone ?? null,
          sender_image: requester?.user_image ?? sender?.user_image ?? null,
          role: requester?.role ?? sender?.role ?? null,
          messages: [],
          first_message_time: null,
          last_message_time: null,
          total_messages: 0,
          is_all_active: true,
          is_all_solved: true,
          last_message: null,
          job_name: null,
          job_location: null,
          chat_id:
            typeof (p as { chat_id?: string | null }).chat_id === "string"
              ? (p as { chat_id: string }).chat_id
              : null,
          has_unread: false,
          unread_count: 0,
        };
      } else if (
        !grouped[key].chat_id &&
        typeof (p as { chat_id?: string | null }).chat_id === "string"
      ) {
        grouped[key].chat_id = (p as { chat_id: string }).chat_id;
      }

      // Keep latest mark_solved from the most recent rows (processed in order)
      grouped[key].mark_solved = p.mark_solved ?? grouped[key].mark_solved;

      grouped[key].messages.push({
        id: p.id,
        message: p.message ?? null,
        created_at: p.created_at,
        sender,
        receiver,
        status: p.mark_solved ?? null,
        is_read: p.is_read ?? null,
      });

      // Unread for admin = unread message from the requester (advisor/guide)
      if (!p.is_read && p.sender_id && p.sender_id === grouped[key].sender_id) {
        grouped[key].has_unread = true;
        grouped[key].unread_count += 1;
      }

      if (!p.is_read) grouped[key].is_all_active = false;
      if (!p.mark_solved) grouped[key].is_all_solved = false;
    });

    let panicList = Object.values(grouped);

    // ---------- 5) Compute first/last message ----------
    panicList.forEach((t) => {
      if (t.messages.length > 0) {
        t.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        t.first_message_time = t.messages[0].created_at;
        const lastMsg = t.messages[t.messages.length - 1];
        t.last_message_time = lastMsg.created_at;
        t.last_message = lastMsg.message ?? null;
        t.total_messages = t.messages.length;
        // Ticket is solved only when every message in the thread is marked solved
        t.mark_solved = t.messages.every((m) => m.status === true);
        t.is_all_solved = t.mark_solved;
      }
    });

    // Sort newest activity first
    panicList.sort((a, b) => {
      const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return tb - ta;
    });

    // ---------- 6) Search by sender_name / email / message ----------
    if (searchQuery) {
      panicList = panicList.filter((p) => {
        const hay = [
          p.sender_name,
          p.sender_email,
          p.role,
          p.job_name,
          p.last_message,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(searchQuery);
      });
    }

    // ---------- 6b) Single-ticket deep link (email notifications) ----------
    if (ticketParam) {
      const match = panicList.find((p) => String(p.ticket_id) === ticketParam);
      if (match) {
        const ticketIds = [match.ticket_id];
        const jobsMap: Record<string, { name: string; location: string }> = {};
        if (ticketIds.length > 0) {
          const { data: jobs } = await supabase
            .from("jobs")
            .select("id, name, location")
            .in("id", ticketIds);
          jobs?.forEach((job) => (jobsMap[job.id] = { name: job.name, location: job.location }));
        }
        const job = jobsMap[match.ticket_id];
        match.job_name = job?.name ?? null;
        match.job_location = job?.location ?? null;
      }

      return NextResponse.json({
        ok: true,
        ticket: match ?? null,
        panicList: match ? [match] : [],
        solved: match?.mark_solved ? 1 : 0,
        open: match && !match.mark_solved && (match.total_messages ?? 0) <= 1 ? 1 : 0,
        in_progress: match && !match.mark_solved && (match.total_messages ?? 0) > 1 ? 1 : 0,
        unread: match?.has_unread ? 1 : 0,
        page: 1,
        perPage: 1,
        total: match ? 1 : 0,
      });
    }

    // ---------- 6c) Counts across full (search/period) list before status filter ----------
    let solvedCount = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let unreadCount = 0;
    panicList.forEach((t) => {
      if (t.has_unread) unreadCount++;
      if (t.mark_solved === true || t.is_all_solved) solvedCount++;
      else if ((t.total_messages ?? 0) <= 1) openCount++;
      else inProgressCount++;
    });

    // ---------- 6d) Status filter ----------
    if (status === "unread") {
      panicList = panicList.filter((p) => p.has_unread);
    } else if (status === "solved") {
      panicList = panicList.filter((p) => p.mark_solved === true || p.is_all_solved);
    } else if (status === "in_progress") {
      panicList = panicList.filter(
        (p) => !(p.mark_solved === true || p.is_all_solved) && (p.total_messages ?? 0) > 1
      );
    } else if (status === "open") {
      panicList = panicList.filter(
        (p) => !(p.mark_solved === true || p.is_all_solved) && (p.total_messages ?? 0) <= 1
      );
    }

    const total = panicList.length;

    // ---------- 7) Pagination ----------
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    panicList = panicList.slice(startIndex, endIndex);

    // ---------- 8) Fetch Jobs ----------
    const ticketIds = panicList.map((p) => p.ticket_id);
    const jobsMap: Record<string, { name: string; location: string }> = {};
    if (ticketIds.length > 0) {
      const { data: jobs } = await supabase.from("jobs").select("id, name, location").in("id", ticketIds);
      jobs?.forEach((job) => (jobsMap[job.id] = { name: job.name, location: job.location }));
    }
    panicList.forEach((item) => {
      const job = jobsMap[item.ticket_id];
      item.job_name = job?.name ?? null;
      item.job_location = job?.location ?? null;
    });

    return NextResponse.json({
      ok: true,
      panicList,
      solved: solvedCount,
      open: openCount,
      in_progress: inProgressCount,
      unread: unreadCount,
      page,
      perPage,
      total,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseServer();

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
      sender_id?: string;
      mark_solved?: boolean;
    } | null;

    const ticket_id =
      typeof body?.ticket_id === "string" && body.ticket_id.trim()
        ? body.ticket_id.trim()
        : null;

    if (!ticket_id) {
      return NextResponse.json(
        { ok: false, error: "ticket_id is required" },
        { status: 400 }
      );
    }

    // Load all rows for this ticket (status is ticket-level, not per-sender)
    const { data: panicRows, error: fetchError } = await supabase
      .from("panic")
      .select("id, mark_solved")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: false });

    if (fetchError || !panicRows || panicRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Alert not found" },
        { status: 404 }
      );
    }

    const currentlySolved = panicRows.every((row) => row.mark_solved === true);
    const newSolvedValue =
      typeof body?.mark_solved === "boolean" ? body.mark_solved : !currentlySolved;

    const { data: updatedRows, error: updateError } = await supabase
      .from("panic")
      .update({ mark_solved: newSolvedValue })
      .eq("ticket_id", ticket_id)
      .select();

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update alert status" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Alert status updated",
        mark_solved: newSolvedValue,
        updated: updatedRows,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** DELETE: remove an entire support-alert thread by ticket_id (admin only). */
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
    } | null;

    const ticket_id =
      typeof body?.ticket_id === "string" && body.ticket_id.trim()
        ? body.ticket_id.trim()
        : null;

    if (!ticket_id) {
      return NextResponse.json(
        { ok: false, error: "ticket_id is required" },
        { status: 400 }
      );
    }

    const { error } = await auth.supabase
      .from("panic")
      .delete()
      .eq("ticket_id", ticket_id);

    if (error) {
      console.error("[panic DELETE]", error);
      return NextResponse.json(
        { ok: false, error: "Failed to delete alert" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deleted: true, ticket_id });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

