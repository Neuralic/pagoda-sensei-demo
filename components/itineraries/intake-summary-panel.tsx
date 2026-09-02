"use client";

import type { ItineraryIntakeData } from "@/lib/itinerary-intake";
import {
  buildIntakeSummaryRows,
  intakeSummaryHasContent,
} from "@/lib/intake-summary";

type Props = {
  intake: ItineraryIntakeData | null | undefined;
  fallbackLocation?: string;
  className?: string;
  title?: string;
};

export function IntakeSummaryPanel({
  intake,
  fallbackLocation,
  className,
  title = "Client intake (Asia Luxury request)",
}: Props) {
  if (!intakeSummaryHasContent(intake)) {
    return (
      <div className={className}>
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">No intake details were submitted.</p>
      </div>
    );
  }

  const rows = buildIntakeSummaryRows(intake!, { fallbackLocation });

  return (
    <div className={className}>
      {title ? <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3> : null}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium whitespace-pre-wrap wrap-break-word">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
