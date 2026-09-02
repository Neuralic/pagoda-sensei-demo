"use client"

import { useEffect, useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Upload } from "lucide-react"
import { uploadViaApi } from "@/lib/upload-client"
import { BUCKETS } from "@/lib/buckets"
import { getSignedUrls } from "@/lib/storage-sign-client"

type DocItem = { path: string; name: string; url: string | null }

export default function AccountDetailsTab() {
  type Account = { email: string }
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [account, setAccount] = useState<Account>({ email: "" })
  const [draft, setDraft] = useState<Account>({ email: "" })
  const [name, setName] = useState<string>("")
  const [lastName, setLastName] = useState<string>("")
  const [pwd, setPwd] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [docUploading, setDocUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/user', { cache: 'no-store' })
        const data = await res.json()
        const src = data?.account || data?.user
        if (!cancelled && data?.ok && src) {
          const a: Account = {
            email: src.email || '',
          }
          setAccount(a)
          setDraft(a)
          if (src.defaultMarkupPct != null) {
            setDefaultMarkupPct(String(src.defaultMarkupPct))
          }
        }
        // Also load display name from auth session (signed-in user)
        try {
          const me = await fetch('/api/auth/me', { cache: 'no-store' })
          const mj = await me.json()
          if (!cancelled && mj?.ok) {
            setName(mj.user?.name || "")
            setLastName(mj.user?.lastName || "")
          }
        } catch {}
        // Load documents from profile
        try {
          const pr = await fetch('/api/profile', { cache: 'no-store' })
          const pj = await pr.json()
          const paths: string[] = pj?.profile?.documents || pj?.profile?.document || []
          if (!cancelled && Array.isArray(paths) && paths.length) {
            const signed = await getSignedUrls(paths.map((p: string) => ({ bucket: BUCKETS.documents, path: p })))
            setDocuments(
              signed.map((s) => ({
                path: s.path,
                name: s.path.split('/').pop() || s.path,
                url: s.signedUrl || s.publicUrl,
              }))
            )
          }
        } catch {}
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function onEdit() {
    setDraft({ email: account.email })
    setPwd("")
    setPwd2("")
    setEditing(true)
    setError(null)
  }

  function onCancel() {
    setDraft(account)
    setPwd("")
    setPwd2("")
    setEditing(false)
    setError(null)
  }

  async function onSave() {
    try {
      setSaving(true)
      setError(null)
      if (pwd || pwd2) {
        if (pwd.length < 8) throw new Error('Password must be at least 8 characters')
        if (pwd !== pwd2) throw new Error('Passwords do not match')
      }
      // Email is shown but not editable; do not send it for updates
      const payload: Record<string, string> = {}
      if (pwd) payload.password = pwd
      // include name fields if changed
      if (name) payload.name = name
      if (lastName) payload.lastName = lastName
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to update account')
      setAccount(draft)
      setEditing(false)
      setPwd("")
      setPwd2("")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update account'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const [documents, setDocuments] = useState<DocItem[]>([])
  const [defaultMarkupPct, setDefaultMarkupPct] = useState<string>("")
  const [markupSaving, setMarkupSaving] = useState(false)
  const [markupError, setMarkupError] = useState<string | null>(null)
  const [markupSaved, setMarkupSaved] = useState(false)

  function handlePickDocuments() {
    docFileInputRef.current?.click()
  }

  const docFileInputRef = useRef<HTMLInputElement | null>(null)

  async function onDocsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setDocError(null)
    setDocUploading(true)
    try {
      if (files.length > 10) throw new Error('Please select up to 10 files')
      const results = await uploadViaApi(files, {
        bucket: BUCKETS.documents,
        folder: 'profiles/documents',
        signed: true,
        expiresIn: 60 * 60 * 24 * 7,
      })
      const newDocs = results.map((r) => ({ path: r.path, name: r.name, url: r.signedUrl || r.publicUrl }))
      const updated = [...documents.map((d) => d.path), ...newDocs.map((d) => d.path)]
  await fetch('/api/profile', { method: 'PUT', body: JSON.stringify({ document: updated }) })
      setDocuments([...documents, ...newDocs])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setDocError(msg)
    } finally {
      setDocUploading(false)
      if (docFileInputRef.current) docFileInputRef.current.value = ''
    }
  }

  async function handleDeleteDocument(path: string) {
    try {
      const remaining = documents.filter((d) => d.path !== path)
  await fetch('/api/profile', { method: 'PUT', body: JSON.stringify({ document: remaining.map((d) => d.path) }) })
      setDocuments(remaining)
    } catch {}
  }

  return (
    <div className="space-y-6">
      {/* Proposal markup default */}
      <Card className="p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Default proposal markup
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Applied to each new itinerary as your proposal markup on top of
          Pagoda&apos;s price to you (guide/net + 20%). Default is usually 15%.
          You can still change it per itinerary.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Default proposal markup %
          </label>
            <input
              type="number"
              min={0}
              max={500}
              step={1}
              className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={defaultMarkupPct}
              onChange={(e) => {
                setDefaultMarkupPct(e.target.value)
                setMarkupSaved(false)
              }}
              placeholder="15"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={markupSaving}
            className="bg-[#D4AA25] hover:bg-[#C49A1F] text-white"
            onClick={async () => {
              setMarkupSaving(true)
              setMarkupError(null)
              setMarkupSaved(false)
              try {
                const res = await fetch("/api/user", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    defaultMarkupPct:
                      defaultMarkupPct.trim() === ""
                        ? null
                        : Number(defaultMarkupPct),
                  }),
                })
                const data = await res.json().catch(() => null)
                if (!res.ok || !data?.ok) {
                  throw new Error(data?.error || "Failed to save")
                }
                setMarkupSaved(true)
              } catch (e) {
                setMarkupError(
                  e instanceof Error ? e.message : "Failed to save markup"
                )
              } finally {
                setMarkupSaving(false)
              }
            }}
          >
            {markupSaving ? "Saving…" : "Save default"}
          </Button>
          {markupSaved ? (
            <span className="text-sm text-emerald-700">Saved</span>
          ) : null}
          {markupError ? (
            <span className="text-sm text-red-600">{markupError}</span>
          ) : null}
        </div>
      </Card>

      {/* Account Information Card */}
      <Card className="p-6 border border-gray-200">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
          {!editing ? (
            <Button
              onClick={onEdit}
              variant="outline"
              size="sm"
              className="text-[#D4AA25] border-[#D4AA25] bg-transparent"
            >
              ✏️ Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={onSave} size="sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button onClick={onCancel} size="sm" variant="outline">
                Cancel
              </Button>
            </div>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <p className="text-gray-900">{loading ? 'Loading…' : [name, lastName].filter(Boolean).join(' ') || '—'}</p>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <p className="text-gray-900 break-all">{loading ? 'Loading…' : account.email || '—'}</p>
            </div>

            {/* Password */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <p className="text-gray-900">••••••••••••••••</p>
            </div>
          </div>
        ) : (
          <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={(e) => e.preventDefault()}>
            {/* First name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name"
              />
            </div>
            {/* Last name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
            {/* Email Address (read-only) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                value={draft.email}
                disabled
                readOnly
              />
              <p className="text-xs text-gray-500 mt-1">Email can’t be changed here.</p>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="Leave empty to keep current password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
              />
            </div>

            {error && (
              <div className="md:col-span-2 text-sm text-red-600">{error}</div>
            )}
          </form>
        )}
      </Card>

      {/* Insurance Documentation Card */}
      <Card className="p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Insurance Documentation</h2>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
          <div className="flex justify-center mb-3">
            <Upload className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">Upload Documentation</h3>
          <p className="text-sm text-gray-600 mb-4">
            Upload your insurance documents here (PDF, JPG, PNG, max 1MB each). These files will remain private and
            secure
          </p>
          {docError && <p className="text-sm text-red-600 mb-2">{docError}</p>}
          <Button onClick={handlePickDocuments} disabled={docUploading} className="bg-[#D4AA25] hover:bg-[#D4AA25] text-white">
            {docUploading ? 'Uploading…' : 'Choose Files'}
          </Button>
          <input
            ref={docFileInputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            className="hidden"
            onChange={onDocsChange}
          />
        </div>

        {/* Current Documents */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Current Documents</h3>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.path}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 16.5a1 1 0 11-2 0 1 1 0 012 0zM15 7H4m0 0V4m0 3v10a1 1 0 001 1h12a1 1 0 001-1V7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-600 break-all">{doc.path}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a href={doc.url ?? '#'} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-200 rounded transition-colors">
                    <Download className="w-4 h-4 text-gray-600" />
                  </a>
                  <button onClick={() => handleDeleteDocument(doc.path)} className="p-2 hover:bg-gray-200 rounded transition-colors">
                    <Trash2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
