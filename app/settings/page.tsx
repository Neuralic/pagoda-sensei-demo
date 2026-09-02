"use client"

import AccountDetailsTab from "@/components/settings/account-details-tab"
import BillingTab from "@/components/settings/billing-tab"
import NotificationsTab from "@/components/settings/notifications-tab"
import ProfileTab from "@/components/settings/profile-tab"
import SettingsSidebar from "@/components/settings/settings-sidebar"
import { BackButton } from "@/components/shared/back-button"
import { useBootstrap } from "@/components/shared/bootstrap-context"
import { useEffect, useRef, useState } from "react"

/**
 * Header block = inner h-14/sm:h-16 + 1px border-b (components/shared/header.tsx).
 * Without the +1px, a thin gap shows above the sidebar / below the header.
 */
const HEADER_TOP = "top-[calc(3.5rem+1px)] sm:top-[calc(4rem+1px)]"
const PANEL_HEIGHT = "h-[calc(100dvh-3.5rem-1px)] sm:h-[calc(100dvh-4rem-1px)]"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile")
  const mainRef = useRef<HTMLElement>(null)
  const { user } = useBootstrap()

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [activeTab])

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "account", label: "Account Details" },
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
              {activeTab === "profile" ? "Manage your account and your public guide profile in one place." : activeTab === "account" ? "Manage your account details." : "Manage your billing information."}
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

          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "account" && <AccountDetailsTab />}
          {activeTab === "billing" && <BillingTab />}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>
      </main>
    </div>
  )
}
