"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Shield } from "lucide-react";
import toast from "react-hot-toast";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Button } from "@/components/ui/button";
import { SecurityLogDetailDialog } from "@/components/admin/security-log-detail";
import { SECURITY_EVENT_TYPES, type SecurityAuditRow } from "@/lib/security-audit";

type EventFilter = "all" | keyof typeof SECURITY_EVENT_TYPES;
type PeriodFilter = "all" | "weekly" | "monthly" | "yearly";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function eventBadgeClass(tone: SecurityAuditRow["tone"]): string {
  if (tone === "start") return "bg-amber-50 text-amber-800 border-amber-200";
  if (tone === "stop") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

async function fetchLog(params: {
  page: number;
  perPage: number;
  search: string;
  event: EventFilter;
  period: PeriodFilter;
}) {
  const sp = new URLSearchParams({
    page: String(params.page),
    perPage: String(params.perPage),
    search: params.search,
    event: params.event,
    period: params.period,
  });
  const res = await fetch(`/api/admin/security-log?${sp.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to load security log");
  }
  return data as {
    ok: true;
    rows: SecurityAuditRow[];
    total: number;
    page: number;
    perPage: number;
    setupRequired?: boolean;
  };
}

function PersonCell({
  name,
  email,
  href,
}: {
  name: string;
  email: string | null;
  href?: string | null;
}) {
  const title = (
    <>
      <p className="font-medium text-gray-900 truncate">{name}</p>
      {email ? <p className="text-xs text-gray-500 truncate">{email}</p> : null}
    </>
  );
  if (!href) return <div className="min-w-0">{title}</div>;
  return (
    <Link href={href} className="min-w-0 block hover:opacity-80">
      {title}
    </Link>
  );
}

export default function SecurityLogPage() {
  const [rows, setRows] = useState<SecurityAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [event, setEvent] = useState<EventFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [detail, setDetail] = useState<SecurityAuditRow | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchLog({ page, perPage, search, event, period });
        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(Number(data.total) || 0);
        setSetupRequired(Boolean(data.setupRequired));
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, perPage, search, event, period]);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-0">
        <header className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Security log</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base max-w-2xl">
            Privileged actions on the platform. Overall access (using an advisor or guide account) is
            recorded here so support stays accountable.
          </p>
        </header>

        {setupRequired ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The audit table is not on this database yet. Apply{" "}
            <span className="font-mono text-xs">migrations/20260820_security_phase1.sql</span> and
            refresh.
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between mb-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
          <div className="relative flex-1 min-w-[min(100%,280px)] max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search admin, account, email, or IP…"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span className="font-medium uppercase tracking-wide">Event</span>
              <select
                value={event}
                onChange={(e) => {
                  setEvent(e.target.value as EventFilter);
                  setPage(1);
                }}
                className="h-9 min-w-[180px] rounded-md border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="all">All events</option>
                <option value="impersonation_start">Overall access started</option>
                <option value="impersonation_stop">Overall access ended</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-gray-600">
              <span className="font-medium uppercase tracking-wide">When</span>
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value as PeriodFilter);
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
          <div className="hidden md:block max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full min-w-[860px] caption-bottom text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 shadow-[0_1px_0_0_rgb(229,231,235)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[1%] whitespace-nowrap">
                    When
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Event
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Admin
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Account accessed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[88px]">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[120px]">
                    IP
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 w-[88px]">
                    <span className="sr-only">Details</span>
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
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-600 font-medium">No events match these filters</p>
                      <p className="text-gray-500 text-sm mt-1">
                        Overall access start and stop will appear here automatically.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-amber-50/40 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums text-gray-700">
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${eventBadgeClass(row.tone)}`}
                        >
                          {row.eventLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top max-w-[200px]">
                        <PersonCell name={row.admin.name} email={row.admin.email} />
                      </td>
                      <td className="px-4 py-3 align-top max-w-[220px]">
                        <PersonCell
                          name={row.target.name}
                          email={row.target.email}
                          href={row.target.id ? `/admin/users/${encodeURIComponent(row.target.id)}` : null}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700">{row.target.roleLabel}</td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-gray-600">
                        {row.ip || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => setDetail(row)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100">
            {loading ? (
              <p className="px-4 py-12 text-center text-gray-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-12 text-center text-gray-500">No events match these filters.</p>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${eventBadgeClass(row.tone)}`}
                    >
                      {row.eventLabel}
                    </span>
                    <p className="text-xs text-gray-500 tabular-nums">{formatWhen(row.createdAt)}</p>
                  </div>
                  <p className="text-sm text-gray-900">
                    <span className="text-gray-500">Admin</span> {row.admin.name}
                  </p>
                  <p className="text-sm text-gray-900">
                    <span className="text-gray-500">Account</span> {row.target.name}{" "}
                    <span className="text-gray-500">({row.target.roleLabel})</span>
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <p className="font-mono text-[11px] text-gray-500">{row.ip || "—"}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetail(row)}>
                      View
                    </Button>
                  </div>
                </div>
              ))
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
      </div>

      <SecurityLogDetailDialog row={detail} onClose={() => setDetail(null)} />
    </AdminLayout>
  );
}
