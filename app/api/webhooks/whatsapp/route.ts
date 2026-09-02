import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'
import {
  findUserIdByWhatsAppFrom,
  setUserWhatsAppRoutingChat,
} from '@/lib/chat-whatsapp-sync'
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp-cloud'
import { maskSensitiveChatContent } from '@/lib/chat-message-sanitize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Meta WhatsApp Cloud API webhooks.
 * Configure in Meta Developer Console → WhatsApp → Configuration:
 *   Callback URL: https://<your-domain>/api/webhooks/whatsapp
 *   Verify token: WHATSAPP_VERIFY_TOKEN
 * Subscribe to `messages` (and optionally `message_status` — ignored here).
 *
 * Env:
 *   WHATSAPP_VERIFY_TOKEN   — your chosen verify string
 *   WHATSAPP_APP_SECRET     — app secret (for X-Hub-Signature-256)
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.json({ ok: false }, { status: 403 })
}

type WaTextMessage = {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
}

function collectInboundMessages(body: unknown): WaTextMessage[] {
  const out: WaTextMessage[] = []
  const root = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: WaTextMessage[]
        }
      }>
    }>
  }
  for (const entry of root?.entry || []) {
    for (const change of entry?.changes || []) {
      const messages = change?.value?.messages
      if (!Array.isArray(messages)) continue
      for (const m of messages) {
        if (m?.type === 'text' && m.from && m.id && m.text?.body != null) {
          out.push(m)
        }
      }
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('x-hub-signature-256')

  if (!verifyWhatsAppWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 403 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const inbound = collectInboundMessages(parsed)
  if (inbound.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const supabase = getSupabaseServer()

  for (const m of inbound) {
    const waMessageId = m.id as string
    const from = m.from as string
    const textBody = (m.text?.body || '').trim()
    if (!textBody) continue

    const userId = await findUserIdByWhatsAppFrom(from)
    if (!userId) {
      console.warn('[whatsapp webhook] unknown sender wa_id', from)
      continue
    }

    await supabase.from('users').update({ whatsapp_wa_id: from }).eq('id', userId)

    const { data: urow } = await supabase
      .from('users')
      .select('whatsapp_last_chat_id')
      .eq('id', userId)
      .maybeSingle()

    const chatId = urow?.whatsapp_last_chat_id as string | null
    if (!chatId) {
      console.warn('[whatsapp webhook] no whatsapp_last_chat_id for user', userId)
      continue
    }

    const { data: chat } = await supabase
      .from('chats')
      .select('id, agency_id, guide_id')
      .eq('id', chatId)
      .maybeSingle()

    if (!chat || (chat.agency_id !== userId && chat.guide_id !== userId)) {
      console.warn('[whatsapp webhook] user not a participant in routing chat', userId, chatId)
      await setUserWhatsAppRoutingChat(userId, null)
      continue
    }

    const { error: insErr } = await supabase.from('chat_messages').insert({
      chat_id: chatId,
      sender_id: userId,
      message: maskSensitiveChatContent(textBody),
      message_type: 'text',
      file_path: null,
      source_channel: 'whatsapp',
      whatsapp_message_id: waMessageId,
    })

    if (insErr) {
      if (insErr.code === '23505' || insErr.message?.includes('duplicate')) {
        continue
      }
      console.error('[whatsapp webhook] insert failed', insErr)
    }
  }

  return NextResponse.json({ ok: true, processed: inbound.length })
}
