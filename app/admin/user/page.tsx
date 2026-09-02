"use client"
import React, { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MoreVertical, Search, Trash2, UserIcon, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { UserType } from '@/app/types';
import {
    ADMIN_ACCOUNT_TYPE_BADGE,
    displayUserEmail,
    resolveAdminAccountType,
    type AdminAccountType,
} from '@/lib/admin-account-type';
import { getSignedUrls, type SignItem } from '@/lib/storage-sign-client';
import { BUCKETS } from '@/lib/buckets';
import Image from 'next/image';
import ViewUserModal from '@/components/view_user/view-user-modal';
import WarningModal from '@/components/warning_modal/warning-modal';
import AdminLayout from '@/components/admin_layout/admin-layout';
import { supabase } from '@/lib/supabase';
import { ADMIN_USER_PRESENCE_CHANNEL } from '@/lib/admin-user-presence-channel';
import { derivePresenceDisplay } from '@/lib/presence';
import { startAdminOverallAccess } from '@/lib/admin-overall-access-client';

/** Status dot on avatar (no table column); tooltip + aria-label for accessibility. */
function PresenceAvatarDot({
    presence,
    name,
}: {
    presence: UserType["presence_display"];
    name: string;
}) {
    const v = presence ?? "offline";
    const color =
        v === "online" ? "bg-emerald-500" : v === "idle" ? "bg-amber-500" : "bg-gray-400";
    const label = v === "online" ? "Online" : v === "idle" ? "Idle" : "Offline";
    return (
        <span
            className={`absolute bottom-0 right-0 z-10 block size-3 rounded-full border-2 border-white shadow-sm ${color}`}
            title={`${name} — ${label}`}
            aria-label={`${name}, ${label}`}
        />
    );
}

function AdminUserPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialApproval =
        searchParams.get("approvalStatus") === "pending"
            ? "pending"
            : searchParams.get("filter") === "pending"
              ? "pending"
              : "all";

    const [userList, setUserList] = useState<UserType[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserType[]>([]);
    const [userInfo, setUserInfo] = useState<UserType>({} as UserType);
    const [viewModal, setViewModal] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [role, setRole] = useState("");
    const [viewId, steViewId] = useState<number>(0);
    const [openMenu, setOpenMenu] = useState<number | null>(null);

    const toggleMenu = (id: number) => {
        setOpenMenu(openMenu === id ? null : id);
    };

    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");
    const [accountType, setAccountType] = useState<AdminAccountType | "all">("all");
    const [approvalStatus, setApprovalStatus] = useState<"all" | "pending" | "approved">(
        initialApproval as "all" | "pending" | "approved"
    );
    const options = ["all", "weekly", "monthly", "yearly"] as const;
    const [isOpen, setIsOpen] = useState(false);
    const [approvingId, setApprovingId] = useState<string | number | null>(null);
    const [accessingId, setAccessingId] = useState<string | number | null>(null);
    const [userToRemove, setUserToRemove] = useState<UserType | null>(null);
    const [removingId, setRemovingId] = useState<string | number | null>(null);

    const handleSelect = (option: typeof options[number]) => {
        setFilter(option);
        setIsOpen(false);
    };

    // Reset to page 1 when search or date filter changes
    useEffect(() => {
        setPage(1);
    }, [search, filter, accountType, approvalStatus]);

    /** Live presence via Supabase Realtime (WebSocket) broadcast from /api/presence and logout. */
    useEffect(() => {
        const ch = supabase
            .channel(ADMIN_USER_PRESENCE_CHANNEL)
            .on(
                "broadcast",
                { event: "presence" },
                (msg) => {
                    const p = msg.payload as {
                        userId?: string;
                        presence_state?: string | null;
                        presence_updated_at?: string | null;
                    };
                    if (!p?.userId || !p.presence_updated_at) return;
                    const display = derivePresenceDisplay(p.presence_state, p.presence_updated_at);
                    const merge = (prev: UserType[]) =>
                        prev.map((u) =>
                            String(u.id) === String(p.userId)
                                ? {
                                      ...u,
                                      presence_display: display,
                                      presence_state: p.presence_state ?? null,
                                      presence_updated_at: p.presence_updated_at,
                                  }
                                : u
                        );
                    setUserList(merge);
                    setFilteredUsers(merge);
                    setUserInfo((prev) =>
                        prev?.id != null && String(prev.id) === String(p.userId)
                            ? {
                                  ...prev,
                                  presence_display: display,
                                  presence_state: p.presence_state ?? null,
                                  presence_updated_at: p.presence_updated_at,
                              }
                            : prev
                    );
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(ch);
        };
    }, []);

    /** Re-derive offline from timestamps when heartbeats stop (no broadcast on natural expiry). */
    useEffect(() => {
        const id = window.setInterval(() => {
            const tick = (prev: UserType[]) =>
                prev.map((u) => ({
                    ...u,
                    presence_display: derivePresenceDisplay(u.presence_state, u.presence_updated_at),
                }));
            setUserList(tick);
            setFilteredUsers(tick);
            setUserInfo((prev) =>
                prev?.id != null
                    ? {
                          ...prev,
                          presence_display: derivePresenceDisplay(
                              prev.presence_state,
                              prev.presence_updated_at
                          ),
                      }
                    : prev
            );
        }, 15_000);
        return () => window.clearInterval(id);
    }, []);

    const getAccountTypeBadge = (user: UserType) => {
        const type = user.account_type || resolveAdminAccountType(user);
        const label = user.account_type_label || type;
        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${ADMIN_ACCOUNT_TYPE_BADGE[type]}`}>
                {label}
            </span>
        );
    };

    const getVerifiedBadge = (status: boolean) => {
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

    const getActiveBadge = (status: boolean) => {
        // Map boolean to string status
        const statusText = status ? "Active" : "Suspended";

        // Define styles
        const styles: Record<string, string> = {
            Active: "bg-green-100 text-green-800",
            Suspended: "bg-yellow-100 text-yellow-800",
            Banned: "bg-red-100 text-red-800", // optional if you have banned users
        };

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[statusText]}`}>
                {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
            </span>
        );
    };

    const getApprovedBadge = (user: UserType) => {
        if (user.role !== "agent" && user.role !== "guide") {
            return <span className="text-gray-400">—</span>;
        }
        const approved = user.guide_approved === true;
        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {approved ? "Approved" : "Pending"}
            </span>
        );
    };

    const handleApproveUser = async (userId: string | number) => {
        setApprovingId(userId);
        try {
            const res = await fetch("/api/admin/user/approve", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (data.ok) {
                toast.success("User approved. They now have full platform access.");
                const update = (u: UserType) =>
                    String(u.id) === String(userId) && (u.role === "guide" || u.role === "agent")
                        ? { ...u, guide_approved: true }
                        : u;
                setUserList((prev) => prev.map(update));
                setFilteredUsers((prev) => prev.map(update));
            } else {
                toast.error(data.error || "Failed to approve.");
            }
        } catch {
            toast.error("Failed to approve user.");
        } finally {
            setApprovingId(null);
        }
    };

    const handleAccessAccount = async (user: UserType) => {
        if (user.role !== "guide" && user.role !== "agent") {
            toast.error("Overall access is only available for advisor and guide accounts.");
            return;
        }
        if (user.is_active === false) {
            toast.error("Reactivate this account before accessing it.");
            return;
        }
        setAccessingId(user.id);
        try {
            const result = await startAdminOverallAccess(String(user.id));
            if (!result.ok) {
                toast.error(result.error || "Could not access this account.");
                return;
            }
            toast.success(`Accessing ${result.targetName || "account"}…`);
            // Full page load, not router.push: overall access swaps the session cookies,
            // so every client cache built for the admin — bootstrap identity, unread counts,
            // any open admin poller — has to be discarded. A soft navigation kept them, which
            // is why admin screens carried on polling as the advisor and 403ing.
            window.location.assign(result.redirectTo || "/");
        } catch {
            toast.error("Could not access this account.");
        } finally {
            setAccessingId(null);
        }
    };

    const openUserDetail = (user: UserType) => {
        router.push(`/admin/users/${user.id}`);
    };

    // Fetch users: search and filter are applied server-side; one batch signed-URL request for speed
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    page: page.toString(),
                    perPage: perPage.toString(),
                    search,
                    filter,
                    accountType,
                    approvalStatus,
                });
                const res = await fetch(`/api/admin/user?${params.toString()}`, { cache: "no-store" });
                const data = await res.json();
                if (cancelled) return;

                setTotal(data.total ?? 0);
                const users: UserType[] = data.userList ?? [];
                if (users.length === 0) {
                    setUserList([]);
                    setFilteredUsers([]);
                    return;
                }

                // Single batch request for all avatar signed URLs instead of one per user
                const signItems: SignItem[] = users
                    .map((u): SignItem | null => (typeof u.profile_image === "string" && u.profile_image ? { bucket: BUCKETS.avatars, path: u.profile_image } : null))
                    .filter((x): x is SignItem => x !== null);
                const signedResults = signItems.length > 0 ? await getSignedUrls(signItems) : [];
                let signIndex = 0;
                const usersWithSignedUrls = users.map((user) => {
                    const path = user.profile_image;
                    if (typeof path === "string" && path) {
                        const signed = signedResults[signIndex++];
                        return {
                            ...user,
                            signedProfileUrl: signed?.signedUrl ?? signed?.publicUrl ?? null,
                        };
                    }
                    return { ...user, signedProfileUrl: null };
                });
                if (cancelled) return;
                setUserList(usersWithSignedUrls);
                setFilteredUsers(usersWithSignedUrls);
            } catch (err) {
                if (!cancelled) console.error("Error fetching users", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [page, perPage, search, filter, accountType, approvalStatus]);
    const totalPages = Math.ceil(total / perPage);
    // Toggle user active status
    // const handleToggle = async (userId: number, isActive: boolean) => {
    //     setSelectedUser({ id: userId, isActive });
    //     setWarningModal(true);
    // };




    // const PassModal = (userId: number) => {
    //     setPasswordModal(true);
    //     steUserId(userId)
    // }

    const activityModal = (userId: number, role: string) => {
        setViewModal(true);
        steViewId(userId);
        setRole(role);
    };

    const handleRemoveUser = (user: UserType) => {
        setUserToRemove(user);
    };

    const handleConfirmRemove = async () => {
        if (!userToRemove) return;
        const id = userToRemove.id;
        setRemovingId(id);
        try {
            const res = await fetch("/api/admin/user/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: id }),
            });
            const data = await res.json();
            if (data.ok) {
                toast.success("User and all related data have been removed.");
                setUserList((prev) => prev.filter((u) => String(u.id) !== String(id)));
                setFilteredUsers((prev) => prev.filter((u) => String(u.id) !== String(id)));
                setTotal((t) => Math.max(0, t - 1));
                setUserToRemove(null);
            } else {
                toast.error(data.error || "Failed to remove user.");
            }
        } catch {
            toast.error("Failed to remove user.");
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <>
            <AdminLayout>
                <div className="max-w-7xl mx-auto">
                    {/* Page Header */}
                    <div className="mb-8">
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">User Management</h1>
                        <p className="text-sm text-gray-500 mb-4">
                            Review travel agents, tour operators, independent guides, and operator-managed guides. Approve accounts to grant full platform access. Click a row to open the full account dossier.
                        </p>
                        <div className="flex flex-col gap-3 mb-2">
                            <div className="flex flex-wrap gap-2">
                                {(
                                    [
                                        ["all", "All approvals"],
                                        ["pending", "Pending approval"],
                                        ["approved", "Approved"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setApprovalStatus(key)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                            approvalStatus === key
                                                ? "bg-amber-100 border-amber-300 text-amber-900"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(
                                    [
                                        ["all", "All accounts"],
                                        ["agent", "Agents"],
                                        ["operator", "Operators"],
                                        ["guide", "Independent guides"],
                                        ["managed_guide", "Managed guides"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setAccountType(key)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                            accountType === key
                                                ? "bg-amber-100 border-amber-300 text-amber-900"
                                                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {(approvalStatus !== "all" || search.trim()) && (
                            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                                Showing filtered results
                                {approvalStatus === "pending" ? " (pending approval only)" : approvalStatus === "approved" ? " (approved only)" : ""}
                                {search.trim() ? ` matching “${search.trim()}”` : ""}.
                                {" "}
                                <button
                                    type="button"
                                    className="font-semibold underline"
                                    onClick={() => {
                                        setApprovalStatus("all");
                                        setSearch("");
                                    }}
                                >
                                    Clear filters
                                </button>
                            </p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name or email..."
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-sm"
                                />
                            </div>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(!isOpen)}
                                    className="inline-flex items-center justify-between gap-2 min-w-[140px] rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                >
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                    <svg className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {isOpen && (
                                    <div className="absolute right-0 mt-1 w-full min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-20">
                                        {options.map((option) => (
                                            <button
                                                key={option}
                                                onClick={() => handleSelect(option)}
                                                className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${filter === option ? "bg-amber-50 text-amber-800 font-medium" : "text-gray-700"}`}
                                            >
                                                {option.charAt(0).toUpperCase() + option.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Users Table */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* Mobile Cards View */}
                        {/* <div className="md:hidden divide-y divide-gray-200">
                {users.map((user) => (
                  <div key={user.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                          {user.initials}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                          <div className="text-xs text-gray-400">{user.company}</div>
                        </div>
                      </div>
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <MoreVertical className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500 block mb-1">Role</span>
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'agent'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-1">Status</span>
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {user.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-1">Last Active</span>
                        <span className="text-gray-900">{user.lastActive}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-1">Bookings</span>
                        <span className="text-gray-900 font-medium">{user.bookings}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-1">Alerts</span>
                        <span className={`font-medium ${
                          user.alerts > 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {user.alerts}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-1">Created</span>
                        <span className="text-gray-900">{user.created}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div> */}

                        {/* Tablet/Desktop Table View with Horizontal Scroll */}
                        <div className="hidden md:block overflow-x-auto">
                            <div className="inline-block min-w-full align-middle">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 min-w-[250px]">
                                                User Name
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Account type
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Affiliation
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Verified
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Approved
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Status
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Last Active
                                            </th>
                                            {/* <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                        Bookings
                                                    </th> */}
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Alerts
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Created
                                            </th>
                                            <th className="text-left px-4 lg:px-6 py-4 text-sm font-semibold text-gray-700 whitespace-nowrap">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={10} className="px-6 py-12 text-center text-sm text-gray-500">
                                                    Loading users…
                                                </td>
                                            </tr>
                                        ) : (
                                        filteredUsers.map((user) => (
                                            <tr
                                                key={String(user.id)}
                                                onClick={() => openUserDetail(user)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        openUserDetail(user);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="link"
                                                aria-label={`View ${user.first_name} ${user.last_name}`}
                                                className="hover:bg-gray-50 transition-colors cursor-pointer group focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:-outline-offset-2"
                                            >
                                                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative h-10 w-10 shrink-0">
                                                            <div className="h-10 w-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                                                                {user?.signedProfileUrl ? (
                                                                    <Image
                                                                        src={user.signedProfileUrl}
                                                                        alt={`${user.first_name} ${user.last_name}`}
                                                                        width={100}
                                                                        height={100}
                                                                        className="w-full h-full object-cover rounded-full"
                                                                    />
                                                                ) : (
                                                                    <UserIcon className="h-5 w-5 text-gray-400" />
                                                                )}
                                                            </div>
                                                            <PresenceAvatarDot presence={user.presence_display} name={`${user.first_name} ${user.last_name}`} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-gray-900 truncate">{user.first_name} {user.last_name}</div>
                                                            <div className="text-xs text-gray-500 truncate">{displayUserEmail(user.email)}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-6 py-4 whitespace-nowrap">{getAccountTypeBadge(user)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {user.account_type === "managed_guide" && user.managed_by_operator_name ? (
                                                        <span>Operator: {user.managed_by_operator_name}</span>
                                                    ) : user.account_type === "operator" ? (
                                                        <span>{user.managed_guide_count ?? 0} managed guide(s)</span>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">{getVerifiedBadge(user.is_verified)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {getApprovedBadge(user)}
                                                        {(user.role === "guide" || user.role === "agent") && user.guide_approved !== true && (
                                                            <Button
                                                                size="sm"
                                                                type="button"
                                                                disabled={approvingId === user.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleApproveUser(user.id);
                                                                }}
                                                                className="shrink-0 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                                                            >
                                                                {approvingId === user.id ? "Approving…" : "Approve"}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">{getActiveBadge(user.is_active)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {user.last_active ? new Date(user.last_active).toDateString() : "—"}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {user.alert_count ? <span className="text-red-600 font-medium">{user.alert_count}</span> : <span className="text-gray-400">0</span>}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(user.created_at).toDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1">
                                                        {(user.role === "guide" || user.role === "agent") && user.is_active !== false && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleAccessAccount(user)}
                                                                disabled={accessingId === user.id}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                                                aria-label="Access account"
                                                                title="Access account (overall access)"
                                                            >
                                                                <LogIn className="h-5 w-5" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                activityModal(user.id, user.role);
                                                                setOpenMenu(null);
                                                                setUserInfo(user);
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                                            aria-label="Quick actions"
                                                        >
                                                            <MoreVertical className="h-5 w-5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveUser(user)}
                                                            disabled={removingId !== null}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                                            aria-label="Remove user"
                                                        >
                                                            <Trash2 className="h-5 w-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )))
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        <div className="px-4 lg:px-6 py-3 border-t border-gray-200 bg-gray-50/50 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-gray-600">
                                {total === 0
                                    ? "No users found"
                                    : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
                            </p>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                                    disabled={page === 1}
                                    className="h-8"
                                >
                                    Previous
                                </Button>
                                <span className="px-3 text-sm text-gray-600">Page {page}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                                    disabled={page === totalPages}
                                    className="h-8"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </AdminLayout>



            <ViewUserModal
                isOpen={viewModal}
                onClose={setViewModal}
                userInfo={userInfo}
                onUserUpdated={(userId, isActive) => {
                    const update = (u: UserType) =>
                        String(u.id) === String(userId) ? { ...u, is_active: isActive } : u;
                    setUserList((prev) => prev.map(update));
                    setFilteredUsers((prev) => prev.map(update));
                    if (String(userInfo?.id) === String(userId)) {
                        setUserInfo((prev) => ({ ...prev, is_active: isActive }));
                    }
                }}
            />

            <WarningModal
                isOpen={userToRemove !== null}
                title="Remove user"
                message={userToRemove
                    ? `Are you sure you want to permanently remove ${userToRemove.first_name} ${userToRemove.last_name} (${userToRemove.email})? This will delete their account and all related data (profiles, applications, chats, jobs, etc.) and cannot be undone.`
                    : ""}
                onConfirm={handleConfirmRemove}
                onCancel={() => setUserToRemove(null)}
            />
        </>
    )
}

export default function AdminUserPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}>
            <AdminUserPageInner />
        </Suspense>
    );
}