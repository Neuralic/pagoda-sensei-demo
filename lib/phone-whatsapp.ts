/**
 * Normalize stored phone numbers to digits-only format expected by WhatsApp Cloud API `to` field (no +).
 */
export function digitsForWhatsAppApi(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null
  const d = input.replace(/\D/g, '')
  if (d.length < 10 || d.length > 15) return null
  return d
}
