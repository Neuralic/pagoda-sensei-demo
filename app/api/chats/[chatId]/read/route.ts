import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const jar = await cookies()
    const meId = jar.get('userId')?.value
    if (!meId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { chatId } = await context.params
    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(meId, supabase)
    if (activityBlock) return activityBlock

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('chat_participants')
      .upsert({ chat_id: chatId, user_id: meId, last_read_at: nowIso }, { onConflict: 'chat_id,user_id' })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
