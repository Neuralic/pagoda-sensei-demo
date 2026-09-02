"use client";

import React, { useState, useEffect } from "react";
import { UserPlus, Shield, Mail, Calendar, CheckCircle, XCircle, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin_layout/admin-layout";
import CreateAdminModal from "@/components/admin/create-admin-modal";
import WarningModal from "@/components/warning_modal/warning-modal";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string>("");
  const [adminToRemove, setAdminToRemove] = useState<AdminUser | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdmins();
    fetchCurrentAdmin();
  }, []);

  const fetchCurrentAdmin = async () => {
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.ok && data?.user?.id && data?.user?.role === "admin") {
        setCurrentAdminId(String(data.user.id));
      }
    } catch {
      /* ignore */
    }
  };

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/list", { cache: "no-store" });
      const data = await res.json();

      if (data.ok && Array.isArray(data.admins)) {
        setAdmins(data.admins);
      } else {
        toast.error(data.error || "Failed to fetch admins");
      }
    } catch (error) {
      console.error("Error fetching admins:", error);
      toast.error("Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuccess = () => {
    fetchAdmins();
  };

  const handleConfirmRemove = async () => {
    if (!adminToRemove) return;
    const id = adminToRemove.id;
    setRemovingId(id);
    try {
      const res = await fetch("/api/admin/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: id }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        toast.success("Administrator removed.");
        setAdmins((prev) => prev.filter((a) => a.id !== id));
        setAdminToRemove(null);
      } else {
        toast.error(data?.error || "Failed to remove administrator.");
      }
    } catch {
      toast.error("Failed to remove administrator.");
    } finally {
      setRemovingId(null);
    }
  };

  const activeAdminCount = admins.filter((a) => a.is_active).length;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
              Administrator Management
            </h1>
            <p className="text-gray-600">
              Manage system administrators and their access
            </p>
          </div>
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add New Admin
          </Button>
        </div>

        {/* Admins Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">Loading administrators...</p>
            </div>
          ) : admins.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No administrators found</p>
              <Button
                onClick={() => setCreateModalOpen(true)}
                variant="outline"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create First Admin
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Administrator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {admins.map((admin) => {
                    const isSelf = currentAdminId && admin.id === currentAdminId;
                    const isLastActive = admin.is_active && activeAdminCount <= 1;
                    const canRemove = !isSelf && !isLastActive;
                    return (
                      <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <Shield className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {admin.first_name} {admin.last_name || ""}
                                {isSelf ? (
                                  <span className="ml-2 text-xs font-normal text-gray-400">
                                    (you)
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500">
                            <Mail className="w-4 h-4 mr-2" />
                            {admin.email}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {admin.is_active ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="w-3 h-3 mr-1" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2" />
                            {new Date(admin.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setAdminToRemove(admin)}
                            disabled={!canRemove || removingId !== null}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            aria-label="Remove administrator"
                            title={
                              isSelf
                                ? "You cannot remove your own account"
                                : isLastActive
                                  ? "Cannot remove the last active administrator"
                                  : "Remove administrator"
                            }
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <CreateAdminModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />

        <WarningModal
          isOpen={adminToRemove !== null}
          title="Remove administrator"
          message={
            adminToRemove
              ? `Are you sure you want to permanently remove ${adminToRemove.first_name} ${adminToRemove.last_name || ""} (${adminToRemove.email})? They will no longer be able to sign in as admin. This cannot be undone.`
              : ""
          }
          onConfirm={handleConfirmRemove}
          onCancel={() => setAdminToRemove(null)}
        />
      </div>
    </AdminLayout>
  );
}
