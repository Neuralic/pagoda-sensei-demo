"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JAPAN_PREFECTURES } from "@/lib/japan-prefectures";

const DESTINATION_OPTIONS = [...JAPAN_PREFECTURES].sort((a, b) =>
  a.localeCompare(b)
);

type Props = {
  value: string;
  onChange: (destination: string) => void;
  label?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Extra destinations not in the prefecture list (e.g. from catalog facets). */
  extraOptions?: string[];
  showLabelIcon?: boolean;
};

export function DestinationSelect({
  value,
  onChange,
  label = "Destination",
  placeholder = "Select a destination...",
  searchPlaceholder = "Type to filter destinations…",
  required,
  disabled,
  className = "",
  id: idProp,
  extraOptions = [],
  showLabelIcon = true,
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const set = new Set<string>(DESTINATION_OPTIONS);
    for (const extra of extraOptions) {
      const t = String(extra || "").trim();
      if (t) set.add(t);
    }
    // Keep current value visible even if not in the canonical list
    if (value?.trim()) set.add(value.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [extraOptions, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((d) => d.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (destination: string) => {
    onChange(destination);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label ? (
        <Label htmlFor={id} className="mb-1.5 flex items-center gap-2">
          {showLabelIcon ? <MapPin className="w-4 h-4 shrink-0" /> : null}
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}

      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-10 justify-between font-normal bg-background hover:bg-muted/50 ${
          open ? "ring-2 ring-[#D4AA25]/40 border-[#D4AA25]" : ""
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? (
          <span className="truncate text-left">{value}</span>
        ) : (
          <span className="truncate text-left text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown
          className={`ml-2 h-4 w-4 shrink-0 opacity-60 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </Button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 h-9 border-input bg-background"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setSearch("");
                  }
                  if (e.key === "Enter" && filtered.length === 1) {
                    e.preventDefault();
                    pick(filtered[0]);
                  }
                }}
              />
            </div>
          </div>

          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No destinations match “{search.trim()}”
              </li>
            ) : (
              filtered.map((destination) => {
                const isSelected = value === destination;
                return (
                  <li key={destination} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#D4AA25]/10 ${
                        isSelected ? "bg-[#D4AA25]/15 font-medium" : ""
                      }`}
                      onClick={() => pick(destination)}
                    >
                      {destination}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
