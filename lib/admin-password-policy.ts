/**
 * Rules for admin-initiated password reset (agent/guide).
 * Unicode-aware so common keyboard layouts and symbols still qualify.
 */
export function passwordMeetsAdminResetPolicy(pwd: string): boolean {
  if (pwd.length < 8 || pwd.length > 200) return false;
  if (!/\p{Ll}/u.test(pwd)) return false;
  if (!/\p{Lu}/u.test(pwd)) return false;
  if (!/\p{N}/u.test(pwd)) return false;
  if (!/[^\p{L}\p{N}]/u.test(pwd)) return false;
  return true;
}

export const ADMIN_PASSWORD_POLICY_HINT =
  "Use 8–200 characters with a lowercase letter, an uppercase letter, a number, and a symbol (any punctuation or space counts as a symbol).";
