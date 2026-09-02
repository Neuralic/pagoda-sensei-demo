import type { SupabaseClient } from "@supabase/supabase-js";

export type ExistingUserMatch = {
  id: string;
  email: string;
  phone: string | null;
  is_verified: boolean | null;
  role: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type RegistrationConflictField = "email" | "phone" | "name";

export type IdentityLookupOpts = {
  excludeUserId?: string;
  /** When set, only match users with this role (allows agent+guide dual accounts). */
  role?: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only — used to detect duplicate phone numbers across formats. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isUsableNormalizedPhone(normalized: string): boolean {
  return normalized.length >= 8;
}

/** Case-insensitive full name key: "first last" with collapsed whitespace. */
export function normalizeFullName(firstName: string, lastName: string): string {
  return `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsableNormalizedName(normalized: string): boolean {
  return normalized.length >= 3 && normalized.includes(" ");
}

export async function findUsersByEmail(
  supabase: SupabaseClient,
  email: string,
  opts?: IdentityLookupOpts
): Promise<ExistingUserMatch[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  let query = supabase
    .from("users")
    .select("id, email, phone, is_verified, role, first_name, last_name")
    .ilike("email", normalized);

  if (opts?.role) {
    query = query.eq("role", opts.role);
  }
  if (opts?.excludeUserId) {
    query = query.neq("id", opts.excludeUserId);
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error("[register-identity] findUsersByEmail", error);
    throw new Error("Database error.");
  }

  return (data ?? []) as ExistingUserMatch[];
}

/**
 * Find a user by email. Pass `role` when agent+guide may share an email
 * (dual accounts). Without role, prefers an unverified row if present.
 */
export async function findUserByEmail(
  supabase: SupabaseClient,
  email: string,
  opts?: IdentityLookupOpts & { preferUnverified?: boolean }
): Promise<ExistingUserMatch | null> {
  const rows = await findUsersByEmail(supabase, email, opts);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  if (opts?.preferUnverified) {
    return rows.find((r) => !r.is_verified) ?? rows[0];
  }
  return rows[0];
}

export async function findUserByNormalizedPhone(
  supabase: SupabaseClient,
  phone: string,
  excludeUserIdOrOpts?: string | IdentityLookupOpts
): Promise<ExistingUserMatch | null> {
  const opts: IdentityLookupOpts =
    typeof excludeUserIdOrOpts === "string"
      ? { excludeUserId: excludeUserIdOrOpts }
      : excludeUserIdOrOpts ?? {};
  const normalized = normalizePhone(phone);
  if (!isUsableNormalizedPhone(normalized)) return null;

  let query = supabase
    .from("users")
    .select("id, email, phone, is_verified, role, first_name, last_name, phone_normalized")
    .eq("phone_normalized", normalized);

  if (opts.role) {
    query = query.eq("role", opts.role);
  }
  if (opts.excludeUserId) {
    query = query.neq("id", opts.excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    // Column may not exist until migration is applied — fall back to scan.
    if (String(error.message || "").includes("phone_normalized")) {
      return findUserByNormalizedPhoneFallback(supabase, normalized, opts);
    }
    // Multiple rows without unique index yet
    if (String(error.code || "") === "PGRST116" || String(error.message || "").includes("multiple")) {
      return findUserByNormalizedPhoneFallback(supabase, normalized, opts);
    }
    console.error("[register-identity] findUserByNormalizedPhone", error);
    throw new Error("Database error.");
  }

  if (!data) return null;
  const { phone_normalized: _pn, ...user } = data as ExistingUserMatch & {
    phone_normalized?: string | null;
  };
  return user;
}

async function findUserByNormalizedPhoneFallback(
  supabase: SupabaseClient,
  normalized: string,
  opts: IdentityLookupOpts
): Promise<ExistingUserMatch | null> {
  let query = supabase
    .from("users")
    .select("id, email, phone, is_verified, role, first_name, last_name")
    .not("phone", "is", null);

  if (opts.role) {
    query = query.eq("role", opts.role);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[register-identity] phone fallback", error);
    throw new Error("Database error.");
  }

  for (const row of data ?? []) {
    if (opts.excludeUserId && row.id === opts.excludeUserId) continue;
    if (opts.role && String(row.role ?? "") !== opts.role) continue;
    if (normalizePhone(String(row.phone ?? "")) === normalized) {
      return row as ExistingUserMatch;
    }
  }
  return null;
}

export async function findUserByNormalizedName(
  supabase: SupabaseClient,
  firstName: string,
  lastName: string,
  excludeUserIdOrOpts?: string | IdentityLookupOpts
): Promise<ExistingUserMatch | null> {
  const opts: IdentityLookupOpts =
    typeof excludeUserIdOrOpts === "string"
      ? { excludeUserId: excludeUserIdOrOpts }
      : excludeUserIdOrOpts ?? {};
  const normalized = normalizeFullName(firstName, lastName);
  if (!isUsableNormalizedName(normalized)) return null;

  let query = supabase
    .from("users")
    .select("id, email, phone, is_verified, role, first_name, last_name, name_normalized")
    .eq("name_normalized", normalized);

  if (opts.role) {
    query = query.eq("role", opts.role);
  }
  if (opts.excludeUserId) {
    query = query.neq("id", opts.excludeUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (String(error.message || "").includes("name_normalized")) {
      return findUserByNormalizedNameFallback(supabase, normalized, opts);
    }
    if (String(error.code || "") === "PGRST116" || String(error.message || "").includes("multiple")) {
      return findUserByNormalizedNameFallback(supabase, normalized, opts);
    }
    console.error("[register-identity] findUserByNormalizedName", error);
    throw new Error("Database error.");
  }

  if (data) {
    const { name_normalized: _nn, ...user } = data as ExistingUserMatch & {
      name_normalized?: string | null;
    };
    return user;
  }

  // Older rows / managed stubs may lack name_normalized — still match on first+last.
  return findUserByNormalizedNameFallback(supabase, normalized, opts);
}

async function findUserByNormalizedNameFallback(
  supabase: SupabaseClient,
  normalized: string,
  opts: IdentityLookupOpts
): Promise<ExistingUserMatch | null> {
  let query = supabase
    .from("users")
    .select("id, email, phone, is_verified, role, first_name, last_name");

  if (opts.role) {
    query = query.eq("role", opts.role);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[register-identity] name fallback", error);
    throw new Error("Database error.");
  }

  for (const row of data ?? []) {
    if (opts.excludeUserId && row.id === opts.excludeUserId) continue;
    if (opts.role && String(row.role ?? "") !== opts.role) continue;
    if (
      normalizeFullName(String(row.first_name ?? ""), String(row.last_name ?? "")) ===
      normalized
    ) {
      return row as ExistingUserMatch;
    }
  }
  return null;
}

export function registrationConflictMessage(
  match: ExistingUserMatch,
  field: RegistrationConflictField = "phone"
): { error: string; needsVerification: boolean } {
  const roleLabel =
    match.role === "guide"
      ? "guide"
      : match.role === "agent" || match.role === "agency"
        ? "travel advisor"
        : "user";
  const loginHint = match.is_verified
    ? "Please log in with your existing account."
    : "This account is awaiting email verification — check your inbox or use resend on the verify page.";

  if (field === "email") {
    return {
      error: `An account with this email already exists. ${loginHint}`,
      needsVerification: !match.is_verified,
    };
  }

  if (field === "name") {
    return {
      error: `A ${roleLabel} account with this name already exists. Use your existing account, or log in instead. ${loginHint}`,
      needsVerification: !match.is_verified,
    };
  }

  return {
    error: `A ${roleLabel} account with this phone number already exists. Use a different phone, or log in instead. ${loginHint}`,
    needsVerification: !match.is_verified,
  };
}

export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  return err?.code === "23505";
}
