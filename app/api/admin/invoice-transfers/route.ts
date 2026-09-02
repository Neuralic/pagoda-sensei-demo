import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getTransferzPlatformCommissionPct } from "@/lib/transferz/platform-commission-settings";
import { invoiceTransferRowMatchesSearch } from "@/lib/transferz/booking-row";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentStatus = "pending" | "invoiced" | "paid";

type InvoiceTransferRow = Record<string, unknown> & {
  id: string;
  itinerary_id: string;
  created_by: string;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  activity_type?: string | null;
  location?: string | null;
  description?: string | null;
  payload?: unknown;
  created_at: string;
};

type InvoiceTransferListItem = InvoiceTransferRow & {
  paymentStatus: PaymentStatus;
  payment: Record<string, unknown>;
  created_by_name?: string | null;
  created_by_email?: string | null;
  /** From `itineraries.name` for admin lookup. */
  itinerary_title?: string | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

async function assertActiveAdmin(): Promise<
  | { ok: true; adminId: string }
  | { ok: false; response: NextResponse }
> {
  const jar = await cookies();
  const adminId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;

  if (!adminId || role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  const supabase = getSupabaseServer();
  const { data: admin, error } = await supabase
    .from("admin")
    .select("id, is_active")
    .eq("id", adminId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, adminId };
}

function extractPaymentStatus(payload: unknown): PaymentStatus {
  if (!isRecord(payload)) return "pending";
  const payment = payload.payment;
  if (!isRecord(payment)) return "pending";
  const status = payment.status;
  return status === "invoiced" || status === "paid" || status === "pending"
    ? status
    : "pending";
}

export async function GET(req: NextRequest) {
  try {
    const gate = await assertActiveAdmin();
    if (!gate.ok) return gate.response;

    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("perPage") || "25", 10) || 25)
    );
    const offset = (page - 1) * perPage;

    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const statusFilter = (searchParams.get("status") || "all").trim().toLowerCase();
    const filter = (searchParams.get("filter") || "all").trim().toLowerCase();

    const now = new Date();
    let startDateIso: string | null = null;
    if (filter === "weekly") {
      const d = new Date(now);
      d.setDate(now.getDate() - 7);
      startDateIso = d.toISOString();
    } else if (filter === "monthly") {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 1);
      startDateIso = d.toISOString();
    } else if (filter === "yearly") {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 1);
      startDateIso = d.toISOString();
    }

    // Load all invoice-billed rows for the date window, then filter/search/paginate in memory
    // so search and status filters work across the full dataset (not just the current page).
    let query = supabase
      .from("itinerary_transferz_bookings")
      .select(
        "id, itinerary_id, created_by, activity_date, start_time, end_time, title, activity_type, location, description, payload, created_at"
      )
      .order("created_at", { ascending: false });

    if (startDateIso) {
      query = query.gte("created_at", startDateIso);
    }

    query = query.eq("payload->payment->>method", "invoice");

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let list: InvoiceTransferListItem[] = (rows || []).map((r) => {
      const row = r as InvoiceTransferRow;
      const payload = row.payload;
      const status = extractPaymentStatus(payload);
      const payment = isRecord(payload) && isRecord(payload.payment) ? payload.payment : {};
      return {
        ...row,
        paymentStatus: status,
        payment,
      };
    });

    // Enrich with agent identity (created_by -> users).
    const creatorIds = [...new Set(list.map((x) => x.created_by).filter(Boolean))];
    if (creatorIds.length > 0) {
      const { data: users, error: usersErr } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", creatorIds);

      if (!usersErr && Array.isArray(users)) {
        const m = new Map(
          users.map((u) => {
            const email = (u as { email?: string | null }).email
              ? String((u as { email?: string | null }).email).trim()
              : null;
            const full = `${String((u as { first_name?: string | null }).first_name || "")} ${String((u as { last_name?: string | null }).last_name || "")}`.trim();
            const name = full || email || null;
            return [
              String((u as { id: string }).id),
              { name, email },
            ] as const;
          })
        );
        list = list.map((x) => {
          const u = m.get(String(x.created_by));
          return { ...x, created_by_name: u?.name ?? null, created_by_email: u?.email ?? null };
        });
      }
    }

    const itineraryIds = [...new Set(list.map((x) => x.itinerary_id).filter(Boolean))];
    if (itineraryIds.length > 0) {
      const { data: itins, error: itinsErr } = await supabase
        .from("itineraries")
        .select("id, name")
        .in("id", itineraryIds);

      if (!itinsErr && Array.isArray(itins)) {
        const titleById = new Map(
          itins.map((it) => {
            const id = String((it as { id: string }).id);
            const raw = (it as { name?: string | null }).name;
            const name = typeof raw === "string" && raw.trim() ? raw.trim() : null;
            return [id, name] as const;
          })
        );
        list = list.map((x) => ({
          ...x,
          itinerary_title: titleById.get(String(x.itinerary_id)) ?? null,
        }));
      }
    }

    // Status filter is applied in code to avoid JSON path edge cases.
    if (statusFilter === "pending" || statusFilter === "invoiced" || statusFilter === "paid") {
      list = list.filter((x) => x.paymentStatus === statusFilter);
    }

    if (search) {
      list = list.filter((x) => invoiceTransferRowMatchesSearch(x, search));
    }

    const total = list.length;
    const paged = list.slice(offset, offset + perPage);

    const transferzPlatformCommissionPct = await getTransferzPlatformCommissionPct(supabase);

    return NextResponse.json({
      ok: true,
      page,
      perPage,
      total,
      rows: paged,
      transferzPlatformCommissionPct,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await assertActiveAdmin();
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    const invoiceRef = typeof body.invoiceRef === "string" ? body.invoiceRef.trim() : "";

    const nextStatus: PaymentStatus | null =
      status === "pending" || status === "invoiced" || status === "paid"
        ? (status as PaymentStatus)
        : null;

    if (!id || !nextStatus) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid fields (id, status)" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    const { data: existing, error: fetchErr } = await supabase
      .from("itinerary_transferz_bookings")
      .select("id, payload")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const payload = isRecord(existing.payload) ? { ...existing.payload } : {};
    const prevPayment = isRecord(payload.payment) ? { ...payload.payment } : {};

    const nowIso = new Date().toISOString();
    const payment = {
      ...prevPayment,
      method: "invoice",
      cadence: "monthly",
      status: nextStatus,
      ...(invoiceRef ? { invoiceRef } : {}),
      updatedAt: nowIso,
      updatedBy: gate.adminId,
      ...(nextStatus === "invoiced" && !prevPayment.invoicedAt ? { invoicedAt: nowIso } : {}),
      ...(nextStatus === "paid" && !prevPayment.paidAt ? { paidAt: nowIso } : {}),
    };

    const nextPayload = {
      ...payload,
      payment,
    };

    const { data: updated, error: updErr } = await supabase
      .from("itinerary_transferz_bookings")
      .update({ payload: nextPayload })
      .eq("id", id)
      .select("id, payload")
      .single();

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, row: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

