import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '../ui/dialog';

import { calculateTimeDuration, formatDate } from '@/lib/common-function';
import Image from 'next/image';
import { AlertTriangle, Ban, Calendar, Clock, Edit, LogIn, Mail, MapPin, MoreVertical, Phone, UserCheck, Users, X } from 'lucide-react';
import { getSignedUrls } from '@/lib/storage-sign-client';
import { BUCKETS } from '@/lib/buckets';
import { ApiItinerary, CardItinerary, UserType } from '@/app/types';
import {
    ADMIN_ACCOUNT_TYPE_LABELS,
    displayUserEmail,
    resolveAdminAccountType,
} from '@/lib/admin-account-type';
import PasswordChange from '../password_modal/password-change';
import WarningModal from '../warning_modal/warning-modal';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { startAdminOverallAccess } from '@/lib/admin-overall-access-client';

interface userModalProps {
    isOpen: boolean;
    onClose: (value: boolean) => void;
    userInfo: UserType;
    /** Called after suspend or activate so the parent can update its user list. */
    onUserUpdated?: (userId: string | number, isActive: boolean, result?: { jobsNoLongerAvailable?: number; toursBanned?: number }) => void;
}

export interface Tour {
    id: string;
    image?: string;
    name: string;
    location?: string;
    description?: string;
    activity_type?: string;
    start_time?: string;
    end_time?: string;
    group_size?: number;
    tour_date?: string;
    languages?: string[];
    created_at?: string;
    agent?: string;
    country?: string;
    notes?: string;
}

export interface MappedTour {
    id: string | undefined;
    image: string;
    title?: string;
    location?: string;
    description: string;
    activity_type: string;
    duration: string;
    people: number;
    stops: number;
    tour_date?: string;
    highlights: string;
    languages: string[];
    postedDate?: string;
    agent?: string;
    country?: string;
    notes: string;
    start_time: string;
    end_time: string;
    signedProfileUrl: string | null;
}


const ViewUserModal = ({ isOpen, onClose, userInfo, onUserUpdated }: userModalProps) => {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tours, setTours] = useState<MappedTour[]>([]);
    const [items, setItems] = useState<CardItinerary[]>([]);
    const [passwordModal, setPasswordModal] = useState<boolean>(false);
    const [warningModal, setWarningModal] = useState<boolean>(false);
    const [selectedUser, setSelectedUser] = useState<{ id: number; isActive: boolean } | null>(null);
    const [userList, setUserList] = useState<UserType[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserType[]>([]);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [accessing, setAccessing] = useState(false);

    const PassModal = () => {
        setPasswordModal(true);
        // steUserId(userId)
    }

    const handleToggle = async (userId: number, isActive: boolean) => {
        setSelectedUser({ id: userId, isActive });
        setWarningModal(true);
    };

    const handleAccessAccount = async () => {
        if (userInfo.role !== "guide" && userInfo.role !== "agent") {
            toast.error("Overall access is only available for advisor and guide accounts.");
            return;
        }
        if (userInfo.is_active === false) {
            toast.error("Reactivate this account before accessing it.");
            return;
        }
        setAccessing(true);
        try {
            const result = await startAdminOverallAccess(String(userInfo.id));
            if (!result.ok) {
                toast.error(result.error || "Could not access this account.");
                return;
            }
            onClose(false);
            toast.success(`Accessing ${result.targetName || "account"}…`);
            // Full page load, not router.push: overall access swaps the session cookies,
            // so every client cache built for the admin — bootstrap identity, unread counts,
            // any open admin poller — has to be discarded. A soft navigation kept them, which
            // is why admin screens carried on polling as the advisor and 403ing.
            window.location.assign(result.redirectTo || "/");
        } catch {
            toast.error("Could not access this account.");
        } finally {
            setAccessing(false);
        }
    };

    const [activeTab, setActiveTab] = useState('overview');
    const [showMenu, setShowMenu] = useState(false);

    const handleConfirmToggle = async () => {
        if (!selectedUser) return;

        const { id, isActive } = selectedUser;
        setToggleLoading(true);

        try {
            if (isActive) {
                // Suspend: use admin suspend API (applies role-specific side effects and returns result)
                const response = await fetch("/api/admin/user/suspend", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: id }),
                });
                const data = await response.json();

                if (data.ok) {
                    const parts: string[] = ["Account suspended."];
                    if (data.jobsNoLongerAvailable != null && data.jobsNoLongerAvailable > 0) {
                        parts.push(`${data.jobsNoLongerAvailable} job(s) are no longer available for bidding.`);
                    }
                    if (data.toursBanned != null && data.toursBanned > 0) {
                        parts.push(`${data.toursBanned} tour(s) have been banned.`);
                    }
                    toast.success(parts.join(" "), { duration: 5000 });
                    onUserUpdated?.(id, false, {
                        jobsNoLongerAvailable: data.jobsNoLongerAvailable,
                        toursBanned: data.toursBanned,
                    });
                } else {
                    toast.error(data.error || "Failed to suspend account.");
                }
            } else {
                // Activate: simple status update
                const response = await fetch(`/api/user/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: id, is_active: true }),
                });
                const data = await response.json();

                if (data.ok) {
                    toast.success("Account activated.");
                    onUserUpdated?.(id, true);
                } else {
                    toast.error(data.error || "Failed to activate account.");
                }
            }
        } catch (err) {
            console.error("API error", err);
            toast.error("Request failed.");
        } finally {
            setToggleLoading(false);
            setWarningModal(false);
            setSelectedUser(null);
        }
    };

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'activity', label: 'Activity' },
        { id: 'notes', label: 'Notes' }
    ];

    const activities = [
        { type: 'booking', date: '2024-12-05', description: 'Booked Paris City Tour', time: '14:30' },
        { type: 'update', date: '2024-12-03', description: 'Updated contact information', time: '09:15' },
        { type: 'booking', date: '2024-11-28', description: 'Booked Seine River Cruise', time: '16:45' },
        { type: 'note', date: '2024-11-20', description: 'Added note: Prefers morning tours', time: '11:20' },
    ];

    const notes = [
        { id: 1, date: '2024-11-20', author: 'John Smith', content: 'Customer prefers morning tours. Very punctual and organized.' },
        { id: 2, date: '2024-10-15', author: 'Emma Davis', content: 'Regular customer, often books group tours for corporate events.' },
    ];

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="
      w-[1200px] max-w-xl min-h-[100vh] overflow-y-auto p-4
      fixed top-0 left-1/2 -translate-x-1/2
      bg-white rounded-none shadow-lg h-full z-[500]
    ">
                    <div className="bg-white overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 ">
                            <div className="flex items-center space-x-4">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-semibold">
                                    SC
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{userInfo.first_name} {userInfo.last_name}</h2>
                                    {/* <p className="text-gray-500 text-sm">TourCo Inc</p> */}
                                </div>
                            </div>
                            <button onClick={()=>onClose(false)} className="cursor-pointer p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex  px-6">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                                            ? 'text-[#404040]'
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {tab.label}
                                    {activeTab === tab.id && (
                                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#404040]" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Account Details Card */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
                                        <div className="space-y-3">
                                            <div className="flex items-center">
                                                <span className="text-sm text-gray-600 mr-4">Account type:</span>
                                                <span className="px-3 py-1 text-gray-900 rounded-full text-xs font-medium">
                                                    {userInfo.account_type_label ||
                                                        ADMIN_ACCOUNT_TYPE_LABELS[resolveAdminAccountType(userInfo)]}
                                                </span>
                                            </div>
                                            {(userInfo.account_type === "managed_guide" ||
                                                userInfo.managed_by_operator_id) &&
                                                userInfo.managed_by_operator_name && (
                                                    <div className="flex items-center">
                                                        <span className="text-sm text-gray-600 mr-4">Managed by:</span>
                                                        <span className="text-sm text-gray-900">
                                                            {userInfo.managed_by_operator_name}
                                                        </span>
                                                    </div>
                                                )}
                                            {userInfo.account_type === "operator" && (
                                                <div className="flex items-center">
                                                    <span className="text-sm text-gray-600 mr-4">Team size:</span>
                                                    <span className="text-sm text-gray-900">
                                                        {userInfo.managed_guide_count ?? 0} managed guide(s)
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center">
                                                <span className="text-sm text-gray-600 mr-4">Platform role:</span>
                                                <span className="px-3 py-1 text-blue-700 rounded-full text-xs font-medium capitalize">
                                                    {userInfo.role}
                                                </span>
                                            </div>
                                            <div className="flex items-center">
                                                <span className="text-sm text-gray-600 mr-4">Status:</span>
                                                <span className="px-3 py-1  text-green-700 rounded-full text-xs font-medium">
                                                    {userInfo.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <div className="flex items-center py-2 border-t border-gray-100">
                                                <span className="text-sm text-gray-600 flex items-center gap-2 mr-4">
                                                    Email:
                                                </span>
                                                <span className="text-sm text-gray-900">{displayUserEmail(userInfo.email)}</span>
                                            </div>
                                            <div className="flex items-center mr-4 py-2 border-t border-gray-100">
                                                <span className="text-sm text-gray-600 mr-4 flex items-center gap-2">
                                                    Phone:
                                                </span>
                                                <span className="text-sm text-gray-900">{userInfo.phone}</span>
                                            </div>
                                            <div className="flex items-center py-2 border-t border-gray-100">
                                                <span className="text-sm text-gray-600 mr-4">Created:</span>
                                                <span className="text-sm text-gray-900">{userInfo.created_at}</span>
                                            </div>
                                            <div className="flex items-center py-2 border-t border-gray-100">
                                                <span className="text-sm text-gray-600 mr-4 flex items-center gap-2">
                                                    Last Active:
                                                </span>
                                                <span className="text-sm text-gray-900">{userInfo.last_active}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-6">
                                            <div className="flex flex-col  justify-start mb-2">
                                                <p className="text-sm text-[#4B5563] font-medium">Total Bookings</p>
                                                <span className='text-2xl text-black font-bold'>23</span>
                                            </div>
                                            <div className="text-3xl font-bold text-purple-900">
                                                <Calendar className="w-5 h-5 text-purple-500" />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-6">
                                             <div className="flex flex-col  justify-start mb-2">
                                                <p className="text-sm text-[#4B5563] font-medium">Alerts</p>
                                                <span className='text-2xl text-black font-bold'>{userInfo.alert_count}</span>
                                            </div>
                                            <div className="text-3xl font-bold text-purple-900">
                                              <AlertTriangle className="w-5 h-5 text-red-500" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {(userInfo.role === "guide" || userInfo.role === "agent") && userInfo.is_active !== false && (
                                            <button
                                                type="button"
                                                onClick={() => void handleAccessAccount()}
                                                disabled={accessing}
                                                className="sm:col-span-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                                            >
                                                <LogIn className="w-4 h-4" />
                                                {accessing ? "Opening…" : "Access account"}
                                            </button>
                                        )}
                                        {userInfo.is_active ? (
                                            <button
                                                onClick={() => {
                                                    handleToggle(userInfo.id, userInfo.is_active);
                                                }}
                                                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                                            >
                                                Suspend Account
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    handleToggle(userInfo.id, userInfo.is_active);
                                                }}
                                                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                                            >
                                                Activate Account
                                            </button>
                                        )}
                                        <button onClick={() => PassModal()} className="bg-white cursor-pointer hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg border border-gray-300 transition-colors">
                                            Reset Password
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'activity' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                                        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                            View All
                                        </button>
                                    </div>
                                    {activities.map((activity, index) => (
                                        <div key={index} className="flex gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${activity.type === 'booking' ? 'bg-blue-100' :
                                                    activity.type === 'update' ? 'bg-purple-100' : 'bg-gray-100'
                                                }`}>
                                                {activity.type === 'booking' ? (
                                                    <Calendar className={`w-5 h-5 ${activity.type === 'booking' ? 'text-blue-600' : 'text-purple-600'
                                                        }`} />
                                                ) : activity.type === 'update' ? (
                                                    <Edit className="w-5 h-5 text-purple-600" />
                                                ) : (
                                                    <Clock className="w-5 h-5 text-gray-600" />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {activity.date} at {activity.time}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'notes' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
                                        <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors">
                                            Add Note
                                        </button>
                                    </div>
                                    {notes.map((note) => (
                                        <div key={note.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{note.author}</p>
                                                    <p className="text-xs text-gray-500">{note.date}</p>
                                                </div>
                                                <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                                </button>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed">{note.content}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>


                </DialogContent>
            </Dialog>
            <PasswordChange isOpen={passwordModal} onClose={setPasswordModal} userId={userInfo.id} />
            <WarningModal
                isOpen={warningModal}
                title={selectedUser?.isActive ? "Suspend account" : "Activate account"}
                message={
                    selectedUser?.isActive
                        ? userInfo.role === "agent"
                            ? "This will suspend the agent. Their jobs will show as \"no longer available\" and guides will not be able to bid on them. Continue?"
                            : userInfo.role === "guide"
                                ? "This will suspend the guide and ban all tours they created. Continue?"
                                : "This will suspend the account. Continue?"
                        : "Activate this account? They will be able to sign in and use the platform again."
                }
                onConfirm={handleConfirmToggle}
                onCancel={() => setWarningModal(false)}
            />
        </>
    )
}

export default ViewUserModal