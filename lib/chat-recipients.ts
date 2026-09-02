/**
 * Pure helpers for deciding who a chat notification goes to.
 *
 * Separate from `lib/chat-sender-identity.ts` so guard scripts can exercise it directly —
 * that module reaches for cookies and Supabase, this one is arithmetic on strings.
 */

/**
 * Recipients minus the sender.
 *
 * An admin writing into a support thread was part of the admin fan-out and got their own
 * message back by email. Applied to every list we notify, not just that one path.
 */
export function excludeSelfFromRecipients(
  recipients: string[],
  senderEmail: string | null | undefined
): string[] {
  const self = String(senderEmail || "").trim().toLowerCase();
  if (!self) return recipients;
  return recipients.filter((r) => String(r || "").trim().toLowerCase() !== self);
}
