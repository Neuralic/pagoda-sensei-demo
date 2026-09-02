"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Search, Eye, X, Pencil } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { ItineraryIntakeData } from "@/lib/itinerary-intake";
import { IntakeSummaryPanel } from "@/components/itineraries/intake-summary-panel";

type BuildModeFilter = "all" | "pagoda_build" | "self";
type StatusFilter = "all" | "draft" | "published" | "archived";

type AdminItineraryRow = {
  id: string;
  name: string;
  location: string;
  status: string;
  start_date: string;
  end_date: string;
  created_at: string;
  build_mode?: string | null;
  job_count?: number;
  advisor_name: string;
  advisor_email: string;
  intake_data: ItineraryIntakeData;
  arrival_transfer?: boolean;
  arrival_flight_number?: string | null;
  arrival_flight_time?: string | null;
  departure_transfer?: boolean;
  departure_flight_number?: string | null;
  departure_flight_time?: string | null;
};

function buildModeLabel(mode: string | null | undefined): string {
  if (mode === "pagoda_build") return "Pagoda build";
  return "Advisor built";
}

function statusBadgeClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "published") return "bg-emerald-100 text-emerald-800";
  if (s === "archived") return "bg-gray-100 text-gray-600";
  return "bg-amber-100 text-amber-800";
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
        active
          ? "bg-[#D4AA25]/15 border-[#D4AA25] text-[#7a6210]"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function IntakeDetailPanel({
  row,
  onClose,
}: {
  row: AdminItineraryRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{row.name}</h2>
            <p className="text-sm text-gray-500">
              Owned by {row.advisor_name}
              {row.advisor_email ? ` (${row.advisor_email})` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500">Dates</p>
              <p className="font-medium">
                {row.start_date} → {row.end_date}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium capitalize">{row.status || "draft"}</p>
            </div>
            <div>
              <p className="text-gray-500">Build mode</p>
              <p className="font-medium">{buildModeLabel(row.build_mode)}</p>
            </div>
            <div>
              <p className="text-gray-500">Jobs</p>
              <p className="font-medium">{row.job_count ?? 0}</p>
            </div>
            <div>
              <p className="text-gray-500">Created</p>
              <p className="font-medium">
                {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Location</p>
              <p className="font-medium">{row.location || "—"}</p>
            </div>
          </div>

          <hr />

          <IntakeSummaryPanel
            intake={row.intake_data}
            fallbackLocation={row.location}
          />

          {row.arrival_transfer || row.departure_transfer ? (
            <>
              <hr />
              <div className="space-y-2">
                {row.arrival_transfer ? (
                  <p>
                    <span className="text-gray-500">Arrival transfer:</span>{" "}
                    flight {row.arrival_flight_number || "—"} at{" "}
                    {row.arrival_flight_time || "—"}
                  </p>
                ) : null}
                {row.departure_transfer ? (
                  <p>
                    <span className="text-gray-500">Departure transfer:</span>{" "}
                    flight {row.departure_flight_number || "—"} at{" "}
                    {row.departure_flight_time || "—"}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Close
          </button>
          <Link
            href={`/admin/itineraries/${row.id}/edit`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-[#D4AA25] text-black hover:bg-[#C49A1F]"
          >
            <Pencil className="w-3.5 h-3.5" />
            Open & edit
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminItinerariesInner() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight") || "";
  const filterUserId = searchParams.get("userId") || "";
  const initialBuild =
    searchParams.get("buildMode") === "pagoda_build" ||
    searchParams.get("buildMode") === "self"
      ? (searchParams.get("buildMode") as BuildModeFilter)
      : "all";

  const [items, setItems] = useState<AdminItineraryRow[]>([]);
  const [search, setSearch] = useState("");
  const [buildMode, setBuildMode] = useState<BuildModeFilter>(initialBuild);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminItineraryRow | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        search,
        buildMode,
        status,
      });
      if (filterUserId) params.set("userId", filterUserId);
      const res = await fetch(`/api/admin/itineraries?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load itineraries");
      }
      setItems(data.itineraries ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load itineraries");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, buildMode, status, filterUserId]);

  const openById = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/itineraries/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load itinerary");
      }
      setSelected(data.itinerary as AdminItineraryRow);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load itinerary");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!highlightId) return;
    openById(highlightId);
  }, [highlightId, openById]);

  useEffect(() => {
    if (!highlightId) return;
    const el = rowRefs.current[highlightId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, items]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">All itineraries</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overall access — view and edit every advisor itinerary on the platform without
            logging in as them.
          </p>
          {filterUserId && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
              Showing one advisor&apos;s itineraries
              <Link href="/admin/itineraries" className="text-[#af8a10] hover:underline">
                Show all
              </Link>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by itinerary, destination, or advisor…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 mr-1">Build:</span>
            {(
              [
                ["all", "All"],
                ["pagoda_build", "Pagoda build"],
                ["self", "Advisor built"],
              ] as const
            ).map(([key, label]) => (
              <FilterChip
                key={key}
                active={buildMode === key}
                label={label}
                onClick={() => {
                  setBuildMode(key);
                  setPage(1);
                }}
              />
            ))}
            <span className="text-xs font-medium text-gray-500 ml-2 mr-1">Status:</span>
            {(
              [
                // "All" excludes archived, the same way the advisor's own list does — a trip
                // whose dates have passed is archived whatever its stored status. Labelled
                // "Active" so the empty state is not mistaken for a broken filter.
                ["all", "Active"],
                ["draft", "Draft"],
                ["published", "Published"],
                ["archived", "Archived"],
              ] as const
            ).map(([key, label]) => (
              <FilterChip
                key={key}
                active={status === key}
                label={label}
                onClick={() => {
                  setStatus(key);
                  setPage(1);
                }}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Itinerary</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Advisor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Build</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jobs</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dates</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No itineraries match these filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const highlighted = highlightId === row.id;
                  return (
                    <tr
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[row.id] = el;
                      }}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        highlighted ? "bg-amber-50 ring-1 ring-inset ring-amber-200" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="text-xs text-gray-500">{row.location || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.advisor_name}</div>
                        {row.advisor_email ? (
                          <div className="text-xs text-gray-500">{row.advisor_email}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            row.build_mode === "pagoda_build"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {buildModeLabel(row.build_mode)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${statusBadgeClass(
                            row.status
                          )}`}
                        >
                          {row.status || "draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.job_count ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {row.start_date} → {row.end_date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {row.build_mode === "pagoda_build" ? (
                            <button
                              type="button"
                              onClick={() => setSelected(row)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-100"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Intake
                            </button>
                          ) : null}
                          <Link
                            href={`/admin/itineraries/${row.id}/edit`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-[#D4AA25] text-black hover:bg-[#C49A1F]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {total} itinerar{total === 1 ? "y" : "ies"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
          </span>
          {totalPages > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {selected ? (
        <IntakeDetailPanel row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default function AdminItinerariesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}>
      <AdminItinerariesInner />
    </Suspense>
  );
}
