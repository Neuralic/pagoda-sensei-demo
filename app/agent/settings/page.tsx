"use client"

import AccountDetailsTab from "@/components/settings/account-details-tab"
import ProfileInfo from "@/components/settings/profile-info"
import SettingsSidebar from "@/components/settings/settings-sidebar"
import { BackButton } from "@/components/shared/back-button"
import { CountrySelect } from "@/components/shared/country-select"
import { CountryLabel } from "@/components/shared/country-label"
import { LanguageLabel } from "@/components/shared/language-label"
import { TagMultiSelect } from "@/components/shared/tag-multi-select"
import { COMMON_GUIDE_LANGUAGES } from "@/lib/guide-languages"
import { getLanguageFlagCode } from "@/lib/countries-map"
import { Button } from "@/components/ui/button"
import { Card } from '@/components/ui/card'
import { Input } from "@/components/ui/input"
import { Edit2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

const HEADER_TOP = "top-[calc(3.5rem+1px)] sm:top-[calc(4rem+1px)]"
const PANEL_HEIGHT = "h-[calc(100dvh-3.5rem-1px)] sm:h-[calc(100dvh-4rem-1px)]"

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
export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("profile")
    const mainRef = useRef<HTMLElement>(null)
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

    useEffect(() => {
        mainRef.current?.scrollTo(0, 0)
    }, [activeTab])

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
        } catch (e) {
            // Optional: surface a toast; for now we keep edit mode
            console.error("Save failed", e)
        }
    }


    const tabs = [
        { id: "profile", label: "Profile" },
        { id: "account", label: "Account Details" },
        // { id: "billing", label: "Billing" },
        // { id: "notifications", label: "Notifications" },
    ]

    return (
        <div className="relative bg-background">
            {/* Desktop: fixed left rail below global header — does not scroll with content */}
            <aside
                className={`hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:w-52 lg:z-30 lg:bg-card lg:border-r lg:border-border ${HEADER_TOP} ${PANEL_HEIGHT}`}
            >
                <div className="shrink-0 p-3 flex items-center justify-center border-b border-border">
                    <BackButton label="Back" />
                </div>
                <SettingsSidebar activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />
            </aside>

            <main
                ref={mainRef}
                className={`lg:pl-52 ${PANEL_HEIGHT} overflow-y-auto overscroll-y-contain`}
            >
                <div className="max-w-4xl mx-auto px-4 py-6 lg:p-8">
                    <div className="mb-6 lg:mb-8">
                        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{activeTab === "profile" ? "Profile" : activeTab === "account" ? "Account Details" : "Billing"}</h1>
                        <p className="text-sm lg:text-base text-muted-foreground mt-1 lg:mt-2">
                            {activeTab === "profile" ? "Manage your account and your public agent profile in one place." : activeTab === "account" ? "Manage your account details." : "Manage your billing information."}
                        </p>
                    </div>

                    <div className="lg:hidden mb-6 flex gap-2 overflow-x-auto pb-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                                    ? "bg-[#D4AA25] text-[#D4AA25]-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === "profile" && <div className="space-y-4 lg:space-y-6">
                        {/* <ProfileSetupProgress /> */}
                        <ProfileInfo />
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

                                    </div>
                                </>
                            ) : (
                                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>

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
                        {/* <DeleteAccount /> */}
                    </div>}
                    {activeTab === "account" && <AccountDetailsTab />}
                    {/* {activeTab === "billing" && <BillingTab />}
                    {activeTab === "notifications" && <NotificationsTab />} */}
                </div>
            </main>
        </div>
    )
}
