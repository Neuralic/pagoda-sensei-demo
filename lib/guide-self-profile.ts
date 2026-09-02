import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedGuideProfileInput } from "@/lib/managed-guide-profile";
import { serializeAvailabilityCalendar } from "@/lib/guide-availability";

/** Shared marketplace profile columns (operator self-profile and managed guides). */
export function buildMarketplaceProfilePatch(
  input: Partial<ManagedGuideProfileInput>
): Record<string, unknown> {
  const profilePatch: Record<string, unknown> = {};
  if (input.bio !== undefined) profilePatch.bio = input.bio;
  if (input.languages !== undefined) profilePatch.languages = input.languages;
  if (input.specialties !== undefined) profilePatch.specialties = input.specialties;
  if (input.destinations !== undefined) profilePatch.destinations = input.destinations;
  if (input.yearsExperience !== undefined) profilePatch.years_experience = input.yearsExperience;
  if (input.toursCompletedEstimate !== undefined)
    profilePatch.tours_completed_estimate = input.toursCompletedEstimate;
  if (input.experienceTierDeclared !== undefined)
    profilePatch.experience_tier_declared = input.experienceTierDeclared;
  if (input.crisisHandlingExample !== undefined)
    profilePatch.crisis_handling_example = input.crisisHandlingExample;
  if (input.localExpertiseHighlight !== undefined)
    profilePatch.local_expertise_highlight = input.localExpertiseHighlight;
  if (input.preTourPreparation !== undefined)
    profilePatch.pre_tour_preparation = input.preTourPreparation;
  if (input.clientFitDescription !== undefined)
    profilePatch.client_fit_description = input.clientFitDescription;
  if (input.profilePicturePath !== undefined)
    profilePatch.profile_picture_path = input.profilePicturePath;
  if (input.introVideoPath !== undefined) profilePatch.intro_video_path = input.introVideoPath;
  if (input.introVideoUrl !== undefined) profilePatch.intro_video_url = input.introVideoUrl;
  if (input.availableForVideoCall !== undefined)
    profilePatch.available_for_video_call = input.availableForVideoCall;
  if (input.dailyRateAmount !== undefined) profilePatch.daily_rate_amount = input.dailyRateAmount;
  if (input.dailyRateCurrency !== undefined)
    profilePatch.daily_rate_currency = input.dailyRateCurrency;
  if (input.country !== undefined) profilePatch.country = input.country;
  if (input.city !== undefined) profilePatch.city = input.city;
  if (input.guideProfileStatus) profilePatch.guide_profile_status = input.guideProfileStatus;
  if (input.certificationStatus) profilePatch.certification_status = input.certificationStatus;
  if (input.availabilityCalendar) {
    profilePatch.guide_availability_calendar = input.availabilityCalendar;
  } else if (input.unavailableDates) {
    profilePatch.guide_availability_calendar = serializeAvailabilityCalendar(
      input.unavailableDates,
      true
    );
  }
  return profilePatch;
}

export function parseSelfProfileBody(body: Record<string, unknown>): Partial<ManagedGuideProfileInput> {
  const out: Partial<ManagedGuideProfileInput> = {};
  if (body.bio !== undefined) out.bio = String(body.bio).slice(0, 10000);
  if (Array.isArray(body.languages)) out.languages = body.languages as string[];
  if (Array.isArray(body.specialties)) out.specialties = body.specialties as string[];
  if (Array.isArray(body.destinations)) out.destinations = body.destinations as string[];
  if (body.yearsExperience !== undefined || body.years_experience !== undefined) {
    const v = body.yearsExperience ?? body.years_experience;
    out.yearsExperience = typeof v === "number" ? v : v != null ? parseInt(String(v), 10) : null;
  }
  if (body.toursCompletedEstimate !== undefined || body.tours_completed_estimate !== undefined) {
    const v = body.toursCompletedEstimate ?? body.tours_completed_estimate;
    out.toursCompletedEstimate = typeof v === "number" ? v : v != null ? parseInt(String(v), 10) : null;
  }
  if (body.experienceTierDeclared !== undefined || body.experience_tier_declared !== undefined) {
    const v = body.experienceTierDeclared ?? body.experience_tier_declared;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    out.experienceTierDeclared = n >= 1 && n <= 3 ? n : null;
  }
  const textFields: [keyof ManagedGuideProfileInput, string][] = [
    ["crisisHandlingExample", "crisis_handling_example"],
    ["localExpertiseHighlight", "local_expertise_highlight"],
    ["preTourPreparation", "pre_tour_preparation"],
    ["clientFitDescription", "client_fit_description"],
  ] as unknown as [keyof ManagedGuideProfileInput, string][];
  for (const [camel, snake] of textFields) {
    if (body[camel] !== undefined || body[snake] !== undefined) {
      const val = body[camel] ?? body[snake];
      (out as Record<string, unknown>)[camel as string] =
        val != null ? String(val).slice(0, 500) : null;
    }
  }
  if (body.profilePicturePath !== undefined || body.profile_picture_path !== undefined)
    out.profilePicturePath = String(body.profilePicturePath ?? body.profile_picture_path ?? "");
  if (body.introVideoPath !== undefined || body.intro_video_path !== undefined)
    out.introVideoPath = String(body.introVideoPath ?? body.intro_video_path ?? "");
  if (body.introVideoUrl !== undefined || body.intro_video_url !== undefined)
    out.introVideoUrl = String(body.introVideoUrl ?? body.intro_video_url ?? "");
  if (body.availableForVideoCall !== undefined || body.available_for_video_call !== undefined) {
    const v = body.availableForVideoCall ?? body.available_for_video_call;
    out.availableForVideoCall =
      v === true || v === "true" || v === "yes"
        ? true
        : v === false || v === "false" || v === "no"
          ? false
          : null;
  }
  if (body.dailyRateAmount !== undefined || body.daily_rate_amount !== undefined) {
    const v = body.dailyRateAmount ?? body.daily_rate_amount;
    out.dailyRateAmount = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : null;
  }
  if (body.dailyRateCurrency !== undefined || body.daily_rate_currency !== undefined)
    out.dailyRateCurrency = String(body.dailyRateCurrency ?? body.daily_rate_currency ?? "JPY");
  if (body.country !== undefined) out.country = String(body.country);
  if (body.city !== undefined) out.city = String(body.city);
  if (body.availabilityCalendar != null || body.availability_calendar != null) {
    const raw = body.availabilityCalendar ?? body.availability_calendar;
    if (raw && typeof raw === "object") {
      out.availabilityCalendar = raw as ManagedGuideProfileInput["availabilityCalendar"];
    }
  }
  if (Array.isArray(body.unavailableDates) || Array.isArray(body.unavailable_dates)) {
    const arr = ((body.unavailableDates ?? body.unavailable_dates) as string[]).map(String);
    out.unavailableDates = arr;
    out.availabilityCalendar = serializeAvailabilityCalendar(arr, true);
  }
  return out;
}

export async function applySelfGuideProfileUpdate(
  supabase: SupabaseClient,
  userId: string,
  input: Partial<ManagedGuideProfileInput>
): Promise<{ error?: string }> {
  const userPatch: Record<string, unknown> = {};
  if (input.country !== undefined) userPatch.country = input.country;
  if (input.city !== undefined) userPatch.city = input.city;
  if (Object.keys(userPatch).length > 0) {
    const { error } = await supabase.from("users").update(userPatch).eq("id", userId);
    if (error) return { error: error.message };
  }

  const profilePatch = buildMarketplaceProfilePatch(input);
  if (Object.keys(profilePatch).length === 0) return {};

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    const { ensureGuideMarketplaceProfile } = await import("@/lib/ensure-guide-marketplace-profile");
    const created = await ensureGuideMarketplaceProfile(supabase, userId);
    if ("error" in created) return { error: created.error };
  }

  const { error } = await supabase.from("profiles").update(profilePatch).eq("user_id", userId);
  if (error) return { error: error.message };
  return {};
}
