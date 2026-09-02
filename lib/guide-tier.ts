/** Matches DB enum `guide_tier_enum`: apprentice | professional | master */
export const GUIDE_TIERS = ["apprentice", "professional", "master"] as const;
export type GuideTier = (typeof GUIDE_TIERS)[number];

export const GUIDE_TIER_LABELS: Record<GuideTier, string> = {
  apprentice: "Apprentice Guide",
  professional: "Professional Guide",
  master: "Master Guide",
};

const LEGACY_TIER_ALIASES: Record<string, GuideTier> = {
  junior: "apprentice",
  expert: "professional",
};

export function isGuideTier(value: string | null | undefined): value is GuideTier {
  return value != null && (GUIDE_TIERS as readonly string[]).includes(value as GuideTier);
}

export function normalizeGuideTier(tier: string | null | undefined): GuideTier {
  if (isGuideTier(tier)) return tier;
  if (tier && LEGACY_TIER_ALIASES[tier]) return LEGACY_TIER_ALIASES[tier];
  return "professional";
}

export function guideTierLabel(tier: string | null | undefined): string {
  return GUIDE_TIER_LABELS[normalizeGuideTier(tier)];
}
