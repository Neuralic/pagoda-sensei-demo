"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit2, X } from "lucide-react"
import { Input } from "@/components/ui/input"

export default function TourSpecialties() {
  const initial = useMemo<string[]>(
    () => [],
    []
  )

  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [list, setList] = useState<string[]>(initial)
  const [draft, setDraft] = useState<string[]>(initial)
  const [newItem, setNewItem] = useState("")

  // Load existing specialties from profile
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" })
        const data = await res.json()
        const arr = Array.isArray(data?.profile?.specialties) ? (data.profile.specialties as string[]) : null
        if (!cancelled && arr) {
          setList(arr)
          setDraft(arr)
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
    setDraft(list)
    setNewItem("")
    setEditing(true)
  }

  function onCancel() {
    setDraft(list)
    setNewItem("")
    setEditing(false)
  }

  async function onSave() {
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialties: draft }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save specialties")
      setList(draft)
      setEditing(false)
    } catch (e) {
      console.error("Save specialties failed", e)
    }
  }

  function addItem() {
    const val = newItem.trim()
    if (!val) return
    const exists = draft.some((s) => s.toLowerCase() === val.toLowerCase())
    if (exists) {
      setNewItem("")
      return
    }
    setDraft((d) => [...d, val])
    setNewItem("")
  }

  function removeItem(value: string) {
    setDraft((d) => d.filter((s) => s !== value))
  }

  return (
    <Card className="p-6 border border-border">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-foreground">Tour Specialities</h2>
        {!editing ? (
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={onEdit}>
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSave}>Save</Button>
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-wrap gap-3">
          {(loading ? initial : list).map((specialty) => (
            <span key={specialty} className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
              {specialty}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {draft.map((specialty) => (
              <span
                key={specialty}
                className="inline-flex items-center gap-2 rounded-full bg-yellow-100 text-yellow-800 px-3 py-1.5 text-sm"
              >
                {specialty}
                <button
                  type="button"
                  aria-label={`Remove ${specialty}`}
                  onClick={() => removeItem(specialty)}
                  className="rounded-full p-0.5 hover:bg-yellow-200/70"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 max-w-xl">
            <Input
              placeholder="Add a specialty (e.g., Photography Tours)"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addItem()
                }
              }}
            />
            <Button type="button" onClick={addItem}>Add</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
