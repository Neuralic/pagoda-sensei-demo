"use client";

import Link from "next/link";
import type { ProfileCompleteness } from "@/lib/profile-completeness";

type Props = {
  title?: string;
  completeness: ProfileCompleteness;
  guideProfileStatus?: string;
  editHref?: string;
  compact?: boolean;
  showPublishItem?: boolean;
};

export function ProfileCompletenessCard({
  title = "Profile Completeness",
  completeness,
  guideProfileStatus = "draft",
  editHref,
  compact = false,
  showPublishItem = true,
}: Props) {
  const published = guideProfileStatus === "published";
  const publishDone = showPublishItem ? published : true;

  const displayItems = [
    ...completeness.items,
    ...(showPublishItem
      ? [{ key: "published", label: "Published (bookable)", done: publishDone }]
      : []),
  ];

  const displayTotal = completeness.total + (showPublishItem ? 1 : 0);
  const displayCompleted =
    completeness.completed + (showPublishItem && publishDone ? 1 : 0);
  const displayPercent =
    displayTotal > 0 ? Math.round((displayCompleted / displayTotal) * 100) : 0;

  const barColor =
    displayPercent >= 100
      ? "bg-emerald-500"
      : displayPercent >= 60
        ? "bg-[#D4AA25]"
        : "bg-amber-500";

  return (
    <div
      className={`rounded-lg border bg-muted/30 ${compact ? "p-3" : "p-4"} ${!compact ? "space-y-3" : ""}`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-2" : "mb-3"}`}>
        <p className={`font-medium text-foreground ${compact ? "text-sm" : ""}`}>{title}</p>
        <span className="text-sm text-muted-foreground">
          {displayCompleted}/{displayTotal} · {displayPercent}%
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, displayPercent)}%` }}
        />
      </div>

      {!compact && (
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {displayItems.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                  item.done ? "bg-emerald-500" : "bg-gray-300"
                }`}
              />
              <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editHref && displayPercent < 100 && (
        <Link
          href={editHref}
          className={`inline-block text-[#D4AA25] font-semibold hover:underline ${compact ? "text-xs mt-2" : "text-sm mt-1"}`}
        >
          Complete Profile →
        </Link>
      )}
    </div>
  );
}
