export type AdminUserDateFilter = "all" | "weekly" | "monthly" | "yearly";
export type AdminUserApprovalFilter = "all" | "pending" | "approved";

const DATE_FILTERS = new Set<AdminUserDateFilter>(["all", "weekly", "monthly", "yearly"]);
const APPROVAL_FILTERS = new Set<AdminUserApprovalFilter>(["all", "pending", "approved"]);

export type ParsedAdminUserListParams = {
  search: string;
  dateFilter: AdminUserDateFilter;
  approvalStatus: AdminUserApprovalFilter;
  accountType: string;
  page: number;
  perPage: number;
};

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = parseInt(value || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Parse admin user list query params from URLSearchParams.
 * Legacy: `filter=pending|approved` maps to approval status (old email links).
 * Date range uses `dateFilter` or `filter=weekly|monthly|yearly`.
 */
export function parseAdminUserListParams(
  searchParams: URLSearchParams,
  defaults?: Partial<Pick<ParsedAdminUserListParams, "page" | "perPage">>
): ParsedAdminUserListParams {
  const filterRaw = (searchParams.get("filter") || "all").trim().toLowerCase();
  const approvalRaw = (searchParams.get("approvalStatus") || "").trim().toLowerCase();
  const dateRaw = (searchParams.get("dateFilter") || "").trim().toLowerCase();

  let approvalStatus: AdminUserApprovalFilter = "all";
  let dateFilter: AdminUserDateFilter = "all";

  if (APPROVAL_FILTERS.has(approvalRaw as AdminUserApprovalFilter)) {
    approvalStatus = approvalRaw as AdminUserApprovalFilter;
  }

  if (DATE_FILTERS.has(dateRaw as AdminUserDateFilter) && dateRaw !== "all") {
    dateFilter = dateRaw as AdminUserDateFilter;
  } else if (filterRaw === "pending" || filterRaw === "approved") {
    approvalStatus = filterRaw as AdminUserApprovalFilter;
  } else if (DATE_FILTERS.has(filterRaw as AdminUserDateFilter)) {
    dateFilter = filterRaw as AdminUserDateFilter;
  }

  return {
    search: (searchParams.get("search") || "").trim(),
    dateFilter,
    approvalStatus,
    accountType: searchParams.get("accountType") || "all",
    page: parsePositiveInt(searchParams.get("page"), defaults?.page ?? 1),
    perPage: parsePositiveInt(searchParams.get("perPage"), defaults?.perPage ?? 20),
  };
}

export function buildAdminUserManagementUrl(opts?: {
  search?: string;
  approvalStatus?: AdminUserApprovalFilter;
  accountType?: string;
}): string {
  const params = new URLSearchParams();
  if (opts?.search?.trim()) params.set("search", opts.search.trim());
  if (opts?.approvalStatus && opts.approvalStatus !== "all") {
    params.set("approvalStatus", opts.approvalStatus);
  }
  if (opts?.accountType && opts.accountType !== "all") {
    params.set("accountType", opts.accountType);
  }
  const qs = params.toString();
  return qs ? `/admin/user?${qs}` : "/admin/user";
}
