import type { SupabaseClient } from "@supabase/supabase-js";
import { generateGuideProfileSlug } from "@/lib/guide-profile-slug";

export type EnsureProfileOptions = {
  country?: string | null;
  city?: string | null;
  bio?: string | null;
};

/** One marketplace profile row per guide user (operator or team member). */
export async function ensureGuideMarketplaceProfile(
  supabase: SupabaseClient,
  userId: string,
  opts?: EnsureProfileOptions
): Promise<{ profileSlug: string } | { error: string }> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, profile_slug")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.profile_slug) {
    return { profileSlug: existing.profile_slug as string };
  }

  if (existing && !existing.profile_slug) {
    const slug = generateGuideProfileSlug();
    const { error } = await supabase
      .from("profiles")
      .update({ profile_slug: slug })
      .eq("user_id", userId);
    if (error) return { error: error.message };
    return { profileSlug: slug };
  }

  let profileSlug = generateGuideProfileSlug();
  for (let i = 0; i < 5; i++) {
    const { error: profErr } = await supabase.from("profiles").insert({
      user_id: userId,
      profile_slug: profileSlug,
      bio: opts?.bio ?? null,
      country: opts?.country ?? null,
      city: opts?.city ?? null,
      languages: ["English"],
      specialties: [],
      destinations: [],
      guide_profile_status: "draft",
      certification_status: "pending",
      marketplace_available: true,
    });

    if (!profErr) return { profileSlug };
    if (profErr.code === "23505" && String(profErr.message).includes("profile_slug")) {
      profileSlug = generateGuideProfileSlug();
      continue;
    }
    return { error: profErr.message };
  }

  return { error: "Failed to create profile" };
}
