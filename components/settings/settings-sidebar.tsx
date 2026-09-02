"use client"

interface Tab {
  id: string
  label: string
}

interface SettingsSidebarProps {
  activeTab: string
  tabs: Tab[]
  onTabChange: (tabId: string) => void
}

export default function SettingsSidebar({ activeTab, tabs, onTabChange }: SettingsSidebarProps) {
  return (
    <nav className="flex-1 p-4 space-y-1 overflow-hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`w-full text-left px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
            activeTab === tab.id
              ? "bg-[#F1F2F5] font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
