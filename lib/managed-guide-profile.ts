import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuideProfileValidationResult } from "@/lib/guide-marketplace-validation";
import { validateGuideMarketplaceProfile } from "@/lib/guide-marketplace-validation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { generateGuideProfileSlug } from "@/lib/guide-profile-slug";
import { buildMarketplaceProfilePatch } from "@/lib/guide-self-profile";
import {
  parseAvailabilityCalendar,
  serializeAvailabilityCalendar,
  type GuideAvailabilityCalendar,
} from "@/lib/guide-availability";
import {
  findUserByEmail,
  findUserByNormalizedName,
  isUsableNormalizedName,
  isUniqueViolation,
  normalizeEmail,
  normalizeFullName,
  registrationConflictMessage,
} from "@/lib/register-identity";

export type ManagedGuideProfileInput = {
  firstName: string;
  lastName: string;
  bio?: string | null;
  languages?: string[];
  specialties?: string[];
  destinations?: string[];
  yearsExperience?: number | null;
  toursCompletedEstimate?: number | null;
  experienceTierDeclared?: number | null;
  crisisHandlingExample?: string | null;
  localExpertiseHighlight?: string | null;
  preTourPreparation?: string | null;
  clientFitDescription?: string | null;
  profilePicturePath?: string | null;
  introVideoPath?: string | null;
  introVideoUrl?: string | null;
  availableForVideoCall?: boolean | null;
  dailyRateAmount?: number | null;
  dailyRateCurrency?: string | null;
  guideProfileStatus?: string;
  certificationStatus?: string;
  country?: string | null;
  city?: string | null;
  availabilityCalendar?: GuideAvailabilityCalendar | null;
  unavailableDates?: string[];
};

function parseVideoCallAvailability(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "yes") return true;
  if (value === false || value === "false" || value === "no") return false;
  return null;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: "Guide", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function parseManagedGuideBody(body: Record<string, unknown>): ManagedGuideProfileInput | { error: string } {
  const fullName = String(body.fullName ?? body.full_name ?? "").trim();
  const firstName = String(body.firstName ?? body.first_name ?? "").trim();
  const lastName = String(body.lastName ?? body.last_name ?? "").trim();

  let fn = firstName;
  let ln = lastName;
  if (!fn && !ln && fullName) {
    const s = splitName(fullName);
    fn = s.first;
    ln = s.last;
  }
  const saveAsDraft = body.saveAsDraft === true;
  if (!fn && !saveAsDraft) return { error: "Full name is required" };
  if (!fn) fn = "Guide";

  const tier = body.experienceTierDeclared ?? body.experience_tier_declared;
  const tierNum =
    typeof tier === "number" ? tier : typeof tier === "string" ? parseInt(tier, 10) : null;

  const out: ManagedGuideProfileInput = {
    firstName: fn,
    lastName: ln,
    ...parseAvailabilityFromBody(body),
  };

  if (body.bio !== undefined && body.bio !== null) out.bio = String(body.bio).slice(0, 10000);
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
  if (tierNum && tierNum >= 1 && tierNum <= 3) out.experienceTierDeclared = tierNum;

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

  if (body.profilePicturePath !== undefined || body.profile_picture_path !== undefined) {
    const v = body.profilePicturePath ?? body.profile_picture_path;
    out.profilePicturePath = typeof v === "string" ? v : null;
  }
  if (body.introVideoPath !== undefined || body.intro_video_path !== undefined) {
    const v = body.introVideoPath ?? body.intro_video_path;
    out.introVideoPath = typeof v === "string" ? v : null;
  }
  if (body.introVideoUrl !== undefined || body.intro_video_url !== undefined) {
    const v = body.introVideoUrl ?? body.intro_video_url;
    out.introVideoUrl = typeof v === "string" ? v : null;
  }
  if (body.availableForVideoCall !== undefined || body.available_for_video_call !== undefined) {
    out.availableForVideoCall = parseVideoCallAvailability(
      body.availableForVideoCall ?? body.available_for_video_call
    );
  }
  if (body.dailyRateAmount !== undefined || body.daily_rate_amount !== undefined) {
    const v = body.dailyRateAmount ?? body.daily_rate_amount;
    out.dailyRateAmount = typeof v === "number" ? v : v != null ? parseFloat(String(v)) : null;
  }
  if (body.dailyRateCurrency !== undefined || body.daily_rate_currency !== undefined) {
    out.dailyRateCurrency = String(body.dailyRateCurrency ?? body.daily_rate_currency ?? "JPY");
  }
  if (body.guideProfileStatus !== undefined || body.guide_profile_status !== undefined) {
    out.guideProfileStatus = String(body.guideProfileStatus ?? body.guide_profile_status);
  }
  if (body.certificationStatus !== undefined) {
    out.certificationStatus = String(body.certificationStatus);
  }
  if (body.country !== undefined) out.country = typeof body.country === "string" ? body.country : null;
  if (body.city !== undefined) out.city = typeof body.city === "string" ? body.city : null;

  return out;
}

/** Invite claim — only patch fields the guide submits; preserve operator pre-fill. */
export function parseInviteClaimBody(
  body: Record<string, unknown>
): Partial<ManagedGuideProfileInput> {
  const out: Partial<ManagedGuideProfileInput> = {};

  const fullName = String(body.fullName ?? body.full_name ?? "").trim();
  if (fullName) {
    const s = splitName(fullName);
    out.firstName = s.first;
    out.lastName = s.last;
  }

  if (body.bio !== undefined && body.bio !== null && String(body.bio).trim()) {
    out.bio = String(body.bio).slice(0, 10000);
  }
  const pic = body.profilePicturePath ?? body.profile_picture_path;
  if (typeof pic === "string" && pic.trim()) {
    out.profilePicturePath = pic;
  }
  const introPath = body.introVideoPath ?? body.intro_video_path;
  if (typeof introPath === "string" && introPath.trim()) {
    out.introVideoPath = introPath;
  }
  const introUrl = body.introVideoUrl ?? body.intro_video_url;
  if (typeof introUrl === "string" && introUrl.trim()) {
    out.introVideoUrl = introUrl.trim();
  }
  if (body.availableForVideoCall !== undefined || body.available_for_video_call !== undefined) {
    out.availableForVideoCall = parseVideoCallAvailability(
      body.availableForVideoCall ?? body.available_for_video_call
    );
  }

  return out;
}

function parseAvailabilityFromBody(
  body: Record<string, unknown>
): Pick<ManagedGuideProfileInput, "availabilityCalendar" | "unavailableDates"> {
  if (body.availabilityCalendar != null || body.availability_calendar != null) {
    const raw = body.availabilityCalendar ?? body.availability_calendar;
    if (raw && typeof raw === "object") {
      const parsed = parseAvailabilityCalendar(raw);
      return {
        availabilityCalendar: {
          unavailableDates: parsed.unavailableDates,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        },
      };
    }
  }
  if (Array.isArray(body.unavailableDates) || Array.isArray(body.unavailable_dates)) {
    const arr = (body.unavailableDates ?? body.unavailable_dates) as string[];
    return {
      availabilityCalendar: serializeAvailabilityCalendar(arr.map(String), true),
      unavailableDates: arr.map(String),
    };
  }
  if (body.saveAvailabilityCalendar === true || body.save_availability_calendar === true) {
    return {
      availabilityCalendar: serializeAvailabilityCalendar([], true),
    };
  }
  return {};
}

export async function createManagedGuideUser(
  supabase: SupabaseClient,
  operatorId: string,
  input: ManagedGuideProfileInput,
  opts?: { inviteEmail?: string | null }
): Promise<{ guideUserId: string; profileSlug: string } | { error: string; field?: string }> {
  const normalizedName = normalizeFullName(input.firstName, input.lastName);
  if (isUsableNormalizedName(normalizedName)) {
    const existingByName = await findUserByNormalizedName(
      supabase,
      input.firstName,
      input.lastName,
      { role: "guide" }
    );
    if (existingByName) {
      const conflict = registrationConflictMessage(existingByName, "name");
      return { error: conflict.error, field: "name" };
    }
  }

  const inviteEmail = opts?.inviteEmail ? normalizeEmail(opts.inviteEmail) : "";
  if (inviteEmail) {
    const existingByEmail = await findUserByEmail(supabase, inviteEmail, {
      role: "guide",
    });
    if (existingByEmail) {
      // Placeholder managed emails are unique; real invite emails must not collide for guides.
      if (!existingByEmail.email?.includes("@managed.pagoda.local")) {
        const conflict = registrationConflictMessage(existingByEmail, "email");
        return { error: conflict.error, field: "email" };
      }
    }
  }

  const placeholderEmail = `guide+${Date.now()}.${Math.random().toString(36).slice(2, 9)}@managed.pagoda.local`;
  const password_hash = await bcrypt.hash(randomBytes(32).toString("hex"), 8);

  const guideNumber = String(Math.floor(100000 + Math.random() * 900000));

  const { data: user, error: userErr } = await supabase
    .from("users")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: placeholderEmail,
      role: "guide",
      guide_number: guideNumber,
      managed_by_operator_id: operatorId,
      is_operator: false,
      guide_approved: false,
      is_active: true,
      is_verified: false,
      password_hash,
      country: input.country,
      city: input.city,
      name_normalized: isUsableNormalizedName(normalizedName) ? normalizedName : null,
    })
    .select("id")
    .single();

  if (userErr || !user) {
    if (isUniqueViolation(userErr)) {
      const msg = String(userErr?.message || "").toLowerCase();
      if (msg.includes("name")) {
        return {
          error: "A guide with this name already exists. Use the existing profile or invite that account.",
          field: "name",
        };
      }
    }
    return { error: userErr?.message || "Failed to create guide user" };
  }

  const guideUserId = (user as { id: string }).id;
  let profileSlug = generateGuideProfileSlug();

  for (let i = 0; i < 5; i++) {
    const { error: profErr } = await supabase.from("profiles").insert({
      user_id: guideUserId,
      profile_slug: profileSlug,
      bio: input.bio,
      languages: input.languages?.length ? input.languages : ["English"],
      specialties: input.specialties || [],
      destinations: input.destinations || [],
      years_experience: input.yearsExperience,
      tours_completed_estimate: input.toursCompletedEstimate,
      experience_tier_declared: input.experienceTierDeclared,
      crisis_handling_example: input.crisisHandlingExample,
      local_expertise_highlight: input.localExpertiseHighlight,
      pre_tour_preparation: input.preTourPreparation,
      client_fit_description: input.clientFitDescription,
      profile_picture_path: input.profilePicturePath,
      intro_video_path: input.introVideoPath,
      intro_video_url: input.introVideoUrl,
      available_for_video_call: input.availableForVideoCall,
      daily_rate_amount: input.dailyRateAmount,
      daily_rate_currency: input.dailyRateCurrency || "JPY",
      guide_profile_status: input.guideProfileStatus || "draft",
      certification_status: input.certificationStatus || "pending",
      marketplace_available: true,
      country: input.country,
      city: input.city,
      guide_availability_calendar:
        input.availabilityCalendar ?? serializeAvailabilityCalendar([], false),
    });

    if (!profErr) break;
    if (profErr.code === "23505" && String(profErr.message).includes("profile_slug")) {
      profileSlug = generateGuideProfileSlug();
      continue;
    }
    await supabase.from("users").delete().eq("id", guideUserId);
    return { error: profErr.message };
  }

  const { error: rosterErr } = await supabase.from("operator_roster").insert({
    operator_id: operatorId,
    guide_id: guideUserId,
  });
  if (rosterErr && rosterErr.code !== "23505") {
    console.error("[createManagedGuide] roster insert", rosterErr);
  }

  await supabase.from("guide_commission_settings").insert({
    user_id: guideUserId,
    commission_marketplace_pct: 25,
    commission_agent_pct: 15,
    vat_rate_pct: 0,
  });

  return { guideUserId, profileSlug };
}

export async function updateManagedGuideProfile(
  supabase: SupabaseClient,
  guideUserId: string,
  input: Partial<ManagedGuideProfileInput>
): Promise<{ error?: string }> {
  const userPatch: Record<string, unknown> = {};
  if (input.firstName) userPatch.first_name = input.firstName;
  if (input.lastName !== undefined) userPatch.last_name = input.lastName;
  if (input.country !== undefined) userPatch.country = input.country;
  if (input.city !== undefined) userPatch.city = input.city;

  if (input.firstName || input.lastName !== undefined) {
    // Keep multi-register key in sync when operator/guide edits the name.
    const { data: current } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", guideUserId)
      .maybeSingle();
    const first = String(input.firstName ?? current?.first_name ?? "");
    const last = String(
      input.lastName !== undefined ? input.lastName : current?.last_name ?? ""
    );
    const existingByName = await findUserByNormalizedName(supabase, first, last, {
      excludeUserId: guideUserId,
      role: "guide",
    });
    if (existingByName) {
      return {
        error:
          "A guide with this name already exists. Please use a different name or the existing account.",
      };
    }
    const normalizedName = normalizeFullName(first, last);
    userPatch.name_normalized = isUsableNormalizedName(normalizedName)
      ? normalizedName
      : null;
  }

  if (Object.keys(userPatch).length > 0) {
    const { error } = await supabase.from("users").update(userPatch).eq("id", guideUserId);
    if (error) {
      if (isUniqueViolation(error) && String(error.message || "").toLowerCase().includes("name")) {
        return {
          error:
            "A guide with this name already exists. Please use a different name or the existing account.",
        };
      }
      return { error: error.message };
    }
  }

  const profilePatch = buildMarketplaceProfilePatch(input);

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(profilePatch)
      .eq("user_id", guideUserId);
    if (error) return { error: error.message };
  }

  return {};
}

/** Build §3.3 validation input from DB rows (publish / profile checks). */
export function marketplaceInputFromProfileRows(
  user: { first_name?: string | null; last_name?: string | null },
  prof: Record<string, unknown>
): ManagedGuideProfileInput {
  return {
    firstName: String(user.first_name || ""),
    lastName: String(user.last_name || ""),
    bio: (prof.bio as string) || null,
    languages: (prof.languages as string[]) || [],
    yearsExperience: prof.years_experience as number | null,
    toursCompletedEstimate: prof.tours_completed_estimate as number | null,
    experienceTierDeclared: prof.experience_tier_declared as number | null,
    crisisHandlingExample: prof.crisis_handling_example as string | null,
    localExpertiseHighlight: prof.local_expertise_highlight as string | null,
    preTourPreparation: prof.pre_tour_preparation as string | null,
    clientFitDescription: prof.client_fit_description as string | null,
    profilePicturePath: prof.profile_picture_path as string | null,
    introVideoPath: prof.intro_video_path as string | null,
    introVideoUrl: prof.intro_video_url as string | null,
    availableForVideoCall:
      prof.available_for_video_call === true
        ? true
        : prof.available_for_video_call === false
          ? false
          : null,
    dailyRateAmount:
      prof.daily_rate_amount != null ? Number(prof.daily_rate_amount) : null,
    dailyRateCurrency: (prof.daily_rate_currency as string) || "JPY",
  };
}
