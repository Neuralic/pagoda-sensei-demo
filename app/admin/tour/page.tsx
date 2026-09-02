"use client"
import React, { useEffect, useState } from 'react'
import AdminLayout from '@/components/admin_layout/admin-layout'
import { Booking } from '@/app/types';
import { Search } from 'lucide-react';


// Function to fetch booking data
const loadBookingData = async (
    page: number,
    perPage: number,
    search: string,
    filter: "weekly" | "monthly" | "yearly" | "all"
) => {
    const params = new URLSearchParams({
        page: page.toString(),
        perPage: perPage.toString(),
        search,
        filter,
    });

    const res = await fetch(`/api/booking?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch booking data");
    const data = await res.json();
    return data;
};

const Page = () => {

    const [bookingInfo, setBookingInfo] = useState<Booking[]>([]);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage] = useState(10); // show 5 items per page
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");
    const options = ["all", "weekly", "monthly", "yearly"] as const;
    const [isOpen, setIsOpen] = useState(false);

    const handleSelect = (option: typeof options[number]) => {
        setFilter(option);
        setIsOpen(false);
    };
    useEffect(() => {
        async function load() {
            try {
                const data = await loadBookingData(page, perPage, search, filter);
                // const users: UserType[] = data.userList || [];
                // const usersWithSignedUrls = await Promise.all(
                //     users.map(async (user) => {
                //         const path = user.profile_image;
                //         if (typeof path === "string" && path) {
                //             const [signed] = await getSignedUrls([{ bucket: BUCKETS.avatars, path }]);
                //             return {
                //                 ...user,
                //                 signedProfileUrl: signed?.signedUrl || signed?.publicUrl || null,
                //             };
                //         }
                //         return { ...user, signedProfileUrl: null };
                //     })
                // );
                // setUserList(usersWithSignedUrls);
                // setFilteredUsers(usersWithSignedUrls);
                setBookingInfo(data.booking);
                setTotal(data.total || 0);

            } catch (err) {
                console.error("Error fetching users", err);
            }
        }

        load();
    }, [page, perPage, search, filter]);
    const totalPages = Math.ceil(total / perPage);
    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                    <div className='max-w-md'>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Tour Management</h1>
                        <p className="text-gray-600 mt-1">Track, Update, and manage all bookings across the platform.</p>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search, review, and control all agent and guide accounts..."
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
                                            className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${filter === option ? "font-bold" : ""
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
                        <div className="inline-block min-w-full align-middle">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 min-w-[250px]">
                                            Tour
                                        </th>
                                        <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            Submitted by
                                        </th>
                                        <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            Date Submitted
                                        </th>
                                        <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            Status
                                        </th>
                                        <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            Issues
                                        </th>
                                        <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {bookingInfo?.map((booking) => (
                                        <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="sticky left-0 z-10 bg-gray-50 px-6 py-4 text-xs font-bold text-[#111827] whitespace-nowrap">
                                                {booking.job_title}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-[#111827]">
                                                {booking.first_name} {booking.last_name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {new Date(booking.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-medium ${booking.status === "pending"
                                                            ? "bg-[#ECFDF5] text-[#047857] border border-green-300"
                                                            : "bg-[#FAF9E2] text-[#CD9825] border"
                                                        }`}
                                                >
                                                    {booking.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                {booking.issueExists ? "Issue" : "Solved"}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                Review
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs lg:text-sm text-gray-600">
                            {total === 0
                                ? "No users found"
                                : `Showing ${(page - 1) * perPage + 1} to ${Math.min(
                                    page * perPage,
                                    total
                                )} of ${total} users`}
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
    )
}

export default Page