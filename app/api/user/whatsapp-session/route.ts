import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { setUserWhatsAppRoutingChat } from '@/lib/chat-whatsapp-sync'

export const dynamic = 'force-dynamic'

/** Call when the user focuses a chat so inbound WhatsApp replies route to this thread. */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { chatId?: unknown }
    if (typeof body.chatId !== 'string' || !body.chatId.trim()) {
      return NextResponse.json({ ok: false, error: 'chatId required' }, { status: 400 })
    }

    const chatId = body.chatId.trim()
    const supabase = getSupabaseServer()
    const { data: chat, error: cErr } = await supabase
      .from('chats')
      .select('id, agency_id, guide_id')
      .eq('id', chatId)
      .maybeSingle()

    if (cErr || !chat) {
      return NextResponse.json({ ok: false, error: 'Chat not found' }, { status: 404 })
    }

    if (chat.agency_id !== userId && chat.guide_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    await setUserWhatsAppRoutingChat(userId, chatId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
