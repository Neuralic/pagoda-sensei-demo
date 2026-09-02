import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/admin-auth";
import { derivePresenceDisplay } from "@/lib/presence";
import {
  ADMIN_ACCOUNT_TYPE_LABELS,
  resolveAdminAccountType,
  type AdminAccountType,
} from "@/lib/admin-account-type";
import {
  normalizeUserSearchQuery,
  userMatchesNameSearch,
} from "@/lib/user-name-search";
import { parseAdminUserListParams } from "@/lib/admin-user-list-params";

export const runtime = "nodejs";

type UserRow = Record<string, unknown> & {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  created_at?: string;
};

/** Fields that must never leave the server, regardless of who is asking. */
const CREDENTIAL_FIELDS = [
  "password_hash",
  "password",
  "reset_token",
  "verification_code",
] as const;

function stripCredentialFields(user: UserRow): UserRow {
  const safe = { ...user } as Record<string, unknown>;
  for (const field of CREDENTIAL_FIELDS) delete safe[field];
  return safe as UserRow;
}

type AdminUserFilters = {
  startDate: string | null;
  accountType: AdminAccountType | "all";
  approvalStatus: string;
};

function resolveCreatedAfter(filter: string, now = new Date()): string | null {
  if (filter === "weekly") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return weekAgo.toISOString();
  }
  if (filter === "monthly") {
    const monthAgo = new Date(now);
    monthAgo.setMonth(now.getMonth() - 1);
    return monthAgo.toISOString();
  }
  if (filter === "yearly") {
    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    return yearAgo.toISOString();
  }
  return null;
}

function applyUserListFilters<Q extends { gte: Function; eq: Function; in: Function; or: Function; is: Function; not: Function }>(
  query: Q,
  filters: AdminUserFilters
): Q {
  let next = query;

  if (filters.startDate) {
    next = next.gte("created_at", filters.startDate) as Q;
  }
  if (filters.accountType === "agent") {
    next = next.eq("role", "agent") as Q;
  } else if (filters.accountType === "operator") {
    next = (next.eq("role", "guide") as Q).eq("is_operator", true) as Q;
  } else if (filters.accountType === "guide") {
    next = (next.eq("role", "guide") as Q)
      .eq("is_operator", false)
      .is("managed_by_operator_id", null) as Q;
  } else if (filters.accountType === "managed_guide") {
    next = next.eq("role", "guide").not("managed_by_operator_id", "is", null) as Q;
  }
  if (filters.approvalStatus === "pending") {
    next = (next.in("role", ["agent", "guide"]) as Q).or(
      "guide_approved.is.null,guide_approved.eq.false"
    ) as Q;
  } else if (filters.approvalStatus === "approved") {
    next = next.in("role", ["agent", "guide"]).eq("guide_approved", true) as Q;
  }

  return next;
}

async function fetchUsersForAdminPage(opts: {
  supabase: ReturnType<typeof getSupabaseServer>;
  offset: number;
  perPage: number;
  search: string;
  filters: AdminUserFilters;
}) {
  if (!opts.search) {
    return applyUserListFilters(
      opts.supabase.from("users").select("*", { count: "exact" }),
      opts.filters
    )
      .order("created_at", { ascending: false })
      .range(opts.offset, opts.offset + opts.perPage - 1);
  }

  const { data: candidates, error: candidateError } = await applyUserListFilters(
    opts.supabase.from("users").select("id, first_name, last_name, email, created_at"),
    opts.filters
  ).order("created_at", { ascending: false });

  if (candidateError) {
    return { data: null, error: candidateError, count: 0 };
  }

  const matchingIds = (candidates || [])
    .filter((user) => userMatchesNameSearch(user, opts.search))
    .map((user) => user.id);

  const total = matchingIds.length;
  const pageIds = matchingIds.slice(opts.offset, opts.offset + opts.perPage);

  if (pageIds.length === 0) {
    return { data: [] as UserRow[], error: null, count: total };
  }

  const { data: pageUsers, error: pageError } = await opts.supabase
    .from("users")
    .select("*")
    .in("id", pageIds);

  if (pageError) {
    return { data: null, error: pageError, count: total };
  }

  const byId = new Map((pageUsers || []).map((user) => [user.id, user as UserRow]));
  const ordered = pageIds
    .map((id) => byId.get(id))
    .filter((user): user is UserRow => Boolean(user));

  return { data: ordered, error: null, count: total };
}

export async function GET(req: Request) {
  // Reads the whole table with the service-role client, so it must prove admin here
  // and not rely on middleware alone.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseServer();
  const { searchParams } = new URL(req.url);

  try {
    const parsed = parseAdminUserListParams(searchParams, { page: 1, perPage: 20 });
    const page = parsed.page;
    const perPage = parsed.perPage;
    const offset = (page - 1) * perPage;

    const search = normalizeUserSearchQuery(parsed.search);
    const accountType = (parsed.accountType || "all") as AdminAccountType | "all";
    const approvalStatus = parsed.approvalStatus;

    const filters: AdminUserFilters = {
      startDate: resolveCreatedAfter(parsed.dateFilter),
      accountType,
      approvalStatus,
    };

    const { data: users, error: userError, count } = await fetchUsersForAdminPage({
      supabase,
      offset,
      perPage,
      search,
      filters,
    });

    if (userError) throw userError;
    // Both query paths above use select("*"), which pulls password_hash and reset material.
    // Stripped here rather than in either branch so a third branch cannot reintroduce it.
    const safeUsers = users ? users.map((u) => stripCredentialFields(u as UserRow)) : users;
    if (!safeUsers) {
      return NextResponse.json({
        ok: true,
        page,
        perPage,
        total: 0,
        userList: [],
      });
    }

    const userIds = safeUsers.map((u) => u.id);
    const operatorIds = [
      ...new Set(
        safeUsers
          .filter((u) => (u as { is_operator?: boolean }).is_operator)
          .map((u) => u.id as string)
      ),
    ];
    const managedByIds = [
      ...new Set(
        safeUsers
          .map((u) => (u as { managed_by_operator_id?: string | null }).managed_by_operator_id)
          .filter(Boolean) as string[]
      ),
    ];

    const [{ data: profiles }, { data: panicList }, { data: managedCounts }, { data: operators }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, profile_picture_path, guide_profile_status, certification_status")
          .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
        supabase
          .from("panic")
          .select("sender_id")
          .in("sender_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
        operatorIds.length
          ? supabase.from("users").select("managed_by_operator_id").in("managed_by_operator_id", operatorIds)
          : Promise.resolve({ data: [] as { managed_by_operator_id: string }[], error: null }),
        managedByIds.length
          ? supabase.from("users").select("id, first_name, last_name").in("id", managedByIds)
          : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[], error: null }),
      ]);

    const managedCountByOperator: Record<string, number> = {};
    for (const row of managedCounts || []) {
      const opId = (row as { managed_by_operator_id: string }).managed_by_operator_id;
      if (opId) managedCountByOperator[opId] = (managedCountByOperator[opId] || 0) + 1;
    }

    const operatorNameById: Record<string, string> = {};
    for (const op of operators || []) {
      operatorNameById[op.id] = `${op.first_name || ""} ${op.last_name || ""}`.trim();
    }

    const userList = safeUsers.map((user) => {
      const profile = profiles?.find((p) => p.user_id === user.id);
      const panicCount = (panicList || []).filter((p) => p.sender_id === user.id).length;
      const row = user as Record<string, unknown>;
      const accountTypeResolved = resolveAdminAccountType({
        role: String(row.role || ""),
        is_operator: row.is_operator as boolean | null,
        managed_by_operator_id: row.managed_by_operator_id as string | null,
      });
      const managedById = row.managed_by_operator_id as string | null;
      const presenceState = row.presence_state as string | null | undefined;
      const presenceUpdatedAt = row.presence_updated_at as string | null | undefined;

      return {
        ...user,
        profile_image: profile?.profile_picture_path || null,
        guide_profile_status: profile?.guide_profile_status || null,
        certification_status: profile?.certification_status || null,
        alert_count: panicCount,
        account_type: accountTypeResolved,
        account_type_label: ADMIN_ACCOUNT_TYPE_LABELS[accountTypeResolved],
        managed_by_operator_name: managedById ? operatorNameById[managedById] || null : null,
        managed_guide_count: row.is_operator ? managedCountByOperator[String(user.id)] || 0 : undefined,
        presence_display: derivePresenceDisplay(presenceState, presenceUpdatedAt),
      };
    });

    return NextResponse.json({
      ok: true,
      page,
      perPage,
      total: count || 0,
      userList,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to fetch data" }, { status: 500 });
  }
}
