import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { assertUserCanAccessChat } from '@/lib/chat-access'
import { resolveSupportChatOtherParticipant, PAGODA_SUPPORT_PEER_ID } from '@/lib/itinerary-support-chat'

export const dynamic = 'force-dynamic'

// Next.js 15 route handler signature expects params as a Promise
export async function GET(_req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const jar = await cookies()
    const meId = jar.get('userId')?.value
    if (!meId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { chatId } = await context.params
    const supabase = getSupabaseServer()
    const role = jar.get('role')?.value
    if (role !== 'admin') {
      const activityBlock = await denyIfActivityNotApproved(meId, supabase)
      if (activityBlock) return activityBlock
    }

    const access = await assertUserCanAccessChat(supabase, chatId, meId, { role })
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status })
    }
    const chat = access.chat

    const agencyId = chat.agency_id as string
    const guideId = (chat.guide_id as string | null) || ''

    const ids = [agencyId, guideId].filter(Boolean)
    const { data: users } = ids.length
      ? await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', ids)
      : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> }

    type UserRow = { id: string; first_name: string | null; last_name: string | null; email: string | null }
    const usersById: Record<string, UserRow> = {}
    for (const u of (users || []) as UserRow[]) usersById[u.id] = u

    const { data: profiles } = ids.length
      ? await supabase
          .from('profiles')
          .select('id, user_id, profile_picture_path')
          .in('user_id', ids)
      : { data: [] as Array<{ id: string; user_id: string; profile_picture_path: string | null }> }

    type ProfileRow = { id: string; user_id: string; profile_picture_path: string | null }
    const profileByUserId: Record<string, ProfileRow> = {}
    for (const p of (profiles || []) as ProfileRow[]) profileByUserId[p.user_id] = p

    async function buildPerson(userId: string) {
      if (!userId) {
        return { id: '', name: 'User', email: null as string | null, avatarUrl: null as string | null }
      }
      const u = usersById[userId]
      const p = profileByUserId[userId]
      const name = `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || 'User'
      let avatarUrl: string | null = null
      const path = p?.profile_picture_path as string | undefined
      if (path && typeof path === 'string' && !path.startsWith('http')) {
        try {
          const { data: signed } = await supabase.storage
            .from(BUCKETS.avatars)
            .createSignedUrl(path, 60 * 60 * 24 * 7)
          avatarUrl = signed?.signedUrl || null
        } catch {
          const { data: pub } = supabase.storage.from(BUCKETS.avatars).getPublicUrl(path)
          avatarUrl = pub?.publicUrl || null
        }
      } else if (path && path.startsWith('http')) {
        avatarUrl = path
      }
      return { id: userId, name, email: u?.email || null, avatarUrl }
    }

    const [me, agent, guide] = await Promise.all([
      buildPerson(meId),
      buildPerson(agencyId),
      buildPerson(guideId),
    ])

    function buildPersonSync(userId: string) {
      if (!userId) {
        return { id: '', name: 'User', email: null as string | null, avatarUrl: null as string | null }
      }
      const u = usersById[userId]
      const name = `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || 'User'
      return { id: userId, name, email: u?.email || null, avatarUrl: null as string | null }
    }

    const otherBase = resolveSupportChatOtherParticipant(
      chat,
      meId,
      role,
      buildPersonSync
    )
    const other =
      otherBase.id === PAGODA_SUPPORT_PEER_ID
        ? otherBase
        : otherBase.id === agencyId
          ? agent
          : otherBase.id === guideId
            ? guide
            : otherBase

    const clientName = chat.client_name
      ? String(chat.client_name).trim() || null
      : null

    return NextResponse.json({
      ok: true,
      chat: {
        id: chat.id,
        jobId: chat.job_id ?? null,
        applicationId: chat.application_id ?? null,
        clientName: clientName || null,
        chatKind: chat.chat_kind || 'marketplace',
      },
      me,
      agent,
      guide,
      other,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
