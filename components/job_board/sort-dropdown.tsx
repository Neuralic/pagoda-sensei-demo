"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface SortDropdownProps {
  value: string
  onChange: (value: string) => void
}

const sortOptions = [
  { value: "date-created", label: "Date Created (Newest)" },
  { value: "date-start", label: "Arrival Date (Earliest)" },
  { value: "most-sold", label: "Most sold" },
  { value: "name", label: "Name (A-Z)" },
  { value: "location", label: "Location (A-Z)" },
]

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const currentOption = sortOptions.find((option) => option.value === value) || sortOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent">
          Sort: {currentOption.label}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {sortOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={value === option.value ? "bg-muted" : ""}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
