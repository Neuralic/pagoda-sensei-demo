/** Max age of a heartbeat before we treat the user as offline (closed tab, sleep, network loss). */
export const PRESENCE_STALE_MS = 90_000;

export type PresenceDisplay = 'online' | 'idle' | 'offline';

/**
 * Derive display status from stored row. Stale timestamps always read as offline.
 */
export function derivePresenceDisplay(
  presenceState: string | null | undefined,
  presenceUpdatedAt: string | null | undefined
): PresenceDisplay {
  if (!presenceUpdatedAt) return 'offline';
  const t = new Date(presenceUpdatedAt).getTime();
  if (Number.isNaN(t)) return 'offline';
  if (Date.now() - t > PRESENCE_STALE_MS) return 'offline';
  if (presenceState === 'online' || presenceState === 'idle') return presenceState;
  if (presenceState === 'offline') return 'offline';
  return 'offline';
}
