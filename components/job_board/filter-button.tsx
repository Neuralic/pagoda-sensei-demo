"use client"

import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"

interface FilterButtonProps {
  filters: {
    location: string
    dateRange: { start: string; end: string }
    status: string
    activityType?: string
    priceRange?: string
  }
  onFiltersChange: (newFilters: FilterButtonProps["filters"]) => void
  onClearFilters: () => void
}

const activityTypes = [
  "Tour",
  "Adventure",
  "Cultural",
  "Food",
  "Nature",
  "Sports",
  "Wellness",
  "Shopping",
  "Entertainment",
  "Transfers",
  "Other"
]

const priceRanges = [
  "Any price",
  "Under $50",
  "$50 - $100",
  "$100 - $200",
  "$200 - $500",
  "Over $500"
]

export function FilterButton({ filters, onFiltersChange, onClearFilters }: FilterButtonProps) {
  const [open, setOpen] = useState(false)

  const handleFilterChange = (key: string, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    })
  }

  const handleDateRangeChange = (key: "start" | "end", value: string) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [key]: value,
      },
    })
  }

  const hasActiveFilters = filters?.location || 
                          filters?.dateRange.start || 
                          filters?.dateRange.end || 
                          filters?.activityType || 
                          filters?.priceRange

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent relative">
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#D4AA25] rounded-full" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filters</h4>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-auto p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Location Filter */}
          <div className="space-y-2">
            <Label htmlFor="location-filter">Location</Label>
            <Input
              id="location-filter"
              placeholder="Filter by location..."
              value={filters?.location || ''}
              onChange={(e) => handleFilterChange("location", e.target.value)}
            />
          </div>

          {/* Activity Type Filter */}
          <div className="space-y-2">
            <Label htmlFor="activity-type">Activity Type</Label>
            <Select value={filters?.activityType || ''} onValueChange={(value) => handleFilterChange("activityType", value)}>
              <SelectTrigger>
                <SelectValue placeholder="All activity types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All activity types</SelectItem>
                {activityTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Range Filter */}
          {/* <div className="space-y-2">
            <Label htmlFor="price-range">Price Range</Label>
            <Select value={filters?.priceRange || ''} onValueChange={(value) => handleFilterChange("priceRange", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Any price" />
              </SelectTrigger>
              <SelectContent>
                {priceRanges.map((range) => (
                  <SelectItem key={range} value={range}>{range}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div> */}

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="arrival-date" className="text-xs">
                  Arrival Date
                </Label>
                <Input
                  id="arrival-date"
                  type="date"
                  value={filters?.dateRange?.start || ''}
                  onChange={(e) => handleDateRangeChange("start", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="departure-date" className="text-xs">
                  Departure Date
                </Label>
                <Input
                  id="departure-date"
                  type="date"
                  value={filters?.dateRange?.end || ''}
                  onChange={(e) => handleDateRangeChange("end", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Active filters:{" "}
                {[
                  filters?.location && "Location",
                  filters?.activityType && "Activity type",
                  filters?.priceRange && "Price range",
                  filters?.dateRange?.start && "Arrival date",
                  filters?.dateRange?.end && "Departure date",
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}