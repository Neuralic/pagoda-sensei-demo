"use client"
import React, { Suspense, useEffect, useState } from 'react';
import { Menu, X, Home, Users, Settings, BarChart, LogOut, Calendar, AlertTriangle, DollarSign, UserCheck, CheckCircle, UserIcon, MessageSquare, CurlyBraces, TrendingUp, User, CircleDollarSign, Calendar1, TrendingDown, ChevronRight, ArrowRight, Clock } from 'lucide-react';
import { MiniUser, PanicType, Role, TicketWithMessages, UserType } from '@/app/types';
import Link from 'next/link';
import Image from 'next/image';
import { getSignedUrls } from '@/lib/storage-sign-client';
import { BUCKETS } from '@/lib/buckets';
import AdminHeader from '@/components/admin_header/admin-header';
import AdminLayout from '@/components/admin_layout/admin-layout';


const Page = () => {

    const [totalGuide, setTotalGuide] = useState(0);
    const [totalAgency, setTotalAgency] = useState(0);
    const [totalOperators, setTotalOperators] = useState(0);
    const [totalManagedGuides, setTotalManagedGuides] = useState(0);

    const [panicList, setPanicList] = useState<TicketWithMessages[]>([]);
    const [solved, setSolved] = useState<number>(0);
    const [openTicket, setOpenTicket] = useState<number>(0);
    const [inProgress, setInProgress] = useState<number>(0);
    const [guideCount, setGuideCount] = useState(0);
    const [agencyCount, setAgencyCount] = useState<number>(0);
    const [bookedJobs, setBookedJobs] = useState(0);
    const [openJobs, setOpenJobs] = useState<number>(0);
    const [totalJobs, setTotalJobs] = useState<number>(0);
    const [totalApplications, setTotalApplications] = useState<number>(0);
    const [pendingApprovalTotal, setPendingApprovalTotal] = useState(0);
    const [pendingApprovalAgents, setPendingApprovalAgents] = useState(0);
    const [pendingApprovalGuides, setPendingApprovalGuides] = useState(0);
    const [jobsNoApplicants24h, setJobsNoApplicants24h] = useState(0);


    const [formData, setFormData] = useState({
        name: '',
        website: '',
        category: ''
    });

    const getRoleBadge = (role: Role) => {
        const styles: Record<Exclude<Role, undefined>, string> = {
            agent: "bg-blue-100 text-blue-800",
            guide: "bg-green-100 text-green-800",
        };

        if (!role) {
            return (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    Unknown
                </span>
            );
        }

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[role]}`}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
        );
    };

    const getStatusBadge = (status: boolean) => {
        // Map boolean to string status
        const statusText = status ? "Verified" : "Pending";

        // Define styles
        const styles: Record<string, string> = {
            Verified: "bg-green-100 text-green-800",
            Pending: "bg-yellow-100 text-yellow-800",
            banned: "bg-red-100 text-red-800", // optional if you have banned users
        };

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[statusText]}`}>
                {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
            </span>
        );
    };

    const handleSubmit = () => {
        if (formData.name && formData.website && formData.category) {
            alert('Form submitted successfully!');
            setFormData({ name: '', website: '', category: '' });
        } else {
            alert('Please fill in all fields');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };


    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/dashboard', { cache: 'no-store' })
                const data = await res.json();
                setTotalGuide(data.counts?.totalGuides ?? 0);
                setTotalAgency(data.counts?.totalAgencies ?? 0);
                setTotalOperators(data.counts?.totalOperators ?? 0);
                setTotalManagedGuides(data.counts?.totalManagedGuides ?? 0);
                setTotalJobs(data.counts.totalJobs);
                setTotalApplications(data.counts.totalApplications);
                setBookedJobs(data.counts.bookedJobs);
                setOpenJobs(data.counts.openJobs);
                setPendingApprovalTotal(data.counts.pendingApprovalTotal ?? 0);
                setPendingApprovalAgents(data.counts.pendingApprovalAgents ?? 0);
                setPendingApprovalGuides(data.counts.pendingApprovalGuides ?? 0);
                setJobsNoApplicants24h(data.counts.jobsNoApplicants24h ?? 0);

                // Fetch panic list
                const resPanic = await fetch("/api/panic", { cache: "no-store" });

                if (!resPanic.ok) throw new Error("Failed to fetch panic list");

                const panicData: {
                    ok: boolean;
                    counts?: {
                        agencies?: number;
                        guides?: number;
                    };
                    panicList?: Array<{
                        ticket_id: string;
                        sender_image?: string;
                        messages: Array<{
                            id: number;
                            message: string | null;
                            created_at: string;
                            sender: MiniUser | null;
                            status: boolean | null;
                            is_read: boolean | null;
                        }>;
                    }>;
                } = await resPanic.json();

                if (!panicData.ok || !panicData.panicList) return;

                const panicListWithUrls = await Promise.all(
                    panicData.panicList.map(async (user) => {
                        const path = user.sender_image;
                        if (typeof path === "string" && path) {
                            const [signed] = await getSignedUrls([{ bucket: BUCKETS.avatars, path }]);
                            return {
                                ...user,
                                signedProfileUrl: signed?.signedUrl || signed?.publicUrl || undefined,
                            };
                        }
                        return { ...user, signedProfileUrl: undefined };
                    })
                );


                //   setPanicLists(panicListWithUrls);
                //  setPanicList(panicData.panicList.length);
                setAgencyCount(panicData.counts?.agencies ?? 0);
                setGuideCount(panicData.counts?.guides ?? 0);

            } finally {
                console.log('asas');
            }
        }
        load()
    }, [totalJobs])


    useEffect(() => {
        async function load() {
            try {
                const resPanic = await fetch('/api/panic', { cache: 'no-store' })
                if (!resPanic.ok) throw new Error("Failed to fetch panic list");

                const panicData: {
                    ok: boolean;
                    solved: number,
                    open: number,
                    in_progress: number,
                    panicList?: Array<{
                        ticket_id: string;
                        sender_image?: string;
                        messages: Array<{
                            id: number;
                            message: string | null;
                            created_at: string;
                            sender: MiniUser | null;
                            status: boolean | null;
                            is_read: boolean | null;
                        }>;
                    }>;
                } = await resPanic.json();

                if (!panicData.ok || !panicData.panicList) return;


                const panicListWithUrls = await Promise.all(
                    panicData.panicList.map(async (user) => {
                        const path = user.sender_image;
                        if (typeof path === "string" && path) {
                            const [signed] = await getSignedUrls([{ bucket: BUCKETS.avatars, path }]);
                            return {
                                ...user,
                                signedProfileUrl: signed?.signedUrl || signed?.publicUrl || undefined,
                            };
                        }
                        return { ...user, signedProfileUrl: undefined };
                    })
                );
                setSolved(panicData.solved);
                setOpenTicket(panicData.open);
                setInProgress(panicData.in_progress);
                setPanicList(panicListWithUrls);
            } finally {
                console.log('Error');
            }
        }
        load()
    }, [])

    return (
        <>
            <AdminLayout>
                <div className="flex bg-gray-100">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col overflow-hidden">


                        {/* Content Area */}
                        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                            {/* Page Title */}
                            <div className="mb-8">
                                <h2 className="text-3xl font-bold text-gray-800">Dashboard Overview</h2>
                                <p className="text-gray-600 mt-1">Monitor users, bookings, and urgent alerts in one place.</p>
                            </div>

                            {(pendingApprovalTotal > 0 || jobsNoApplicants24h > 0) && (
                                <div className="mb-6 space-y-3">
                                    {pendingApprovalTotal > 0 && (
                                        <Link
                                            href="/admin/user?approvalStatus=pending"
                                            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100 transition-colors"
                                        >
                                            <UserCheck className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div>
                                                <p className="font-semibold">
                                                    {pendingApprovalTotal} account{pendingApprovalTotal === 1 ? "" : "s"} awaiting approval
                                                </p>
                                                <p className="text-sm mt-0.5">
                                                    {pendingApprovalAgents} agent(s) · {pendingApprovalGuides} guide(s) — review in User Management
                                                </p>
                                            </div>
                                            <ChevronRight className="ml-auto h-5 w-5 shrink-0" />
                                        </Link>
                                    )}
                                    {jobsNoApplicants24h > 0 && (
                                        <Link
                                            href="/admin/jobs"
                                            className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-orange-900 hover:bg-orange-100 transition-colors"
                                        >
                                            <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div>
                                                <p className="font-semibold">
                                                    {jobsNoApplicants24h} open job{jobsNoApplicants24h === 1 ? "" : "s"} with no guide applications (24h+)
                                                </p>
                                                <p className="text-sm mt-0.5">
                                                    Travel advisors may need personal follow-up — open Job Management
                                                </p>
                                            </div>
                                            <ChevronRight className="ml-auto h-5 w-5 shrink-0" />
                                        </Link>
                                    )}
                                </div>
                            )}

                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-8">
                                {/* Total Users Card */}
                                <div className="flex flex-col justify-between w-full items-start border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 bg-[#E7F2FF] rounded-lg flex items-center justify-center">
                                            <User className="text-[#4A4C4F]" size={24} />
                                        </div>
                                        <div className='ml-3'>
                                            <p className="text-sm text-gray-600">Total Users</p>
                                            <p className="text-3xl font-bold text-gray-800">{totalGuide + totalAgency}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-gray-600">
                                            Agents: {totalAgency} · Operators: {totalOperators} · Guides: {totalGuide}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        {totalManagedGuides} operator-managed guide profile(s)
                                    </p>
                                    <div className="flex items-center gap-2 text-sm text-[#059669] mt-7">
                                        <TrendingUp /> <span>12.5%</span>
                                    </div>
                                </div>

                                {/* Revenue Card */}
                                <div className="flex flex-col justify-between w-full items-start border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 bg-[#E8F7EC] rounded-lg flex items-center justify-center">
                                            <CircleDollarSign className="text-[#536859]" size={24} />
                                        </div>
                                        <div className='ml-3'>
                                            <p className="text-sm text-gray-600">Active Booking</p>
                                            <p className="text-3xl font-bold text-gray-800">{bookedJobs}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-gray-600">Open for booking {openJobs}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[#059669] mt-7">
                                        <TrendingUp /> <span>12.5%</span>
                                    </div>
                                </div>

                                {/* Active Bookings Card */}
                                {/* <div className="flex flex-col justify-between w-full items-start border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 bg-[#FFEBFC] rounded-lg flex items-center justify-center">
                                            <Calendar className="text-[#925188]" size={24} />
                                        </div>
                                        <div className='ml-3'>
                                            <p className="text-sm text-gray-600">Active Bookings</p>
                                            <p className="text-3xl font-bold text-gray-800">{totalGuide + totalAgency}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-gray-600">All registered Users</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[#DC2626] mt-7">
                                        <TrendingDown /> <span>12.5%</span>
                                    </div>
                                </div> */}


                                {/* Job list */}
                                <div className="flex flex-col justify-between w-full items-start border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 bg-[#FFEBFC] rounded-lg flex items-center justify-center">
                                            <Calendar className="text-[#925188]" size={24} />
                                        </div>
                                        <div className='ml-3'>
                                            <p className="text-sm text-gray-600">Jobs</p>
                                            <p className="text-3xl font-bold text-gray-800">{totalJobs}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-gray-600">Applied: {totalApplications} Free: {totalJobs - totalApplications}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[#DC2626] mt-7">
                                        <TrendingDown /> <span>12.5%</span>
                                    </div>
                                </div>

                                {/* Urgent Alerts Card */}
                                <div className="flex flex-col justify-between w-full items-start border border-[#D6B2B2] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 bg-[#FFECE7] rounded-lg flex items-center justify-center">
                                            <AlertTriangle className="text-[#AC434A]" size={24} />
                                        </div>
                                        <div className='ml-3'>
                                            <p className="text-sm text-gray-600">Urgent Alerts</p>
                                            <p className="text-3xl font-bold text-gray-800">{inProgress} Alerts</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="text-gray-600">All registered Users</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[#059669] mt-7">
                                        <TrendingUp /> <span>12.5%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Alert Banner - if there are urgent alerts */}
                            <div className='flex gap-2'>
                                <div className="bg-white w-full border border-[#BDBDBD] rounded-[5px] p-6 py-10 mb-4">
                                    <div className='flex items-end justify-between'>
                                        <div className='flex flex-col justify-between'>
                                            <h3 className="text-lg font-bold text-gray-800 mb-1">Alerts</h3>
                                            <p className="text-gray-600 text-sm mt-1">Emergency situations requiring immediate attention</p>
                                        </div>
                                        <div className='flex flex-col text-sm items-center justify-between'>
                                            <Link href="/admin/panic" className="text-sm text-gray-600 flex transition-colors">
                                                View All  <ArrowRight className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </div>
                                    {panicList.slice(0, 2).map((alert, index) => (
                                        <div key={index} className='bg-white border border-[#BDBDBD] rounded-[5px] p-3 mt-4'>
                                            <div className='flex justify-between'>
                                                <ul className='flex gap-1'>
                                                    <li className='text-[#AC434A] bg-[#FFECE7] rounded-sm px-2 py-1'>{alert.mark_solved ? "Solved" : "In progress"}</li>
                                                    <li className='text-[#AC434A] bg-[#FFECE7] rounded-sm px-2 py-1'>High</li>
                                                </ul>
                                                <span className='text-sm text-[#6B7280]'>{alert.last_message_time ? new Date(alert.last_message_time).toLocaleString() : "N/A"}</span>
                                            </div>
                                            <div className='flex flex-col'>
                                                <h6 className='text-[#111827] text-md'>{alert.sender_name}</h6>
                                                <p className='text-[#4B5563] text-md' > {alert.last_message ? alert.last_message : "N/A"}</p>
                                                <span className='text-[#6B7280] text-md' > 📍 {alert.job_location}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white w-full border border-[#BDBDBD] rounded-[5px] p-6 mb-4">
                                    <div className='flex items-end justify-between'>
                                        <div className='flex flex-col justify-between'>
                                            <h3 className="text-lg font-bold text-gray-800">Other Urgent Items</h3>
                                            <p className="text-gray-600">Additional items requiring review</p>
                                        </div>
                                    </div>
                                    <div className='flex h-full flex-col justify-center items-center'>
                                        <Clock className='w-20 h-20 text-[#BDBDBD]' />
                                        <h6 className='text-[#111827] text-md'>No urgent items</h6>
                                        <p className='text-[#4B5563] text-md' > You&apos;re all caught up! Check back later for updates.</p>
                                    </div>
                                </div>
                            </div>


                            {/* Recent Activity Section */}

                            {/* <div className="bg-white border border-[#BDBDBD] rounded-[5px] p-6">
                                <div className='flex flex-col justify-between'>
                                    <h3 className="text-lg font-bold text-gray-800 mb-1">Recent Activity</h3>
                                    <p className="text-gray-600 mt-1">Latest admin action and system events</p>
                                </div>
                                <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-10">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {userList.slice(0, 5).map((user) => (
                                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            10 Minutes ago
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            Suspended User account
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            Elena Rodriguez
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div> */}

                            <div className='flex gap-4 mt-6'>
                                <div className="flex w-full items-center justify-normal border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3 ">
                                    <div className="w-12 h-12  rounded-lg flex items-center justify-center">
                                        <User className="text-[#4A4C4F]" size={24} />
                                    </div>
                                    <div className='ml-3'>
                                        <p className="text-xl font-bold text-gray-800">Manage Users</p>
                                        <p className="text-sm text-gray-600 ">View and control all user accounts</p>
                                    </div>
                                </div>
                                <div className="flex w-full items-center justify-normal border border-[#BDBDBD] rounded-[5px] pt-5 pb-5 pl-3 pr-3">
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center">
                                        <AlertTriangle className="text-[#4A4C4F]" size={24} />
                                    </div>
                                    <div className='ml-3'>
                                        <p className="text-xl font-bold text-gray-800">Handle Alerts</p>
                                        <p className="text-sm text-gray-600 ">Respond to emergency situations</p>
                                    </div>
                                </div>
                            </div>

                        </main>
                    </div>
                </div>
            </AdminLayout>

        </>
    )
}

export default Page