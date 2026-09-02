/** Email verification code lifetime (extended so users can finish profile setup). */
export const VERIFICATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export function verificationCodeExpiresAt(now = Date.now()): string {
  return new Date(now + VERIFICATION_CODE_TTL_MS).toISOString();
}

export const VERIFICATION_CODE_TTL_HOURS = VERIFICATION_CODE_TTL_MS / (60 * 60 * 1000);
