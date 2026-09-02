import { EXPERIENCE_TIER_SHORT } from "@/lib/guide-profile-slug";

export function ExperienceTierBadge({ tier }: { tier: number | null | undefined }) {
  if (tier == null || tier < 1 || tier > 3) return null;
  const short = EXPERIENCE_TIER_SHORT[tier] || `Tier ${tier}`;
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded border border-amber-500/60 bg-amber-50 text-amber-950"
      title={EXPERIENCE_TIER_SHORT[tier] ? `Experience tier ${tier}` : undefined}
    >
      {short}
    </span>
  );
}
