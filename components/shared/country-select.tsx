"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/shared/country-flag";
import {
  COUNTRY_LIST,
  countryOptionForValue,
  type CountryOption,
} from "@/lib/country-options";

type Props = {
  value: string;
  onChange: (countryName: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function CountrySelect({
  value,
  onChange,
  label = "Country",
  placeholder = "Select a country",
  required,
  disabled,
  className = "",
  id: idProp,
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => countryOptionForValue(value), [value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_LIST;
    return COUNTRY_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.cca2.toLowerCase().includes(q)
    );
  }, [search]);

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

  const pick = (country: CountryOption) => {
    onChange(country.name);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label && (
        <Label htmlFor={id} className="mb-1.5 block">
          {label}
          {required ? " *" : ""}
        </Label>
      )}

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
        {selected ? (
          <span className="flex items-center gap-2.5 truncate text-left">
            <CountryFlag countryCode={selected.cca2} size="sm" title={selected.name} />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4 shrink-0 opacity-60" />
            {placeholder}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
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
                placeholder="Search by country name…"
                className="pl-9 h-9 border-input bg-background"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setSearch("");
                  }
                }}
              />
            </div>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No countries match your search
              </li>
            ) : (
              filtered.map((country) => {
                const isSelected = value === country.name;
                return (
                  <li key={country.cca2} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#D4AA25]/10 ${
                        isSelected ? "bg-[#D4AA25]/15 font-medium" : ""
                      }`}
                      onClick={() => pick(country)}
                    >
                      <CountryFlag countryCode={country.cca2} size="md" title={country.name} />
                      <span className="flex-1 min-w-0 truncate">{country.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">
                        {country.cca2}
                      </span>
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
