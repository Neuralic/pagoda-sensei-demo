"use client";

import { CountryFlag } from "@/components/shared/country-flag";
import { getLanguageFlagCode } from "@/lib/countries-map";

type Props = {
  language: string;
  showCode?: boolean;
  className?: string;
};

export function LanguageLabel({ language, showCode = true, className = "" }: Props) {
  const code = getLanguageFlagCode(language);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {code ? (
        <CountryFlag countryCode={code} size="sm" title={language} />
      ) : null}
      <span>{language}</span>
      {showCode && code && (
        <span className="text-xs text-muted-foreground font-mono">{code}</span>
      )}
    </span>
  );
}
