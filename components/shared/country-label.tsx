"use client";

import { CountryFlag } from "@/components/shared/country-flag";
import { countryOptionForValue } from "@/lib/country-options";

type Props = {
  name: string | null | undefined;
  showCode?: boolean;
  className?: string;
};

/** Read-only country name with circle flag (and optional ISO code). */
export function CountryLabel({ name, showCode = true, className = "" }: Props) {
  if (!name?.trim()) {
    return <span className={`text-muted-foreground ${className}`}>—</span>;
  }

  const opt = countryOptionForValue(name);
  if (!opt) return <span className={className}>{name}</span>;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <CountryFlag countryCode={opt.cca2} size="sm" title={opt.name} />
      <span>{opt.name}</span>
      {showCode && opt.cca2 !== "XX" && (
        <span className="text-xs text-muted-foreground font-mono">{opt.cca2}</span>
      )}
    </span>
  );
}
