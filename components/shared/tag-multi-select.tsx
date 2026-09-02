"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { CountryFlag } from "@/components/shared/country-flag";

type Props = {
  label: string;
  required?: boolean;
  suggestions: readonly string[];
  selected: string[];
  onChange: (items: string[]) => void;
  addPlaceholder?: string;
  hint?: string;
  filterPlaceholder?: string;
  /** When set, shows a flag icon per tag/suggestion (e.g. language → country code). */
  getFlagCode?: (item: string) => string | null;
};

export function TagMultiSelect({
  label,
  required,
  suggestions,
  selected,
  onChange,
  addPlaceholder,
  hint,
  filterPlaceholder,
  getFlagCode,
}: Props) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    const exists = selected.some((s) => s.toLowerCase() === tag.toLowerCase());
    if (!exists) onChange([...selected, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => onChange(selected.filter((s) => s !== tag));

  const toggleSuggestion = (item: string) => {
    if (selected.includes(item)) removeTag(item);
    else onChange([...selected, item]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(draft);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return suggestions.filter((s) => {
      if (selected.includes(s)) return false;
      if (!q) return true;
      return s.toLowerCase().includes(q);
    });
  }, [filter, selected, suggestions]);

  const showFilter = suggestions.length > 12;

  return (
    <div>
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{hint}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 mb-2">
          {selected.map((tag) => {
            const flag = getFlagCode?.(tag);
            return (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border bg-[#D4AA25]/10 border-[#D4AA25]"
            >
              {flag ? <CountryFlag countryCode={flag} size="sm" title={tag} /> : null}
              {tag}
              <button
                type="button"
                className="hover:opacity-70"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
          })}
        </div>
      )}

      {showFilter && (
        <Input
          className="mt-1 mb-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={filterPlaceholder || "Filter options…"}
        />
      )}

      <div className="flex flex-wrap gap-2 mt-1 max-h-48 overflow-y-auto pr-1">
        {filteredSuggestions.map((s) => {
          const flag = getFlagCode?.(s);
          return (
          <button
            key={s}
            type="button"
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer hover:border-[#D4AA25]"
            onClick={() => toggleSuggestion(s)}
          >
            {flag ? <CountryFlag countryCode={flag} size="sm" title={s} /> : null}
            {s}
          </button>
        );
        })}
      </div>

      <Input
        className="mt-2"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={addPlaceholder || "Type and press Enter to add another"}
      />
    </div>
  );
}
