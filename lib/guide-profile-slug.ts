import { randomBytes } from "crypto";

/** Permanent slug: `g-` + 12 hex chars (e.g. g-a1b2c3d4e5f6). */
export function generateGuideProfileSlug(): string {
  return `g-${randomBytes(6).toString("hex")}`;
}

export function isValidGuideProfileSlug(slug: string): boolean {
  return /^g-[a-f0-9]{12}$/.test(slug);
}

export const EXPERIENCE_TIER_LABELS: Record<number, string> = {
  1: "Tier 1 — Junior Guide",
  2: "Tier 2 — Expert Guide",
  3: "Tier 3 — Master Guide",
};

export const EXPERIENCE_TIER_SHORT: Record<number, string> = {
  1: "Junior",
  2: "Expert",
  3: "Master",
};

export const GUIDE_PROFILE_STATUSES = [
  "draft",
  "published",
  "archived",
  "deactivated",
] as const;

export type GuideProfileStatus = (typeof GUIDE_PROFILE_STATUSES)[number];

export const CERTIFICATION_STATUSES = ["pending", "certified", "rejected"] as const;
