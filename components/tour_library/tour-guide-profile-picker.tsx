"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { buildPublicProfilePath } from "@/lib/profile-refresh";
import type { TourGuideOption } from "@/lib/guide-tour-assignments";
import { ExternalLink, UserRound } from "lucide-react";

type Props = {
  selectedGuideIds: string[];
  onChange: (guideIds: string[]) => void;
  /** When editing, load current assignments if options arrive empty selection */
  required?: boolean;
  /** Tour owner / operator id — required for admin edits of another user's tour */
  operatorId?: string | null;
};

export function TourGuideProfilePicker({
  selectedGuideIds,
  onChange,
  required = true,
  operatorId = null,
}: Props) {
  const [options, setOptions] = useState<TourGuideOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = operatorId
          ? `?operatorId=${encodeURIComponent(operatorId)}`
          : "";
        const res = await fetch(`/api/tour/guide-options${qs}`);
        const data = await res.json();
        if (!cancelled) {
          if (!data.ok) {
            setError(data.error || "Could not load guide profiles");
            setOptions([]);
          } else {
            const opts = (data.options || []) as TourGuideOption[];
            setOptions(opts);
            // Default to self when nothing selected yet
            if (selectedGuideIds.length === 0 && data.selfGuideId) {
              onChange([String(data.selfGuideId)]);
            }
          }
        }
      } catch {
        if (!cancelled) setError("Could not load guide profiles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Reload when operator context changes (admin editing different tours)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorId]);

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selectedGuideIds, id])]);
    } else {
      const next = selectedGuideIds.filter((g) => g !== id);
      // Keep at least one when required
      if (required && next.length === 0) return;
      onChange(next);
    }
  };

  const selectedPublished = options.filter(
    (o) => selectedGuideIds.includes(o.id) && o.profilePublished
  );
  const hasUnpublishedSelected = options.some(
    (o) => selectedGuideIds.includes(o.id) && !o.profilePublished
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start gap-2">
        <UserRound className="mt-0.5 h-4 w-4 text-[#D4AA25]" />
        <div>
          <label className="text-sm font-medium text-foreground">
            Guide profile link{required ? " *" : ""}
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every tour in the library must link a published guide profile so advisors can send
            complete proposals to clients.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading guide profiles…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No guide profiles available.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((opt) => {
            const checked = selectedGuideIds.includes(opt.id);
            const path = buildPublicProfilePath(opt.profileSlug);
            return (
              <li
                key={opt.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2.5"
              >
                <Checkbox
                  checked={checked}
                  onChange={(e) => toggle(opt.id, e.target.checked)}
                  className="mt-0.5"
                  id={`tour-guide-${opt.id}`}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`tour-guide-${opt.id}`}
                    className="text-sm font-medium text-foreground cursor-pointer"
                  >
                    {opt.name}
                    {opt.isSelf ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                    ) : null}
                  </label>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {opt.guideNumber ? <span>#{opt.guideNumber}</span> : null}
                    {opt.profilePublished ? (
                      path ? (
                        <Link
                          href={path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#D4AA25] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View profile <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-emerald-700">Published</span>
                      )
                    ) : (
                      <span className="text-amber-700">
                        Profile not published
                        {opt.isSelf ? (
                          <>
                            {" · "}
                            <Link href="/settings" className="underline hover:no-underline">
                              Publish now
                            </Link>
                          </>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasUnpublishedSelected ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Selected guide(s) must have a published profile before this tour can go live.
        </p>
      ) : null}

      {required && !loading && selectedGuideIds.length === 0 ? (
        <p className="text-xs text-destructive">Select at least one guide profile.</p>
      ) : null}

      {selectedPublished.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {selectedPublished.length} published profile
          {selectedPublished.length === 1 ? "" : "s"} linked.
        </p>
      ) : null}
    </div>
  );
}
