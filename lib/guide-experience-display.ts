import { EXPERIENCE_TIER_LABELS, EXPERIENCE_TIER_SHORT } from "@/lib/guide-profile-slug";
import { certificationBadgeLabel, certificationStageFromStatus } from "@/lib/certification-display";
import { guideTierLabel, isGuideTier } from "@/lib/guide-tier";

export type GuideTierContext = {
  guideTier?: string | null;
  experienceTierDeclared?: number | null;
  experienceTierVerified?: number | null;
};

export type ExperienceTierDisplay = {
  label: string;
  shortLabel: string;
  source: "verified" | "declared" | "platform" | null;
};

export function getCurrentExperienceTierDisplay(ctx: GuideTierContext): ExperienceTierDisplay {
  const verified = ctx.experienceTierVerified;
  if (verified != null && verified >= 1 && verified <= 3 && EXPERIENCE_TIER_LABELS[verified]) {
    return {
      label: `${EXPERIENCE_TIER_LABELS[verified]} (verified)`,
      shortLabel: EXPERIENCE_TIER_SHORT[verified] || EXPERIENCE_TIER_LABELS[verified],
      source: "verified",
    };
  }
  const declared = ctx.experienceTierDeclared;
  if (declared != null && declared >= 1 && declared <= 3 && EXPERIENCE_TIER_LABELS[declared]) {
    return {
      label: EXPERIENCE_TIER_LABELS[declared],
      shortLabel: EXPERIENCE_TIER_SHORT[declared] || EXPERIENCE_TIER_LABELS[declared],
      source: "declared",
    };
  }
  if (ctx.guideTier && isGuideTier(ctx.guideTier)) {
    const platform = guideTierLabel(ctx.guideTier);
    return { label: platform, shortLabel: platform, source: "platform" };
  }
  return { label: "Not set", shortLabel: "—", source: null };
}

export function certificationStatusLabel(status: string | null | undefined): string {
  return certificationBadgeLabel(certificationStageFromStatus(status));
}
