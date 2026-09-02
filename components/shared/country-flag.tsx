"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import {
  getCountryCircleFlagUrl,
  getCountryFlagCdnUrl,
} from "@/lib/country-options";

type Size = "sm" | "md";

const PX: Record<Size, number> = { sm: 24, md: 32 };

type Props = {
  countryCode: string;
  size?: Size;
  className?: string;
  title?: string;
};

/** Renders a country flag from public CDNs (circle SVG, FlagCDN PNG fallback). */
export function CountryFlag({
  countryCode,
  size = "sm",
  className = "",
  title,
}: Props) {
  const [useCdnFallback, setUseCdnFallback] = useState(false);
  const px = PX[size];
  const code = countryCode?.trim().toUpperCase();

  if (!code || code === "XX" || code.length !== 2) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-muted shrink-0 ${className}`}
        style={{ width: px, height: px }}
        title={title}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </span>
    );
  }

  const circleUrl = getCountryCircleFlagUrl(code);
  const cdnUrl = getCountryFlagCdnUrl(code, px * 2);
  const src = useCdnFallback ? cdnUrl : circleUrl ?? cdnUrl;

  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-muted shrink-0 ${className}`}
        style={{ width: px, height: px }}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={px}
      height={px}
      title={title}
      className={`rounded-full object-cover shrink-0 bg-muted ${className}`}
      onError={() => {
        if (!useCdnFallback && cdnUrl && circleUrl) setUseCdnFallback(true);
      }}
    />
  );
}
