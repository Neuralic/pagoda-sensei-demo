"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BUCKETS } from "@/lib/buckets"
import { notifyProfileUpdated } from "@/lib/profile-refresh"
import { getSignedUrls } from "@/lib/storage-sign-client"
import { uploadViaApi } from "@/lib/upload-client"
import { Edit2 } from "lucide-react"
import { useEffect, useState } from "react"

type UserInfo = {
  firstName: string
  lastName: string
  guideNumber: number | null
  role: string | null
}

export default function ProfileInfo() {
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(false)
  const [user, setUser] = useState<UserInfo>({ firstName: "", lastName: "", guideNumber: null, role: "" })
  const [draft, setDraft] = useState<UserInfo>({ firstName: "", lastName: "", guideNumber: null, role: "" })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" })
        const data = await res.json()
        if (!cancelled && data?.ok) {
          const u: UserInfo = {
            firstName: data.user?.name || "",
            lastName: data.user?.lastName || "",
            guideNumber: data.user?.guideNumber || null,
            role: data.user?.role || "",
          }
          setUser(u)
          setDraft(u)
        }
        // Try to load an existing profile picture URL (best effort)
        try {
          const p = await fetch("/api/profile", { cache: "no-store" })
          const pj = await p.json()
          const path: string | undefined = pj?.profile?.profile_picture_path
          if (!cancelled && typeof path === "string" && path) {
            const [u] = await getSignedUrls([{ bucket: BUCKETS.avatars, path }])
            setAvatarUrl(u?.signedUrl || u?.publicUrl || null)
          }
        } catch {
          // ignore
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function onEdit() {
    setDraft(user)
    setEdit(true)
  }

  function onCancel() {
    setDraft(user)
    setEdit(false)
  }

  async function onSave() {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: draft.firstName, lastName: draft.lastName }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to update profile")
      setUser(draft)
      setEdit(false)
    } catch {
      // You can surface a toast here if desired
    }
  }

  const fullName = `${user.firstName}${user.lastName ? " " + user.lastName : ""}`

  return (
    <Card className="p-4 lg:p-6 border border-border">
      <div className="flex justify-between items-start lg:items-center mb-4 lg:mb-6 gap-4">
        <h2 className="text-lg lg:text-xl font-bold text-foreground"> {user.role === "agent" ? "Name and Logo" : "Guide Profile Info"}</h2>
        {!edit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="gap-2 text-[#D4AA25] bg-transparent text-xs lg:text-sm"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={onSave} className="text-xs lg:text-sm">
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="text-xs lg:text-sm">
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-start gap-3 lg:gap-4">
        <label className={`relative flex items-center justify-center flex-shrink-0 cursor-pointer group ${user.role === "agent" ? "" : "w-12 lg:w-16 h-12 lg:h-16 rounded-full bg-muted overflow-hidden"}`} style={user.role === "agent" ? { maxWidth: '120px' } : {}}>
          {avatarUrl ? (
            user.role === "agent" ? (
              // Agent logo style - width-based with auto height
              <div style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl}
                  alt="Agent logo"
                  className="object-contain rounded-lg"
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
            ) : (
              // Guide avatar style - circular
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            )
          ) : (
            user.role === "agent" ? (
              <div style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60px' }}>
                <span className="text-xl lg:text-2xl">👤</span>
              </div>
            ) : (
              <span className="text-xl lg:text-2xl">👤</span>
            )
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploading(true)
              try {
                if (!file.type.startsWith("image/")) throw new Error("Please select an image file")
                const [res] = await uploadViaApi(file, {
                  bucket: BUCKETS.avatars,
                  folder: "profiles/avatar",
                  signed: true, // return a signed URL to ensure preview works even if bucket isn't public
                  expiresIn: 60 * 60 * 24 * 7, // 7 days
                })
                await fetch("/api/profile", {
                  method: "PUT",
                  body: JSON.stringify({ profile_picture_path: res.path }),
                })
                setAvatarUrl(res.signedUrl || res.publicUrl || null)
                notifyProfileUpdated()
              } catch {
                // optional: show toast
              } finally {
                setUploading(false)
              }
            }}
          />
          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-white text-[10px] lg:text-xs rounded-lg">
            {uploading ? "Uploading…" : user.role === "agent" ? "Change Logo" : "Change Photo"}
          </span>
        </label>
        <div className="min-w-0">
          {!edit ? (
            <>
              <h3 className="font-semibold text-sm lg:text-base text-foreground">
                {loading ? "Loading..." : fullName || "Unnamed User"}
              </h3>{user.role === "guide" && (<div className="text-center">
                <p className="text-sm text-foreground">Guide number: {user.guideNumber}</p>
              </div>)}

            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <div className="space-y-1">
                <label className="text-xs lg:text-sm text-foreground">First name</label>
                <Input
                  value={draft.firstName}
                  onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                  className="h-9"
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs lg:text-sm text-foreground">Last name</label>
                <Input
                  value={draft.lastName}
                  onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                  className="h-9"
                  placeholder="Last name"
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </Card>
  )
}
