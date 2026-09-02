/** §4.2 — experience tier thresholds and marketplace rate multipliers. */

export const EXPERIENCE_TIER_RATE_MULTIPLIER: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 0.9,
  3: 0.8,
};

export function tierRatePercent(tier: number | null | undefined): number | null {
  if (tier == null || tier < 1 || tier > 3) return null;
  return Math.round(EXPERIENCE_TIER_RATE_MULTIPLIER[tier as 1 | 2 | 3] * 100);
}

export function effectiveDailyRate(baseAmount: number, tier: number | null | undefined): number | null {
  if (tier == null || tier < 1 || tier > 3 || !Number.isFinite(baseAmount)) return null;
  const mult = EXPERIENCE_TIER_RATE_MULTIPLIER[tier as 1 | 2 | 3];
  return Math.round(baseAmount * mult * 100) / 100;
}

export type TierThresholdCheck = { ok: true } | { ok: false; error: string; field: "experienceTierDeclared" };

/**
 * Validates self-declared tier against years + tours (operator responsibility per §4.1).
 */
export function validateExperienceTierDeclaration(
  tier: number | null | undefined,
  yearsExperience: number | null | undefined,
  toursCompletedEstimate: number | null | undefined
): TierThresholdCheck {
  if (tier == null || tier < 1 || tier > 3) {
    return { ok: false, error: "Experience tier is required", field: "experienceTierDeclared" };
  }
  const years = yearsExperience ?? 0;
  const tours = toursCompletedEstimate ?? 0;

  if (tier === 1) {
    if (years < 3 || tours < 200) {
      return {
        ok: false,
        error:
          "Tier 1 (Senior) requires at least 3 years of experience and 200+ completed tours (§4.2)",
        field: "experienceTierDeclared",
      };
    }
  }

  if (tier === 2) {
    const experienceMonths = years * 12;
    if (experienceMonths < 18 || tours < 100) {
      return {
        ok: false,
        error:
          "Tier 2 (Experienced) requires at least 18 months of experience and 100+ completed tours (§4.2)",
        field: "experienceTierDeclared",
      };
    }
  }

  if (tier === 3) {
    const experienceMonths = years * 12;
    if (experienceMonths >= 12 && tours >= 50) {
      return {
        ok: false,
        error:
          "Tier 3 (Junior) is for guides with under 12 months experience or fewer than 50 tours — choose Tier 2 or 1 if applicable (§4.2)",
        field: "experienceTierDeclared",
      };
    }
  }

  return { ok: true };
}
