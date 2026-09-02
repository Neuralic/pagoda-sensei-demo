import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'

export const dynamic = 'force-dynamic'

function minIso(a: string, b: string): string {
  return a <= b ? a : b
}

// Returns total unread and per-chat unread counts for the current user
export async function GET() {
  try {
    const jar = await cookies()
    const meId = jar.get('userId')?.value
    if (!meId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(meId, supabase)
    if (activityBlock) return activityBlock

    // Get all chats the user participates in with last_read_at
    const { data: participants, error: pErr } = await supabase
      .from('chat_participants')
      .select('chat_id, last_read_at')
      .eq('user_id', meId)

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })
    }

    const perChat: Record<string, number> = {}
    const lastReadAt: Record<string, string | null> = {}

    const withReadAt: Array<{ chatId: string; lastReadAt: string }> = []
    const withoutReadAt: string[] = []
    const chatIds: string[] = []

    for (const row of participants || []) {
      const chatId = String((row as { chat_id?: string }).chat_id || '').trim()
      if (!chatId) continue
      const lr = (row as { last_read_at?: string | null }).last_read_at ?? null
      chatIds.push(chatId)
      lastReadAt[chatId] = lr
      if (lr) withReadAt.push({ chatId, lastReadAt: lr })
      else withoutReadAt.push(chatId)
    }

    // Batched fetch for chats that have last_read_at
    if (withReadAt.length > 0) {
      let earliest = withReadAt[0]!.lastReadAt
      for (let i = 1; i < withReadAt.length; i++) earliest = minIso(earliest, withReadAt[i]!.lastReadAt)

      const { data: msgs, error: mErr } = await supabase
        .from('chat_messages')
        .select('chat_id, sender_id, created_at')
        .in('chat_id', withReadAt.map((x) => x.chatId))
        .neq('sender_id', meId)
        .gt('created_at', earliest)
        .order('created_at', { ascending: true })
        .limit(5000)

      if (!mErr && Array.isArray(msgs)) {
        for (const m of msgs as Array<{ chat_id?: string; created_at?: string }>) {
          const c = m.chat_id
          const createdAt = m.created_at
          if (!c || !createdAt) continue
          const lr = lastReadAt[c]
          if (lr && createdAt > lr) {
            perChat[c] = (perChat[c] || 0) + 1
          }
        }
      }
    }

    // Small subset fallback: null last_read_at counts in parallel
    if (withoutReadAt.length > 0) {
      const counts = await Promise.all(
        withoutReadAt.map(async (chatId) => {
          const { count, error } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('sender_id', meId)
          return { chatId, count: error ? 0 : (typeof count === 'number' ? count : 0) }
        })
      )
      for (const r of counts) perChat[r.chatId] = (perChat[r.chatId] || 0) + r.count
    }

    // Stabilize output map + compute total
    let total = 0
    for (const chatId of chatIds) {
      if (!(chatId in perChat)) perChat[chatId] = 0
      total += perChat[chatId] || 0
    }

    return NextResponse.json({ ok: true, total, perChat, lastReadAt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
