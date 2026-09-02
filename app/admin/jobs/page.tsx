"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Search } from "lucide-react";
import { Booking } from "@/app/types";

async function loadBookingData(
  page: number,
  perPage: number,
  search: string,
  filter: "weekly" | "monthly" | "yearly" | "all",
  userId: string,
  guideId: string
) {
  const params = new URLSearchParams({
    page: page.toString(),
    perPage: perPage.toString(),
    search,
    filter,
  });
  if (userId) params.set("userId", userId);
  if (guideId) params.set("guideId", guideId);

  const res = await fetch(`/api/admin/jobs?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch booking data");
  return res.json();
}

function AdminJobsInner() {
  const searchParams = useSearchParams();
  const filterUserId = searchParams.get("userId") || "";
  const filterGuideId = searchParams.get("guideId") || "";

  const [bookingInfo, setBookingInfo] = useState<Booking[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");
  const options = ["all", "weekly", "monthly", "yearly"] as const;
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (option: (typeof options)[number]) => {
    setFilter(option);
    setIsOpen(false);
  };

  useEffect(() => {
    setPage(1);
  }, [search, filter, filterUserId, filterGuideId]);

  useEffect(() => {
    async function load() {
      try {
        const data = await loadBookingData(
          page,
          perPage,
          search,
          filter,
          filterUserId,
          filterGuideId
        );
        setBookingInfo(data.booking);
        setTotal(data.total || 0);
      } catch (err) {
        console.error("Error fetching jobs", err);
      }
    }
    void load();
  }, [page, perPage, search, filter, filterUserId, filterGuideId]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div className="max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Job Management</h1>
            <p className="text-gray-600 mt-1">
              Track and manage all bookings across the platform.
            </p>
            {(filterUserId || filterGuideId) && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
                Filtered by account
                <Link href="/admin/jobs" className="text-[#af8a10] hover:underline">
                  Show all
                </Link>
              </div>
            )}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job or advisor…"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <div className="relative inline-block text-left">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex justify-between w-40 rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
              <svg
                className="-mr-1 ml-2 h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isOpen && (
              <div className="origin-top-right absolute mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                <div className="py-1">
                  {options.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleSelect(option)}
                      className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${
                        filter === option ? "font-bold" : ""
                      }`}
                    >
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 min-w-[250px]">
                    Job
                  </th>
                  <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Submitted by
                  </th>
                  <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Date Submitted
                  </th>
                  <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Listing
                  </th>
                  <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Booking progress
                  </th>
                  <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Bids
                  </th>
                  <th className="text-right px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Guide price
                  </th>
                  <th className="text-right px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                    Purchase price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bookingInfo?.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-xs font-bold text-[#111827] whitespace-nowrap">
                      {booking.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-[#111827]">
                      {(booking.created_by_name && booking.created_by_name.trim()) ||
                        booking.created_by_email ||
                        "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {booking.created_at
                        ? new Date(booking.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          booking.listing_status === "open"
                            ? "bg-[#ECFDF5] text-[#047857] border border-green-300"
                            : "bg-[#FFECE7] text-[#AC434A] border"
                        }`}
                      >
                        {booking.listing_status === "open" ? "Open for bids" : "Closed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          booking.booking_status === "booked"
                            ? "bg-[#ECFDF5] text-[#047857]"
                            : booking.booking_status === "bids_received" ||
                                booking.booking_status === "candidate_selected" ||
                                booking.booking_status === "offer_sent" ||
                                booking.booking_status === "offer_accepted"
                              ? "bg-[#FAF9E2] text-[#BBAC61]"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {booking.booking_status_label || "Open for bids"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm tabular-nums text-gray-700">
                      {booking.bids_count ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm tabular-nums text-gray-700">
                      {booking.guide_price != null
                        ? `¥${Number(booking.guide_price).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium tabular-nums text-gray-900">
                      {booking.customer_price != null
                        ? `¥${Number(booking.customer_price).toLocaleString()}`
                        : "Not quoted"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs lg:text-sm text-gray-600">
              {total === 0
                ? "No jobs found"
                : `Showing ${(page - 1) * perPage + 1} to ${Math.min(
                    page * perPage,
                    total
                  )} of ${total}`}
            </p>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                Prev
              </button>
              <span className="px-3 py-1 text-gray-700">{page}</span>
              <button
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="p-8 text-gray-500">Loading jobs…</div>
        </AdminLayout>
      }
    >
      <AdminJobsInner />
    </Suspense>
  );
}
