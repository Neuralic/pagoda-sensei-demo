"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { InvoiceTransferDetailModal } from "@/components/admin/invoice-transfer-detail-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";
import { MoreHorizontal, Search } from "lucide-react";
import { isTransferzJourneyCanceledStatus } from "@/lib/transferz/journey";
import { transferzCommissionBreakdownFromPayload } from "@/lib/transferz/commission";
import { DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT } from "@/lib/transferz/platform-commission-settings";

type PaymentStatus = "pending" | "invoiced" | "paid";

type InvoiceBadgeKind = PaymentStatus | "cancelled";

type Row = {
  id: string;
  itinerary_id: string;
  itinerary_title?: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_by_email?: string | null;
  activity_date: string;
  start_time?: string | null;
  end_time?: string | null;
  title: string;
  activity_type?: string | null;
  location?: string | null;
  description?: string | null;
  created_at: string;
  payload?: any;
  paymentStatus: PaymentStatus;
  payment?: any;
};

async function fetchRows(params: {
  page: number;
  perPage: number;
  search: string;
  status: "all" | PaymentStatus;
  filter: "all" | "weekly" | "monthly" | "yearly";
}) {
  const sp = new URLSearchParams({
    page: String(params.page),
    perPage: String(params.perPage),
    search: params.search,
    status: params.status,
    filter: params.filter,
  });
  const res = await fetch(`/api/admin/invoice-transfers?${sp.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to load transfer invoices");
  }
  return data as {
    ok: true;
    rows: Row[];
    total: number;
    page: number;
    perPage: number;
    transferzPlatformCommissionPct?: number;
  };
}

function formatBookedShort(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Service pickup: prefer UTC `start_time`, else activity calendar date. */
function formatPickupParts(r: Row): { dateLine: string; timeLine: string | null } {
  if (r.start_time) {
    const d = new Date(r.start_time);
    if (!Number.isNaN(d.getTime())) {
      return {
        dateLine: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        timeLine: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      };
    }
  }
  const base = (r.activity_date || "").trim();
  if (!base) return { dateLine: "—", timeLine: null };
  try {
    const d = new Date(`${base}T12:00:00`);
    return {
      dateLine: Number.isNaN(d.getTime()) ? base : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      timeLine: null,
    };
  } catch {
    return { dateLine: base, timeLine: null };
  }
}

function agentLines(r: Row): { primary: string; secondary: string | null } {
  const name = typeof r.created_by_name === "string" ? r.created_by_name.trim() : "";
  const email = typeof r.created_by_email === "string" ? r.created_by_email.trim() : "";
  if (name && email) return { primary: name, secondary: email };
  if (name) return { primary: name, secondary: null };
  if (email) return { primary: email, secondary: null };
  return { primary: "—", secondary: null };
}

/** Invoice column: prefer Transferz journey status when canceled; otherwise payment status. */
function invoiceRowBadge(r: Row): { kind: InvoiceBadgeKind; label: string } {
  const js =
    r?.payload && typeof (r.payload as { journeyStatus?: unknown }).journeyStatus === "string"
      ? String((r.payload as { journeyStatus: string }).journeyStatus).trim()
      : "";
  if (isTransferzJourneyCanceledStatus(js)) {
    return { kind: "cancelled", label: "Cancelled" };
  }
  return { kind: r.paymentStatus, label: r.paymentStatus };
}

function RowActionsMenu({
  r,
  onOpenDetail,
  onMarkPaid,
}: {
  r: Row;
  onOpenDetail: () => void;
  onMarkPaid: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" className="shrink-0" aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onOpenDetail}>View details</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={r.paymentStatus === "paid"} onSelect={onMarkPaid}>
          Mark paid
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function updateStatus(input: { id: string; status: PaymentStatus; invoiceRef?: string }) {
  const res = await fetch(`/api/admin/invoice-transfers`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to update status");
  }
  return data as { ok: true };
}

function InvoiceTransfersPageInner() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState(() => searchParams.get("search")?.trim() || "");
  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [filter, setFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");

  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [platformCommissionPct, setPlatformCommissionPct] = useState(
    DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT
  );
  const [commissionInput, setCommissionInput] = useState(
    String(DEFAULT_TRANSFERZ_PLATFORM_COMMISSION_PCT)
  );
  const [savingCommission, setSavingCommission] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/transferz-commission", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled || !res.ok || !data?.ok) return;
        const pct = Number(data.commissionPct);
        if (Number.isFinite(pct)) {
          setPlatformCommissionPct(pct);
          setCommissionInput(String(pct));
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchRows({ page, perPage, search, status, filter });
        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(Number(data.total) || 0);
        const pct = Number(data.transferzPlatformCommissionPct);
        if (Number.isFinite(pct)) {
          setPlatformCommissionPct(pct);
          setCommissionInput(String(pct));
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, perPage, search, status, filter]);

  const onChangeRowStatus = async (r: Row, next: PaymentStatus) => {
    const invoiceRef =
      next === "invoiced"
        ? window.prompt("Invoice ref (optional, e.g. INV-2026-04):", r?.payment?.invoiceRef || "") ?? ""
        : "";

    const t = toast.loading("Updating…");
    try {
      await updateStatus({ id: r.id, status: next, ...(invoiceRef.trim() ? { invoiceRef: invoiceRef.trim() } : {}) });
      toast.success("Updated");
      // refresh
      const data = await fetchRows({ page, perPage, search, status, filter });
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      toast.dismiss(t);
    }
  };

  const badgeClass = (s: InvoiceBadgeKind) => {
    if (s === "paid") return "bg-[#ECFDF5] text-[#047857] border border-green-300";
    if (s === "invoiced") return "bg-[#FEF3C7] text-[#92400E] border border-yellow-300";
    if (s === "cancelled") return "bg-slate-100 text-slate-700 border border-slate-300";
    return "bg-[#FFECE7] text-[#AC434A] border border-red-300";
  };

  const invoiceAmountParts = (r: Row): { primary: string; sub: string | null } => {
    const payload =
      r?.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {};
    const currency = payload.currency != null ? String(payload.currency) : "";
    const b = transferzCommissionBreakdownFromPayload(payload, platformCommissionPct);
    if (!b || !currency) return { primary: "—", sub: null };
    // Invoice column = Transferz provider net (what the provider charges), not Pagoda’s marked-up client total.
    return {
      primary: `${b.provider.toLocaleString()} ${currency}`,
      sub: `Fee ${b.commission.toLocaleString()} (${b.commissionPct}%) · Agent total ${b.customer.toLocaleString()} ${currency}`,
    };
  };

  const saveCommissionPct = async () => {
    const parsed = Number(commissionInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Enter a percentage between 0 and 100");
      return;
    }
    setSavingCommission(true);
    const t = toast.loading("Saving commission…");
    try {
      const res = await fetch("/api/admin/transferz-commission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPct: parsed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save");
      }
      const pct = Number(data.commissionPct);
      if (Number.isFinite(pct)) {
        setPlatformCommissionPct(pct);
        setCommissionInput(String(pct));
      }
      toast.success("Transferz commission updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      toast.dismiss(t);
      setSavingCommission(false);
    }
  };

  const bookingCode = (r: Row) => {
    const c = r?.payload?.bookingCode;
    return typeof c === "string" && c.trim() ? c.trim() : "—";
  };

  const journeyCode = (r: Row) => {
    const c = r?.payload?.journeyCode;
    return typeof c === "string" && c.trim() ? c.trim() : "—";
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-0">
        <header className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Transfer invoices</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base max-w-2xl">
            Invoice-billed airport transfers. Use search for title, itinerary id, or provider codes. Row menu to mark
            paid or open details.
          </p>
        </header>

        <div className="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Pagoda markup on Airport Transfers (Transferz)</p>
            <p className="text-xs text-gray-600 mt-1 max-w-2xl">
              Set the commission % for <strong>new</strong> bookings. Each row below shows the % and fee saved when that
              booking was created (<span className="font-mono text-[11px]">platformCommissionPct</span> on the payload).
            </p>
          </div>
          <div className="flex items-end gap-2 shrink-0">
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span className="font-medium uppercase tracking-wide">Commission %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                className="h-9 w-24 rounded-md border border-gray-300 bg-white px-2 text-sm tabular-nums"
                aria-label="Transferz platform commission percent"
              />
            </label>
            <Button
              type="button"
              onClick={saveCommissionPct}
              disabled={savingCommission}
              className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            >
              {savingCommission ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between mb-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
          <div className="relative flex-1 min-w-[min(100%,280px)] max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search itinerary title, transfer, itinerary id, agent, booking / journey code…"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span className="font-medium uppercase tracking-wide">Status</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "all" | PaymentStatus);
                  setPage(1);
                }}
                className="h-9 min-w-[140px] rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="invoiced">Invoiced</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span className="font-medium uppercase tracking-wide">Booked</span>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as "all" | "weekly" | "monthly" | "yearly");
                  setPage(1);
                }}
                className="h-9 min-w-[140px] rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="all">All time</option>
                <option value="weekly">Last 7 days</option>
                <option value="monthly">Last 30 days</option>
                <option value="yearly">Last year</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Desktop: compact table + sticky header */}
          <div className="hidden md:block max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full min-w-[860px] caption-bottom text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 shadow-[0_1px_0_0_rgb(229,231,235)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[1%] whitespace-nowrap">
                    Pickup
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 min-w-[140px] max-w-[220px]">
                    Itinerary
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Transfer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[200px]">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[140px]">
                    Ref
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 w-[120px] whitespace-nowrap">
                    Invoice
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 w-[52px] p-2 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No invoice transfers match your filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const pickup = formatPickupParts(r);
                    const agent = agentLines(r);
                    const bk = bookingCode(r);
                    const jy = journeyCode(r);
                    const invoiceBadge = invoiceRowBadge(r);
                    const amountParts = invoiceAmountParts(r);
                    const refTitle = bk !== "—" || jy !== "—" ? `Booking ${bk} · Journey ${jy}` : undefined;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors hover:bg-amber-50/40 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
                      >
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <div className="font-semibold text-gray-900">{pickup.dateLine}</div>
                          {pickup.timeLine ? (
                            <div className="text-xs text-gray-600 tabular-nums">{pickup.timeLine}</div>
                          ) : null}
                          <div className="mt-1.5 text-[11px] leading-tight text-gray-400">
                            Booked {formatBookedShort(r.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top min-w-0 max-w-[220px]">
                          <div
                            className="font-medium text-gray-900 leading-snug line-clamp-2"
                            title={r.itinerary_title || undefined}
                          >
                            {r.itinerary_title?.trim() || "—"}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-gray-400 truncate" title={r.itinerary_id}>
                            {r.itinerary_id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top min-w-0">
                          <div className="font-medium text-gray-900 leading-snug">{r.title || "Transfer"}</div>
                          {r.location ? (
                            <div className="mt-0.5 text-xs text-gray-500 line-clamp-2">{r.location}</div>
                          ) : null}
                          {r?.payment?.invoiceRef ? (
                            <div className="mt-1 text-xs text-gray-600">
                              Ref: <span className="font-mono font-medium text-gray-800">{String(r.payment.invoiceRef)}</span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top min-w-0">
                          <div className="font-medium text-gray-900 truncate" title={agent.primary}>
                            {agent.primary}
                          </div>
                          {agent.secondary ? (
                            <div className="text-xs text-gray-500 truncate mt-0.5" title={agent.secondary}>
                              {agent.secondary}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top min-w-0">
                          <div className="font-mono text-[11px] leading-relaxed text-gray-700 space-y-0.5" title={refTitle}>
                            <div className="truncate">{bk}</div>
                            <div className="truncate text-gray-500">{jy}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <div className="font-semibold tabular-nums text-gray-900">{amountParts.primary}</div>
                          {amountParts.sub ? (
                            <div className="text-[10px] text-gray-500 tabular-nums mt-0.5 max-w-[200px] ml-auto leading-tight">
                              {amountParts.sub}
                            </div>
                          ) : null}
                          <div className="mt-1.5 flex flex-col items-end gap-0.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(invoiceBadge.kind)} ${
                                invoiceBadge.kind === "cancelled" ? "" : "capitalize"
                              }`}
                            >
                              {invoiceBadge.label}
                            </span>
                            {invoiceBadge.kind === "cancelled" && r.paymentStatus !== "pending" ? (
                              <span className="text-[10px] text-gray-500" title="Internal invoice billing state">
                                Invoice: {r.paymentStatus}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-3 align-middle text-right">
                          <RowActionsMenu
                            r={r}
                            onOpenDetail={() => setDetailRow(r)}
                            onMarkPaid={() => void onChangeRowStatus(r, "paid")}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="md:hidden divide-y divide-gray-100 max-h-[min(75vh,640px)] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No invoice transfers match your filters.</div>
            ) : (
              rows.map((r) => {
                const pickup = formatPickupParts(r);
                const agent = agentLines(r);
                const invoiceBadge = invoiceRowBadge(r);
                const amountParts = invoiceAmountParts(r);
                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Itinerary</p>
                        <p className="font-semibold text-gray-900 leading-snug mt-0.5">{r.itinerary_title?.trim() || "—"}</p>
                        <p className="font-mono text-[10px] text-gray-400 truncate mt-0.5" title={r.itinerary_id}>
                          {r.itinerary_id}
                        </p>
                        <p className="font-semibold text-gray-900 leading-snug mt-2">{r.title || "Transfer"}</p>
                        {r.location ? <p className="text-xs text-gray-500 mt-1">{r.location}</p> : null}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(invoiceBadge.kind)} ${
                            invoiceBadge.kind === "cancelled" ? "" : "capitalize"
                          }`}
                        >
                          {invoiceBadge.label}
                        </span>
                        {invoiceBadge.kind === "cancelled" && r.paymentStatus !== "pending" ? (
                          <span className="text-[10px] text-gray-500">Invoice: {r.paymentStatus}</span>
                        ) : null}
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-gray-500 font-medium">Pickup</dt>
                        <dd className="text-gray-900 font-medium">{pickup.dateLine}</dd>
                        {pickup.timeLine ? <dd className="text-gray-600 tabular-nums">{pickup.timeLine}</dd> : null}
                      </div>
                      <div>
                        <dt className="text-gray-500 font-medium">Booked</dt>
                        <dd className="text-gray-900">{formatBookedShort(r.created_at)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-gray-500 font-medium">Agent</dt>
                        <dd className="text-gray-900">{agent.primary}</dd>
                        {agent.secondary ? <dd className="text-gray-500 truncate">{agent.secondary}</dd> : null}
                      </div>
                      <div className="col-span-2">
                        <dt className="text-gray-500 font-medium">Amount</dt>
                        <dd className="font-semibold tabular-nums">{amountParts.primary}</dd>
                        {amountParts.sub ? (
                          <dd className="text-[10px] text-gray-500 tabular-nums mt-0.5 leading-tight">{amountParts.sub}</dd>
                        ) : null}
                      </div>
                      <div className="col-span-2 font-mono text-[11px] text-gray-700">
                        <span className="text-gray-500">BK</span> {bookingCode(r)} · <span className="text-gray-500">JY</span>{" "}
                        {journeyCode(r)}
                      </div>
                    </dl>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => setDetailRow(r)}>
                        Details
                      </Button>
                      <RowActionsMenu
                        r={r}
                        onOpenDetail={() => setDetailRow(r)}
                        onMarkPaid={() => void onChangeRowStatus(r, "paid")}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <footer className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-600 sm:text-sm">
              {total === 0
                ? "No rows"
                : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="min-w-16 text-center text-sm text-gray-700">
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </footer>
        </div>

        <InvoiceTransferDetailModal
          platformCommissionPct={platformCommissionPct}
          open={detailRow != null}
          row={detailRow}
          onOpenChange={(open) => {
            if (!open) setDetailRow(null);
          }}
        />
      </div>
    </AdminLayout>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="max-w-7xl mx-auto px-4 py-12 text-sm text-gray-500">Loading transfer invoices…</div>
        </AdminLayout>
      }
    >
      <InvoiceTransfersPageInner />
    </Suspense>
  );
}

