"use client"
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/admin_layout/admin-layout';
import { Search, Eye, Edit, Trash2, Ban, CheckCircle } from 'lucide-react';
import { Tour } from '@/app/types';
import { mapApiTourRowToTour } from '@/lib/map-api-tour-row-to-tour';
import { TourDetailModal } from '@/components/tour_library/tour-detail-modal';
import { UpdateTourModal } from '@/components/tour_library/edit-tour-modal';
import toast from 'react-hot-toast';

// Function to fetch tour data
const loadTourData = async (
    page: number,
    perPage: number,
    search: string,
    guideSearch: string,
    filter: "weekly" | "monthly" | "yearly" | "all",
    statusFilter: "all" | "draft" | "published" | "banned",
    guideId: string
) => {
    const params = new URLSearchParams({
        page: page.toString(),
        perPage: perPage.toString(),
        search,
        guideSearch,
        filter,
        status: statusFilter,
    });
    if (guideId) params.set("guideId", guideId);

    const res = await fetch(`/api/admin/tours?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch tour data");
    const data = await res.json();
    return data;
};

function AdminToursInner() {
    const searchParams = useSearchParams();
    const filterGuideId = searchParams.get("guideId") || "";

    const [tours, setTours] = useState<Tour[]>([]);
    const [search, setSearch] = useState("");
    const [guideSearch, setGuideSearch] = useState(""); // Backend search for guide name
    const [page, setPage] = useState(1);
    const [perPage] = useState(50);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "banned">("all");
    const [isOpen, setIsOpen] = useState(false);
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dataUpdate, setDataUpdate] = useState(0);

    const options = ["all", "weekly", "monthly", "yearly"] as const;
    const statusOptions = ["all", "draft", "published", "banned"] as const;

    const handleSelect = (option: typeof options[number]) => {
        setFilter(option);
        setIsOpen(false);
    };

    const handleStatusSelect = (option: typeof statusOptions[number]) => {
        setStatusFilter(option);
        setIsStatusOpen(false);
    };

    useEffect(() => {
        setPage(1);
    }, [search, guideSearch, filter, statusFilter, filterGuideId]);

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                const data = await loadTourData(
                    page,
                    perPage,
                    search,
                    guideSearch,
                    filter,
                    statusFilter,
                    filterGuideId
                );
                const raw = data.tours || [];
                setTours(
                    raw.map((row: Record<string, unknown>) =>
                        mapApiTourRowToTour(row as Partial<Tour> & Record<string, unknown>)
                    )
                );
                setTotal(data.total || 0);
            } catch (err) {
                console.error("Error fetching tours", err);
                toast.error("Failed to load tours");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [page, perPage, search, guideSearch, filter, statusFilter, dataUpdate, filterGuideId]);

    const handleDelete = async (tourId: string) => {
        if (!confirm("Are you sure you want to delete this tour? This action cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/tours?id=${tourId}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                throw new Error("Failed to delete tour");
            }

            toast.success("Tour deleted successfully");
            // Reload tours
            setDataUpdate(prev => prev + 1);
        } catch (err) {
            toast.error("Failed to delete tour");
            console.error(err);
        }
    };

    const handleStatusChange = async (tourId: string, newStatus: "draft" | "published" | "banned") => {
        try {
            const res = await fetch(`/api/admin/tours`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: tourId, status: newStatus }),
            });

            if (!res.ok) {
                throw new Error("Failed to update tour status");
            }

            const statusMessages: Record<string, string> = {
                published: "published",
                banned: "banned (unpublished)",
                draft: "set to draft"
            };
            toast.success(`Tour ${statusMessages[newStatus] || "updated"} successfully`);
            // Reload tours
            setDataUpdate(prev => prev + 1);
        } catch (err) {
            toast.error("Failed to update tour status");
            console.error(err);
        }
    };

    const totalPages = Math.ceil(total / perPage);

    const getStatusBadge = (status: string | undefined) => {
        if (status === "published") {
            return "bg-[#ECFDF5] text-[#047857] border border-green-300";
        }
        if (status === "banned") {
            return "bg-[#FFECE7] text-[#AC434A] border border-red-300";
        }
        return "bg-[#FEF3C7] text-[#92400E] border border-yellow-300";
    };

    return (
        <div>
            <AdminLayout>
                <div className="max-w-7xl mx-auto">
                    {/* Page Header */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                        <div className='max-w-md'>
                            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Tour Management</h1>
                            <p className="text-gray-600 mt-1">View, edit, and manage all tours across the platform.</p>
                            {filterGuideId && (
                                <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
                                    Filtered by guide
                                    <Link href="/admin/tours" className="text-[#af8a10] hover:underline">
                                        Show all
                                    </Link>
                                </div>
                            )}
                            <div className="flex flex-col gap-3 mt-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        value={search} 
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setPage(1); // Reset to first page on search
                                        }}
                                        placeholder="Search tours by name, location, or country..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                                    />
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        value={guideSearch} 
                                        onChange={(e) => {
                                            setGuideSearch(e.target.value);
                                            setPage(1); // Reset to first page on search
                                        }}
                                        placeholder="Search by Tour Guide name..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {/* Status Filter */}
                            <div className="relative inline-block text-left">
                                <button
                                    type="button"
                                    onClick={() => setIsStatusOpen(!isStatusOpen)}
                                    className="inline-flex justify-between w-40 rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                                >
                                    Status: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                                    <svg
                                        className="-mr-1 ml-2 h-5 w-5"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.06z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>

                                {isStatusOpen && (
                                    <div className="origin-top-right absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                                        <div className="py-1">
                                            {statusOptions.map((option) => (
                                                <button
                                                    key={option}
                                                    onClick={() => handleStatusSelect(option)}
                                                    className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${statusFilter === option ? "font-bold" : ""}`}
                                                >
                                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Date Filter */}
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
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.06z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>

                                {isOpen && (
                                    <div className="origin-top-right absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                                        <div className="py-1">
                                            {options.map((option) => (
                                                <button
                                                    key={option}
                                                    onClick={() => handleSelect(option)}
                                                    className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${filter === option ? "font-bold" : ""}`}
                                                >
                                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tours Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Loading tours...</div>
                        ) : (
                            <>
                                <div className="hidden md:block overflow-x-auto">
                                    <div className="inline-block min-w-full align-middle">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead>
                                                <tr className="bg-gray-50">
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 min-w-[200px]">
                                                        Tour Name
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Created By
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Guide Price
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Location
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Activity Type
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Status
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Created At
                                                    </th>
                                                    <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {tours?.map((tour) => (
                                                    <tr key={tour.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                            {tour.name || tour.title || "Untitled Tour"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {tour.agent?.name || "Unknown"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {tour.guidePrice != null && Number.isFinite(tour.guidePrice)
                                                                ? `¥${Number(tour.guidePrice).toLocaleString()}`
                                                                : "-"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {tour.location || "-"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {tour.activity_type || tour.activityType || "-"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(tour.status)}`}>
                                                                {tour.status || "draft"}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {tour.created_at ? new Date(tour.created_at).toLocaleDateString() : "-"}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedTour(tour);
                                                                        setViewModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                    title="View Tour"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedTour(tour);
                                                                        setEditModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                                                                    title="Edit Tour"
                                                                >
                                                                    <Edit className="w-4 h-4" />
                                                                </button>
                                                                {(tour.status === "published") ? (
                                                                    <button
                                                                        onClick={() => handleStatusChange(tour.id, "banned")}
                                                                        className="p-2 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                                                        title="Stop Posting (Ban)"
                                                                    >
                                                                        <Ban className="w-4 h-4" />
                                                                    </button>
                                                                ) : (tour.status === "banned") ? (
                                                                    <button
                                                                        onClick={() => handleStatusChange(tour.id, "published")}
                                                                        className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                                                                        title="Publish Tour"
                                                                    >
                                                                        <CheckCircle className="w-4 h-4" />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => handleStatusChange(tour.id, "published")}
                                                                        className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                                                                        title="Publish Tour"
                                                                    >
                                                                        <CheckCircle className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleDelete(tour.id)}
                                                                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                    title="Delete Tour"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {tours.length === 0 && (
                                                    <tr>
                                                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                                            No tours found
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                                    <p className="text-xs lg:text-sm text-gray-600">
                                        {total === 0
                                            ? "No tours found"
                                            : `Showing ${(page - 1) * perPage + 1} to ${Math.min(
                                                page * perPage,
                                                total
                                            )} of ${total} tours`}
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
                                            disabled={page === totalPages || totalPages === 0}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </AdminLayout>

            {/* View Tour Modal */}
            {selectedTour && (
                <TourDetailModal
                    isOpen={viewModalOpen}
                    onClose={setViewModalOpen}
                    selectedTour={selectedTour}
                />
            )}

            {/* Edit Tour Modal */}
            {selectedTour && (
                <UpdateTourModal
                    open={editModalOpen}
                    onOpenChange={(open) => {
                        setEditModalOpen(open);
                        if (!open) {
                            setSelectedTour(null);
                        }
                    }}
                    tour={selectedTour}
                    dataUpdate={dataUpdate}
                    setDataUpdate={(value) => {
                        setDataUpdate(value);
                        // Reload tours after update - this will trigger the useEffect to refetch
                    }}
                />
            )}
        </div>
    )
}

export default function Page() {
    return (
        <Suspense
            fallback={
                <AdminLayout>
                    <div className="p-8 text-gray-500">Loading tours…</div>
                </AdminLayout>
            }
        >
            <AdminToursInner />
        </Suspense>
    );
}

