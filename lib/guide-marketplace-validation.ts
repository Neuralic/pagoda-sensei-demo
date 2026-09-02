import type { ManagedGuideProfileInput } from "@/lib/managed-guide-profile";

const MAX_BIO_CHARS = 6000;
const MAX_TEXT_FIELD = 500;
export type GuideProfileValidationResult = { ok: true } | { ok: false; error: string; field?: string };

export const VIDEO_CALL_AVAILABILITY_QUESTION =
  "Are you available for a video call with the travel advisor?";

const CERT_FIELD_LABELS: Record<string, string> = {
  crisisHandlingExample: "Crisis handling example",
  localExpertiseHighlight: "Local expertise highlight",
  preTourPreparation: "Pre-tour preparation",
  clientFitDescription: "Client fit description",
};

/** §3.3 required fields — used before save/publish (not for invite-only stub). */
export function validateGuideMarketplaceProfile(
  input: Partial<ManagedGuideProfileInput>,
  opts?: { requireMedia?: boolean }
): GuideProfileValidationResult {
  const requireMedia = opts?.requireMedia !== false;

  if (!input.firstName?.trim()) {
    return { ok: false, error: "Full name is required" };
  }
  if (requireMedia && !input.profilePicturePath) {
    return { ok: false, error: "Profile photo is required (min 400×400px)" };
  }
  if (input.availableForVideoCall == null) {
    return {
      ok: false,
      error: `${VIDEO_CALL_AVAILABILITY_QUESTION} (Yes or No required)`,
      field: "availableForVideoCall",
    };
  }
  if (!input.languages?.length) {
    return { ok: false, error: "At least one language is required" };
  }
  if (input.yearsExperience == null || input.yearsExperience < 0) {
    return { ok: false, error: "Years of experience is required" };
  }
  if (input.toursCompletedEstimate == null || input.toursCompletedEstimate < 0) {
    return { ok: false, error: "Estimated tours completed is required" };
  }
  if (!input.bio?.trim()) {
    return { ok: false, error: "Short bio is required" };
  }
  if (input.bio.length > MAX_BIO_CHARS) {
    return { ok: false, error: "Bio must be under 1,000 words" };
  }
  if (!input.crisisHandlingExample?.trim()) {
    return {
      ok: false,
      error: `${CERT_FIELD_LABELS.crisisHandlingExample} is required`,
      field: "crisisHandlingExample",
    };
  }
  if ((input.crisisHandlingExample?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Crisis handling example must be 500 characters or less" };
  }
  if (!input.localExpertiseHighlight?.trim()) {
    return {
      ok: false,
      error: `${CERT_FIELD_LABELS.localExpertiseHighlight} is required`,
      field: "localExpertiseHighlight",
    };
  }
  if ((input.localExpertiseHighlight?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Local expertise highlight must be 500 characters or less" };
  }
  if (!input.preTourPreparation?.trim()) {
    return {
      ok: false,
      error: `${CERT_FIELD_LABELS.preTourPreparation} is required`,
      field: "preTourPreparation",
    };
  }
  if ((input.preTourPreparation?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Pre-tour preparation must be 500 characters or less" };
  }
  if (!input.clientFitDescription?.trim()) {
    return {
      ok: false,
      error: `${CERT_FIELD_LABELS.clientFitDescription} is required`,
      field: "clientFitDescription",
    };
  }
  if ((input.clientFitDescription?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Client fit description must be 500 characters or less" };
  }
  if (
    input.experienceTierDeclared == null ||
    input.experienceTierDeclared < 1 ||
    input.experienceTierDeclared > 3
  ) {
    return { ok: false, error: "Experience tier is required", field: "experienceTierDeclared" };
  }
  return { ok: true };
}

/** Draft save — only enforce max lengths on fields that are filled in. */
export function validateGuideProfileDraft(
  input: Partial<ManagedGuideProfileInput>
): GuideProfileValidationResult {
  if (input.bio && input.bio.length > MAX_BIO_CHARS) {
    return { ok: false, error: "Bio must be under 1,000 words" };
  }
  if ((input.crisisHandlingExample?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Crisis handling example must be 500 characters or less" };
  }
  if ((input.localExpertiseHighlight?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Local expertise highlight must be 500 characters or less" };
  }
  if ((input.preTourPreparation?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Pre-tour preparation must be 500 characters or less" };
  }
  if ((input.clientFitDescription?.length ?? 0) > MAX_TEXT_FIELD) {
    return { ok: false, error: "Client fit description must be 500 characters or less" };
  }
  return { ok: true };
}

export function parseOptionalExperienceTier(value: string): number | null {
  const n = parseInt(value, 10);
  return n >= 1 && n <= 3 ? n : null;
}

/** Client-side / operator form — same rules as server, with scroll target id. */
export function validateGuideFormValues(form: {
  fullName: string;
  bio: string;
  languages: string[];
  yearsExperience: string;
  toursCompletedEstimate: string;
  experienceTierDeclared: string;
  crisisHandlingExample: string;
  localExpertiseHighlight: string;
  preTourPreparation: string;
  clientFitDescription: string;
  availableForVideoCall: boolean | null;
  profilePicturePath: string;
  introVideoPath: string;
  introVideoUrl: string;
}): GuideProfileValidationResult {
  const [firstName, ...rest] = form.fullName.trim().split(/\s+/);
  return validateGuideMarketplaceProfile({
    firstName: firstName || "",
    lastName: rest.join(" "),
    bio: form.bio,
    languages: form.languages,
    yearsExperience: form.yearsExperience ? parseInt(form.yearsExperience, 10) : null,
    toursCompletedEstimate: form.toursCompletedEstimate
      ? parseInt(form.toursCompletedEstimate, 10)
      : null,
    experienceTierDeclared: parseInt(form.experienceTierDeclared, 10),
    crisisHandlingExample: form.crisisHandlingExample,
    localExpertiseHighlight: form.localExpertiseHighlight,
    preTourPreparation: form.preTourPreparation,
    clientFitDescription: form.clientFitDescription,
    availableForVideoCall: form.availableForVideoCall,
    profilePicturePath: form.profilePicturePath || null,
    introVideoPath: form.introVideoPath || null,
    introVideoUrl: form.introVideoUrl || null,
  });
}

/** Operator managed-guide form — relaxed rules for draft save. */
export function validateGuideFormValuesForDraft(form: {
  fullName: string;
  bio: string;
  crisisHandlingExample: string;
  localExpertiseHighlight: string;
  preTourPreparation: string;
  clientFitDescription: string;
}): GuideProfileValidationResult {
  const [firstName, ...rest] = form.fullName.trim().split(/\s+/);
  return validateGuideProfileDraft({
    firstName: firstName || "",
    lastName: rest.join(" "),
    bio: form.bio,
    crisisHandlingExample: form.crisisHandlingExample,
    localExpertiseHighlight: form.localExpertiseHighlight,
    preTourPreparation: form.preTourPreparation,
    clientFitDescription: form.clientFitDescription,
  });
}

/** Settings marketplace form — relaxed rules for draft save. */
export function validateGuideSettingsFormForDraft(form: {
  bio: string;
  crisisHandlingExample: string;
  localExpertiseHighlight: string;
  preTourPreparation: string;
  clientFitDescription: string;
}): GuideProfileValidationResult {
  return validateGuideProfileDraft({
    bio: form.bio,
    crisisHandlingExample: form.crisisHandlingExample,
    localExpertiseHighlight: form.localExpertiseHighlight,
    preTourPreparation: form.preTourPreparation,
    clientFitDescription: form.clientFitDescription,
  });
}

export const CERTIFICATION_PROFILE_FIELDS = [
  {
    key: "crisisHandlingExample" as const,
    label: CERT_FIELD_LABELS.crisisHandlingExample,
    hint: "Describe how you handled a difficult situation on tour (max 500 characters).",
  },
  {
    key: "localExpertiseHighlight" as const,
    label: CERT_FIELD_LABELS.localExpertiseHighlight,
    hint: "One thing tourists would not discover without you (max 500 characters).",
  },
  {
    key: "preTourPreparation" as const,
    label: CERT_FIELD_LABELS.preTourPreparation,
    hint: "What you do the day before a tour (max 500 characters).",
  },
  {
    key: "clientFitDescription" as const,
    label: CERT_FIELD_LABELS.clientFitDescription,
    hint: "Who you work best with (max 500 characters).",
  },
];

export async function validateProfileImageDimensions(
  file: File
): Promise<GuideProfileValidationResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Profile photo must be JPG or PNG" };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "Profile photo must be under 15MB" };
  }

  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
    if (dims.w < 400 || dims.h < 400) {
      return { ok: false, error: "Profile photo must be at least 400×400 pixels" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not read profile photo" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function validateIntroVideoFile(file: File): GuideProfileValidationResult {
  const okType =
    file.type.startsWith("video/") ||
    /\.(mp4|mov)$/i.test(file.name);
  if (!okType) {
    return { ok: false, error: "Video must be MP4 or MOV" };
  }
  if (file.size > 500 * 1024 * 1024) {
    return { ok: false, error: "Video must be under 500MB" };
  }
  return { ok: true };
}
