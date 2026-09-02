"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  Loader2,
  LogIn,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Save,
  User as UserIcon,
  X,
} from "lucide-react";
import AdminLayout from "@/components/admin_layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import { startAdminOverallAccess } from "@/lib/admin-overall-access-client";
import { BUCKETS } from "@/lib/buckets";
import { uploadViaApi } from "@/lib/upload-client";
import { getSignedUrls } from "@/lib/storage-sign-client";

type HubUser = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  country: string | null;
  city: string | null;
  guide_number: string | null;
  guide_tier: string | null;
  account_type_label: string;
  guide_approved: boolean | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  is_operator: boolean | null;
  managed_by_operator_name: string | null;
  last_active: string | null;
  presence_display: "online" | "idle" | "offline" | null;
  alert_count: number;
  created_at: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  street: string | null;
  postal: string | null;
  website: string | null;
  contact_email: string | null;
  languages: string[];
  specialties: string[];
  destinations: string[];
  guide_profile_status: string | null;
  certification_status: string | null;
  marketplace_available: boolean | null;
  years_experience: number | null;
  profile_slug: string | null;
};

type UserHubData = {
  user: HubUser;
  itineraries: Array<{
    id: string;
    name: string;
    location: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    build_mode: string | null;
  }>;
  tours: Array<{
    id: string;
    name: string;
    location: string | null;
    status: string;
    activity_type: string | null;
    created_at: string;
  }>;
  jobs: Array<{
    id: string;
    name: string;
    location: string | null;
    start_time: string | null;
    created_at: string;
    itinerary_id: string | null;
  }>;
  applications: Array<{
    id: string;
    job_id: string;
    job_name: string;
    offer_status: string | null;
    submitted_at: string | null;
  }>;
  conversations: Array<{
    id: string;
    client_name: string | null;
    other_name: string;
    other_role: string | null;
    last_message: string;
    last_message_at: string;
  }>;
  managed_guides: Array<{
    id: string;
    name: string;
    email: string | null;
    guide_approved: boolean | null;
    is_active: boolean | null;
    created_at: string;
  }>;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function statusPill(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  let cls = "bg-gray-100 text-gray-700";
  if (s === "published" || s === "accepted" || s === "hired" || s === "completed" || s === "approved") {
    cls = "bg-emerald-100 text-emerald-800";
  } else if (s === "draft" || s === "pending" || s === "offered") {
    cls = "bg-amber-100 text-amber-800";
  } else if (s === "banned" || s === "archived" || s === "rejected") {
    cls = "bg-red-100 text-red-800";
  }
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${cls}`}>
      {status || "—"}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex gap-3 py-2 border-t border-gray-100 first:border-0 first:pt-0">
      <dt className="w-36 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 min-w-0 break-words">{value}</dd>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function Section({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-500 tabular-nums">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-8 text-sm text-gray-500 text-center">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function UserControlHubInner() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.id === "string" ? params.id : "";
  const [data, setData] = useState<UserHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessing, setAccessing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [draft, setDraft] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    website: "",
    contact_email: "",
    bio: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      toast.error(json.error || "Could not load user");
      return;
    }
    setData(json as UserHubData);
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          toast.error(json.error || "Could not load user");
          setData(null);
          return;
        }
        setData(json as UserHubData);
      } catch {
        if (!cancelled) toast.error("Could not load user");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading account…
        </div>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto py-12 text-center">
          <p className="text-gray-600 mb-4">User not found or could not be loaded.</p>
          <Button variant="outline" onClick={() => router.push("/admin/user")}>
            Back to users
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const { user } = data;
  const isAgent = user.role === "agent";
  const isGuide = user.role === "guide";
  const canAccessAccount =
    (user.role === "agent" || user.role === "guide") && user.is_active !== false;
  const canEditProfile = user.role === "agent" || user.role === "guide" || user.role === "agency";
  const initials =
    `${(user.first_name || "").charAt(0)}${(user.last_name || "").charAt(0)}`.toUpperCase() ||
    (user.email || "?").charAt(0).toUpperCase();
  const location = [user.city, user.country].filter(Boolean).join(", ");
  const presence = user.presence_display ?? "offline";
  const presenceColor =
    presence === "online"
      ? "bg-emerald-500"
      : presence === "idle"
        ? "bg-amber-500"
        : "bg-gray-400";

  const startEdit = () => {
    setDraft({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
      website: user.website || "",
      contact_email: user.contact_email || "",
      bio: user.bio || "",
    });
    setLogoPreview(user.avatar_url);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setLogoPreview(null);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: draft.first_name,
          last_name: draft.last_name,
          phone: draft.phone || null,
          website: draft.website || null,
          contact_email: draft.contact_email || null,
          bio: draft.bio || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Save failed");
      }
      toast.success("Profile updated");
      setEditing(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }
      const [uploaded] = await uploadViaApi(file, {
        bucket: BUCKETS.avatars,
        folder: "profiles/avatar",
        signed: true,
        expiresIn: 60 * 60 * 24 * 7,
      });
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_picture_path: uploaded.path }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Could not save logo");
      }
      const preview =
        uploaded.signedUrl ||
        uploaded.publicUrl ||
        (
          await getSignedUrls([{ bucket: BUCKETS.avatars, path: uploaded.path }])
        )[0]?.signedUrl ||
        null;
      setLogoPreview(preview);
      toast.success(isAgent ? "Logo updated" : "Photo updated");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAccessAccount = async () => {
    if (!canAccessAccount) {
      toast.error(
        user.is_active === false
          ? "Reactivate this account before accessing it."
          : "Overall access is only available for advisor and guide accounts."
      );
      return;
    }
    setAccessing(true);
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
      setAccessing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => router.push("/admin/user")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Users
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {canEditProfile && !editing && (
              <Button type="button" variant="outline" onClick={startEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit {isAgent ? "name & logo" : "profile"}
              </Button>
            )}
            {editing && (
              <>
                <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="bg-[#af8a10] hover:bg-[#9a7a0e] text-white gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            )}
            {canAccessAccount && (
              <Button
                type="button"
                onClick={() => void handleAccessAccount()}
                disabled={accessing}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                <LogIn className="h-4 w-4" />
                {accessing ? "Opening…" : "Access account"}
              </Button>
            )}
          </div>
        </div>

        {/* Profile header */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="relative h-28 sm:h-36 bg-gradient-to-r from-gray-200 to-gray-100 overflow-hidden">
            {user.cover_url ? (
              <Image
                src={user.cover_url}
                alt=""
                fill
                className="object-cover"
                style={{
                  WebkitMaskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.2) 100%)",
                  maskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.2) 100%)",
                }}
                unoptimized
              />
            ) : null}
            <div
              className="absolute inset-x-0 bottom-0 h-20 sm:h-24 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none"
              aria-hidden
            />
          </div>
          <div className="relative z-10 bg-white px-4 sm:px-6 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8 sm:-mt-10">
              <div className="relative shrink-0">
                <label
                  className={
                    editing
                      ? "relative h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-sm flex items-center justify-center cursor-pointer ring-2 ring-amber-600"
                      : "relative h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-sm flex items-center justify-center"
                  }
                >
                  {(editing ? logoPreview : user.avatar_url) ? (
                    <Image
                      src={(editing ? logoPreview : user.avatar_url) as string}
                      alt={user.name}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xl sm:text-2xl font-semibold text-gray-500">
                      {initials}
                    </span>
                  )}
                  {editing && (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingLogo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadLogo(file);
                          e.target.value = "";
                        }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] sm:text-xs text-center px-1">
                        {uploadingLogo ? "…" : isAgent ? "Change logo" : "Change photo"}
                      </span>
                    </>
                  )}
                </label>
                <span
                  className={`absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${presenceColor}`}
                  title={presence}
                />
              </div>
              <div className="min-w-0 flex-1 pb-1 pt-1 sm:pt-0">
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <div>
                      <label className="text-xs text-gray-500">First name</label>
                      <Input
                        value={draft.first_name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, first_name: e.target.value }))
                        }
                        className="h-9 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Last name</label>
                      <Input
                        value={draft.last_name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, last_name: e.target.value }))
                        }
                        className="h-9 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Phone</label>
                      <Input
                        value={draft.phone}
                        onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                        className="h-9 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Website</label>
                      <Input
                        value={draft.website}
                        onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                        className="h-9 mt-1"
                        placeholder="https://"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">Contact email (PDF)</label>
                      <Input
                        value={draft.contact_email}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, contact_email: e.target.value }))
                        }
                        className="h-9 mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{user.name}</h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600 relative z-10">
                      {user.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {user.email}
                        </span>
                      )}
                      {user.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {user.phone}
                        </span>
                      )}
                      {location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {location}
                        </span>
                      )}
                    </div>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                    {user.account_type_label}
                  </span>
                  {user.is_verified && (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      Verified
                    </span>
                  )}
                  {user.guide_approved ? (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                      Approved
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                      Pending approval
                    </span>
                  )}
                  {user.is_active === false && (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      Suspended
                    </span>
                  )}
                  {isGuide && user.guide_number && (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-800">
                      Guide #{user.guide_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Account + profile details */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gray-500" />
              Account details
            </h2>
            <dl>
              <DetailRow label="Role" value={user.role} />
              <DetailRow label="Phone" value={user.phone} />
              <DetailRow label="Email" value={user.email} />
              <DetailRow label="Contact email" value={user.contact_email} />
              <DetailRow label="Location" value={location || null} />
              <DetailRow
                label="Address"
                value={
                  [user.street, user.postal].filter(Boolean).join(", ") || null
                }
              />
              {isGuide && (
                <>
                  <DetailRow label="Guide number" value={user.guide_number} />
                  <DetailRow label="Guide tier" value={user.guide_tier} />
                  <DetailRow
                    label="Managed by"
                    value={user.managed_by_operator_name}
                  />
                </>
              )}
              <DetailRow label="Presence" value={presence} />
              <DetailRow label="Last active" value={formatDateTime(user.last_active)} />
              <DetailRow label="Joined" value={formatDate(user.created_at)} />
              <DetailRow
                label="Alerts"
                value={user.alert_count > 0 ? String(user.alert_count) : null}
              />
            </dl>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Profile</h2>
            {editing ? (
              <div className="mb-4">
                <label className="text-xs text-gray-500">Bio</label>
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                  className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Short bio for the profile / PDF context"
                />
              </div>
            ) : user.bio ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{user.bio}</p>
            ) : (
              <p className="text-sm text-gray-400 mb-4">No bio provided.</p>
            )}
            <dl>
              <DetailRow
                label="Languages"
                value={user.languages.length ? <TagList items={user.languages} /> : null}
              />
              <DetailRow
                label="Specialties"
                value={user.specialties.length ? <TagList items={user.specialties} /> : null}
              />
              <DetailRow
                label="Destinations"
                value={user.destinations.length ? <TagList items={user.destinations} /> : null}
              />
              <DetailRow
                label="Experience"
                value={
                  user.years_experience != null
                    ? `${user.years_experience} year(s)`
                    : null
                }
              />
              {isGuide && (
                <>
                  <DetailRow label="Profile status" value={user.guide_profile_status} />
                  <DetailRow label="Certification" value={user.certification_status} />
                  <DetailRow
                    label="Marketplace"
                    value={
                      user.marketplace_available == null
                        ? null
                        : user.marketplace_available
                          ? "Available"
                          : "Hidden"
                    }
                  />
                </>
              )}
              <DetailRow
                label="Website"
                value={
                  user.website ? (
                    <a
                      href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#af8a10] hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {user.website}
                    </a>
                  ) : null
                }
              />
              {isGuide ? (
              <DetailRow
                label="Public profile"
                value={
                  user.profile_slug ? (
                    <Link
                      href={`/g/${user.profile_slug}`}
                      className="text-[#af8a10] hover:underline"
                      target="_blank"
                    >
                      /g/{user.profile_slug}
                    </Link>
                  ) : null
                }
              />
              ) : null}
            </dl>
          </section>
        </div>

        {isAgent && (
          <>
            <Section
              title="Itineraries"
              count={data.itineraries.length}
              empty="No itineraries yet."
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Location</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Dates</th>
                      <th className="px-4 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.itineraries.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-gray-600">{row.location || "—"}</td>
                        <td className="px-4 py-3">{statusPill(row.status)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(row.start_date)} – {formatDate(row.end_date)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/itineraries/${row.id}/edit`}
                            className="inline-flex items-center gap-1 text-[#af8a10] hover:underline"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Jobs" count={data.jobs.length} empty="No jobs yet.">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Job</th>
                      <th className="px-4 py-2 font-medium">Location</th>
                      <th className="px-4 py-2 font-medium">Start</th>
                      <th className="px-4 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.jobs.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-gray-600">{row.location || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(row.start_time)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}

        {isGuide && (
          <>
            <Section title="Tours" count={data.tours.length} empty="No tours yet.">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Tour</th>
                      <th className="px-4 py-2 font-medium">Location</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.tours.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-gray-600">{row.location || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{row.activity_type || "—"}</td>
                        <td className="px-4 py-3">{statusPill(row.status)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              title="Job applications"
              count={data.applications.length}
              empty="No applications yet."
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Job</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.applications.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.job_name}</td>
                        <td className="px-4 py-3">{statusPill(row.offer_status)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(row.submitted_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {user.is_operator && (
              <Section
                title="Managed guides"
                count={data.managed_guides.length}
                empty="No managed guides."
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Email</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.managed_guides.map((g) => (
                        <tr key={g.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{g.name}</td>
                          <td className="px-4 py-3 text-gray-600">{g.email || "—"}</td>
                          <td className="px-4 py-3">
                            {g.guide_approved ? statusPill("approved") : statusPill("pending")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/users/${g.id}`}
                              className="text-[#af8a10] hover:underline text-xs"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        )}

        <Section
          title="Conversations"
          count={data.conversations.length}
          empty="No conversations yet."
        >
          <ul className="divide-y divide-gray-100">
            {data.conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/conversations?userId=${user.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <MessageSquare className="h-4 w-4 mt-1 text-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{c.other_name}</span>
                      {c.client_name && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          {c.client_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-1 mt-0.5">
                      {c.last_message || "No messages yet"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(c.last_message_at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </AdminLayout>
  );
}

export default function AdminUserControlHubPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
            Loading…
          </div>
        </AdminLayout>
      }
    >
      <UserControlHubInner />
    </Suspense>
  );
}
