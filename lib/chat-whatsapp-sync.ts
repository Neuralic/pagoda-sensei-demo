import { getSupabaseServer } from '@/lib/supabaseServer'
import { digitsForWhatsAppApi } from '@/lib/phone-whatsapp'
import { isWhatsAppCloudConfigured, sendWhatsAppTextMessage } from '@/lib/whatsapp-cloud'

/**
 * After a message is saved in-app, optionally mirror plain text to the recipient's WhatsApp
 * when they opted in and have a usable phone on file.
 */
export async function mirrorOutboundChatMessageToWhatsApp(params: {
  chatId: string
  senderId: string
  recipientId: string
  text: string
  filePath: string | null | undefined
}): Promise<void> {
  const { chatId, senderId, recipientId, text, filePath } = params
  if (!isWhatsAppCloudConfigured()) return
  if (filePath || !text.trim()) return

  const supabase = getSupabaseServer()
  const { data: recipient, error: rErr } = await supabase
    .from('users')
    .select('id, phone, whatsapp_sync_enabled')
    .eq('id', recipientId)
    .maybeSingle()

  if (rErr || !recipient?.whatsapp_sync_enabled) return

  const to = digitsForWhatsAppApi(recipient.phone as string | null)
  if (!to) return

  const { data: sender } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('id', senderId)
    .maybeSingle()

  const name =
    [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || 'Pagoda'
  const prefixed = `*${name}* (via Pagoda):\n${text}`.slice(0, 4096)

  const result = await sendWhatsAppTextMessage(to, prefixed)
  if (!result.ok) {
    console.error('[whatsapp mirror] send failed', result.error, { chatId, recipientId })
  }
}

/** Remember which thread the user is in so inbound WhatsApp replies land in the right chat. */
export async function setUserWhatsAppRoutingChat(
  userId: string,
  chatId: string | null
): Promise<void> {
  const supabase = getSupabaseServer()
  await supabase.from('users').update({ whatsapp_last_chat_id: chatId }).eq('id', userId)
}

export async function findUserIdByWhatsAppFrom(from: string): Promise<string | null> {
  const supabase = getSupabaseServer()

  const { data: byWa } = await supabase
    .from('users')
    .select('id')
    .eq('whatsapp_wa_id', from)
    .maybeSingle()
  if (byWa?.id) return byWa.id as string

  const { data: users } = await supabase.from('users').select('id, phone').not('phone', 'is', null)

  for (const u of users || []) {
    const row = u as { id: string; phone?: string | null }
    const d = digitsForWhatsAppApi(row.phone)
    if (d === from) return row.id
  }
  return null
}
