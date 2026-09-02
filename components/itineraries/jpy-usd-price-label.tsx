"use client";

import { formatJpyUsdPriceLine, useFxUsdJpy } from "@/hooks/use-fx-usd-jpy";

type Props = {
  jpy: number | null | undefined;
  className?: string;
};

/** ~US$493 — USD estimate only (JPY is never shown alongside USD). */
export function JpyUsdPriceLabel({ jpy, className }: Props) {
  const fx = useFxUsdJpy();
  const line = formatJpyUsdPriceLine(jpy, fx);

  if (!line) return null;

  return (
    <span className={className} title={line.title ?? undefined}>
      {line.label}
    </span>
  );
}
