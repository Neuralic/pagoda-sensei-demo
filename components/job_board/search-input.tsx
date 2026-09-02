"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search jobs by title, location, or activity type...",
  onKeyDown,
}: SearchInputProps) {
  return (
    <div className="relative flex-1 max-w-md">
      <span className="absolute left-3 inset-y-0 flex items-center">
        <Search className="h-4 w-4 text-muted-foreground" />
      </span>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="pl-10"
      />
    </div>
  )
}