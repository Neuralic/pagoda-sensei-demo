/**
 * Shared role checks for platform-wide admin overall access.
 * Admins can view and edit advisor/guide resources without impersonation.
 */

export function isPlatformAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}

export function canActAsAgent(role: string | undefined | null): boolean {
  return role === "agent" || role === "agency" || role === "admin";
}

export function canActAsGuide(role: string | undefined | null): boolean {
  return role === "guide" || role === "admin";
}

/** Admins bypass per-user ownership checks on jobs, itineraries, tours, chats, etc. */
export function bypassesResourceOwnership(role: string | undefined | null): boolean {
  return role === "admin";
}
