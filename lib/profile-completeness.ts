export type ProfileCompleteness = {
  total: number;
  completed: number;
  percent: number; // 0-100
  missingKeys: string[];
  items: Array<{ key: string; label: string; done: boolean }>;
};

type ProfileLike = {
  bio?: string | null;
  profile_picture_path?: string | null;
  languages?: string[] | null;
  intro_video_path?: string | null;
  intro_video_url?: string | null;
  available_for_video_call?: boolean | null;
  destinations?: string[] | null;
  years_experience?: number | null;
  tours_completed_estimate?: number | null;
  experience_tier_declared?: number | null;
  crisis_handling_example?: string | null;
  local_expertise_highlight?: string | null;
  pre_tour_preparation?: string | null;
  client_fit_description?: string | null;
  daily_rate_amount?: number | null;
  guide_profile_status?: string | null;
  marketplace_available?: boolean | null;
  guide_availability_calendar?: unknown;
};

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function computeProfileCompleteness(profile: ProfileLike | null | undefined): ProfileCompleteness {
  const p = profile || {};

  const items: Array<{ key: string; label: string; done: boolean }> = [
    { key: "bio", label: "Bio", done: hasText(p.bio) },
    { key: "profilePhoto", label: "Profile photo", done: Boolean(p.profile_picture_path) },
    {
      key: "languages",
      label: "Languages",
      done: Array.isArray(p.languages) && p.languages.filter(Boolean).length > 0,
    },
    {
      key: "videoCallAvailability",
      label: "Video call availability",
      done: p.available_for_video_call === true || p.available_for_video_call === false,
    },
    {
      key: "destinations",
      label: "Destinations",
      done: Array.isArray(p.destinations) && p.destinations.filter(Boolean).length > 0,
    },
    {
      key: "experience",
      label: "Years of experience",
      done: typeof p.years_experience === "number" ? p.years_experience >= 0 : false,
    },
    {
      key: "toursCompleted",
      label: "Estimated tours completed",
      done:
        typeof p.tours_completed_estimate === "number" ? p.tours_completed_estimate >= 0 : false,
    },
    {
      key: "experienceTier",
      label: "Experience tier (self-declared)",
      done:
        typeof p.experience_tier_declared === "number" &&
        p.experience_tier_declared >= 1 &&
        p.experience_tier_declared <= 3,
    },
    {
      key: "certificationProfile",
      label: "Certification profile (4 sections)",
      done:
        hasText(p.crisis_handling_example) &&
        hasText(p.local_expertise_highlight) &&
        hasText(p.pre_tour_preparation) &&
        hasText(p.client_fit_description),
    },
    {
      key: "availabilityCalendar",
      label: "Availability calendar (before first booking)",
      done: (() => {
        const cal = p.guide_availability_calendar as { updatedAt?: string | null } | null;
        return Boolean(cal && typeof cal === "object" && cal.updatedAt);
      })(),
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const missingKeys = items.filter((i) => !i.done).map((i) => i.key);

  return { total, completed, percent, missingKeys, items };
}

