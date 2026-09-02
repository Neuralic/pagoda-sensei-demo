"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CountrySelect } from "@/components/shared/country-select"
import { CountryLabel } from "@/components/shared/country-label"
import { LanguageLabel } from "@/components/shared/language-label"
import { TagMultiSelect } from "@/components/shared/tag-multi-select"
import { COMMON_GUIDE_LANGUAGES } from "@/lib/guide-languages"
import { getLanguageFlagCode } from "@/lib/countries-map"

type FormState = {
    bio: string
    street: string
    country: string
    city: string
    postal: string
    website: string
    email: string
    languages: string[]
}

export default function AboutMe() {
    const initial = useMemo<FormState>(
        () => ({
            bio:
                "",
            street: "",
            country: "",
            city: "",
            postal: "",
            website: "",
            email: "",
            languages: [],
        }),
        []
    )

    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<FormState>(initial)
    const [draft, setDraft] = useState<FormState>(initial)

    // Load existing profile values from API on mount
    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const res = await fetch("/api/profile", { cache: "no-store" })
                const data = await res.json()
                const p = data?.profile
                if (!cancelled && p) {
                    const next: FormState = {
                        bio: p.bio ?? "",
                        street: p.street ?? "",
                        country: p.country ?? "",
                        city: p.city ?? "",
                        postal: p.postal ?? "",
                        website: p.website ?? "",
                        email: p.contact_email ?? "",
                        languages: Array.isArray(p.languages) ? (p.languages as string[]) : [],
                    }
                    setForm(next)
                    setDraft(next)
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
        setDraft(form)
        setEditing(true)
    }

    function onCancel() {
        setDraft(form)
        setEditing(false)
    }

    async function onSave() {
        const payload = {
            bio: draft.bio,
            street: draft.street,
            country: draft.country,
            city: draft.city,
            postal: draft.postal,
            website: draft.website,
            contact_email: draft.email,
            languages: draft.languages,
        }
        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save profile")
            setForm(draft)
            setEditing(false)
            const { notifyProfileUpdated } = await import("@/lib/profile-refresh")
            notifyProfileUpdated()
        } catch (e) {
            // Optional: surface a toast; for now we keep edit mode
            console.error("Save failed", e)
        }
    }

    return (
        <Card className="p-6 border border-border">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-foreground">About Me</h2>
                {!editing ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onEdit}
                        className="gap-2 text-[#D4AA25] bg-transparent"
                    >
                        <Edit2 className="w-4 h-4" />
                        Edit
                    </Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={onSave}>
                            Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() =>
                                setDraft({
                                    bio:
                                        "I’m a passionate local guide with 7+ years of experience leading cultural and food tours. I love connecting travelers with authentic experiences and hidden gems.",
                                    street: "123 Market Street",
                                    country: "Pakistan",
                                    city: "Lahore",
                                    postal: "54000",
                                    website: "https://example.com",
                                    email: "guide@example.com",
                                    languages: ["English", "Urdu"],
                                })
                            }
                        >
                            Fill sample data
                        </Button>
                    </div>
                )}
            </div>

            {!editing ? (
                <>
                    <p className="text-muted-foreground mb-6">Write your personal bio here (150-200 words).</p>

                    <p className="text-foreground leading-relaxed mb-6">{loading ? "Loading…" : form.bio}</p>

                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-foreground mb-2">Location</h3>
                            <p className="text-sm text-muted-foreground mb-4">Street Address</p>
                                <p className="text-foreground">{loading ? "" : form.street}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mt-4">
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Country</p>
                                {loading ? (
                                    <p className="text-foreground" />
                                ) : (
                                    <CountryLabel name={form.country} />
                                )}
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">City</p>
                                <p className="text-foreground">{loading ? "" : form.city}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Postal Code</p>
                                <p className="text-foreground">{loading ? "" : form.postal}</p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <h3 className="font-semibold text-foreground mb-2">Contact</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Website</p>
                                    {loading ? (
                                        <p className="text-muted-foreground">—</p>
                                    ) : form.website ? (
                                        <a
                                            href={form.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-foreground underline underline-offset-2"
                                        >
                                            {form.website}
                                        </a>
                                    ) : (
                                        <p className="text-muted-foreground">—</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">Email</p>
                                    {loading ? (
                                        <p className="text-muted-foreground">—</p>
                                    ) : form.email ? (
                                        <a href={`mailto:${form.email}`} className="text-foreground underline underline-offset-2">
                                            {form.email}
                                        </a>
                                    ) : (
                                        <p className="text-muted-foreground">—</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4">
                            <h3 className="font-semibold text-foreground mb-2">Languages</h3>
                            {!loading && form.languages.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {form.languages.map((lang) => (
                                        <span
                                            key={lang}
                                            className="inline-flex items-center rounded-full bg-[#F1F2F5] px-2.5 py-1 text-xs font-medium text-foreground"
                                        >
                                            <LanguageLabel language={lang} showCode={false} />
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">No languages selected</p>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Bio</label>
                        <textarea
                            value={draft.bio}
                            onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                            rows={5}
                            placeholder="Write your personal bio here (150-200 words)."
                            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="space-y-3">
                        <h3 className="font-semibold text-foreground">Location</h3>
                        <div>
                            <label className="block text-sm text-muted-foreground mb-1">Street Address</label>
                            <Input value={draft.street} onChange={(e) => setDraft((d) => ({ ...d, street: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <CountrySelect
                                label="Country"
                                value={draft.country}
                                onChange={(country) => setDraft((d) => ({ ...d, country }))}
                            />
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">City</label>
                                <Input value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Postal Code</label>
                                <Input value={draft.postal} onChange={(e) => setDraft((d) => ({ ...d, postal: e.target.value }))} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="font-semibold text-foreground">Contact</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Website</label>
                                <Input
                                    type="url"
                                    placeholder="https://your-website.com"
                                    value={draft.website}
                                    onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Email</label>
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={draft.email}
                                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    <TagMultiSelect
                        label="Languages"
                        suggestions={COMMON_GUIDE_LANGUAGES}
                        selected={draft.languages}
                        onChange={(languages) => setDraft((d) => ({ ...d, languages }))}
                        addPlaceholder="Add another language and press Enter"
                        getFlagCode={getLanguageFlagCode}
                    />
                </form>
            )}
        </Card>
    )
}
