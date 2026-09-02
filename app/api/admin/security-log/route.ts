import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import {
  displayPersonName,
  marketplaceRoleLabel,
  periodStartIso,
  sanitizeAuditSearch,
  securityEventLabel,
  securityEventTone,
  type SecurityAuditRow,
} from "@/lib/security-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditMeta = {
  adminEmail?: string | null;
  adminName?: string | null;
  targetEmail?: string | null;
  targetName?: string | null;
};

type AuditDbRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  target_user_id: string | null;
  target_role: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: AuditMeta | null;
  created_at: string;
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist/i.test(error.message || "");
}

function personMapFromRows(
  rows: Array<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null }>
): Map<string, { name: string; email: string | null }> {
  const map = new Map<string, { name: string; email: string | null }>();
  for (const row of rows) {
    map.set(row.id, {
      name: displayPersonName({
        first: row.first_name,
        last: row.last_name,
        email: row.email,
      }),
      email: row.email?.trim() || null,
    });
  }
  return map;
}

async function loadPeople(
  supabase: SupabaseClient,
  actorIds: string[],
  targetIds: string[]
) {
  const [adminsRes, usersRes] = await Promise.all([
    actorIds.length
      ? supabase.from("admin").select("id, first_name, last_name, email").in("id", actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> }),
    targetIds.length
      ? supabase.from("users").select("id, first_name, last_name, email, role").in("id", targetIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
            role: string | null;
          }>,
        }),
  ]);

  const admins = personMapFromRows(adminsRes.data || []);
  const users = new Map<
    string,
    { name: string; email: string | null; role: string | null }
  >();
  for (const row of usersRes.data || []) {
    users.set(row.id, {
      name: displayPersonName({
        first: row.first_name,
        last: row.last_name,
        email: row.email,
      }),
      email: row.email?.trim() || null,
      role: row.role || null,
    });
  }
  return { admins, users };
}

function toAuditRow(
  row: AuditDbRow,
  people: Awaited<ReturnType<typeof loadPeople>>
): SecurityAuditRow {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const adminLive = row.actor_id ? people.admins.get(row.actor_id) : undefined;
  const targetLive = row.target_user_id ? people.users.get(row.target_user_id) : undefined;
  const role = targetLive?.role || row.target_role || null;

  return {
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type,
    eventLabel: securityEventLabel(row.event_type),
    tone: securityEventTone(row.event_type),
    admin: {
      id: row.actor_id,
      name: adminLive?.name || meta.adminName || "Admin",
      email: adminLive?.email || meta.adminEmail || null,
    },
    target: {
      id: row.target_user_id,
      name: targetLive?.name || meta.targetName || "User",
      email: targetLive?.email || meta.targetEmail || null,
      role,
      roleLabel: marketplaceRoleLabel(role),
    },
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

/**
 * GET /api/admin/security-log
 * Privileged-action audit (overall access start/stop). Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
    const perPage = Math.min(50, Math.max(10, Number(searchParams.get("perPage") || 25) || 25));
    const event = (searchParams.get("event") || "all").trim();
    const period = (searchParams.get("period") || "all").trim();
    const search = sanitizeAuditSearch(searchParams.get("search") || "");
    const from = periodStartIso(period);

    let query = auth.supabase
      .from("security_audit_log")
      .select(
        "id, event_type, actor_id, target_user_id, target_role, ip, user_agent, meta, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (event !== "all") {
      query = query.eq("event_type", event);
    }
    if (from) {
      query = query.gte("created_at", from);
    }
    if (search) {
      const q = `%${search}%`;
      query = query.or(
        [
          `ip.ilike.${q}`,
          `actor_id.ilike.${q}`,
          `target_user_id.ilike.${q}`,
          `target_role.ilike.${q}`,
          `event_type.ilike.${q}`,
          `meta->>adminName.ilike.${q}`,
          `meta->>adminEmail.ilike.${q}`,
          `meta->>targetName.ilike.${q}`,
          `meta->>targetEmail.ilike.${q}`,
        ].join(",")
      );
    }

    const fromIdx = (page - 1) * perPage;
    const { data, error, count } = await query.range(fromIdx, fromIdx + perPage - 1);

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({
          ok: true,
          rows: [],
          total: 0,
          page,
          perPage,
          setupRequired: true,
        });
      }
      console.error("[admin/security-log]", error);
      return NextResponse.json({ ok: false, error: "Failed to load security log." }, { status: 500 });
    }

    const dbRows = (data || []) as AuditDbRow[];
    const actorIds = [...new Set(dbRows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
    const targetIds = [
      ...new Set(dbRows.map((r) => r.target_user_id).filter((id): id is string => Boolean(id))),
    ];
    const people = await loadPeople(auth.supabase, actorIds, targetIds);
    const rows = dbRows.map((row) => toAuditRow(row, people));

    return NextResponse.json({
      ok: true,
      rows,
      total: typeof count === "number" ? count : rows.length,
      page,
      perPage,
      setupRequired: false,
    });
  } catch (e) {
    console.error("[admin/security-log] exception", e);
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
