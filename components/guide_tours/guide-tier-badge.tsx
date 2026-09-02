import { Badge } from "@/components/ui/badge";
import { guideTierLabel, normalizeGuideTier, type GuideTier } from "@/lib/guide-tier";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<GuideTier, string> = {
  apprentice: "bg-slate-100 text-slate-800 border-slate-200",
  professional: "bg-amber-50 text-amber-900 border-amber-200",
  master: "bg-[#D4AA25]/15 text-[#8a6b0f] border-[#D4AA25]/40",
};

export function GuideTierBadge({
  tier,
  className,
}: {
  tier: string | null | undefined;
  className?: string;
}) {
  const t: GuideTier = normalizeGuideTier(tier);
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", TIER_STYLES[t], className)}>
      {guideTierLabel(t)}
    </Badge>
  );
}
