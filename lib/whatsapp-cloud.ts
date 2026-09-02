import crypto from 'crypto'

const GRAPH_VERSION = 'v21.0'

export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  )
}

export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim()
  if (!secret || !signatureHeader?.startsWith('sha256=')) return false
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  try {
    const a = Buffer.from(signatureHeader)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function sendWhatsAppTextMessage(
  toDigits: string,
  body: string
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp not configured' }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`
  const textBody = body.slice(0, 4096)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { preview_url: false, body: textBody },
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string }
  }

  if (!res.ok) {
    const err = json?.error?.message || res.statusText
    return { ok: false, error: err }
  }

  const mid = json?.messages?.[0]?.id
  return { ok: true, messageId: mid }
}
