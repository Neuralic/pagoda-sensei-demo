import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthCookieClearOptions } from '@/lib/auth-session-cookies'
import { supabase } from '@/lib/supabase'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { broadcastUserPresenceUpdate } from '@/lib/admin-presence-broadcast'
import { canPerformFullActivity } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { isImpersonating } from '@/lib/admin-impersonation'

export const dynamic = 'force-dynamic'

type BootstrapUser = {
  id: string
  name: string
  lastName?: string
  email: string
  role?: string
  guideNumber?: string
  country?: string
  city?: string
  guideApproved?: boolean
  isOperator?: boolean
  isManagedGuide?: boolean
  managedByOperatorName?: string | null
  avatar?: string
}

type BootstrapImpersonation = {
  active: true
  adminId: string
  targetName: string
  targetEmail: string | null
  targetRole: string | null
}

function clearAuthCookies(res: NextResponse) {
  const clearOpts = getAuthCookieClearOptions(process.env.NODE_ENV === 'production')
  res.cookies.set('session', '', clearOpts)
  res.cookies.set('role', '', clearOpts)
  res.cookies.set('userId', '', clearOpts)
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b
}

export async function GET() {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    const roleFromCookie = jar.get('role')?.value

    if (!userId) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    // Admin sessions use the admin table — not users (fixes missing header / bootstrap on /admin/*)
    if (roleFromCookie === 'admin') {
      const supabaseServer = getSupabaseServer()
      const { data: admin, error: adminErr } = await supabaseServer
        .from('admin')
        .select('id, first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle()

      if (adminErr || !admin) {
        return NextResponse.json({ ok: false, user: null }, { status: 401 })
      }

      const normalizedAdmin: BootstrapUser = {
        id: admin.id,
        name: admin.first_name || 'Admin',
        lastName: admin.last_name || undefined,
        email: admin.email,
        role: 'admin',
        guideApproved: true,
        isOperator: false,
      }

      // Itinerary support chats — load unread via chat_participants
      const { data: participants } = await supabaseServer
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', userId)

      const chatIds: string[] = []
      const lastReadAt: Record<string, string | null> = {}
      const withReadAt: Array<{ chatId: string; lastReadAt: string }> = []
      const withoutReadAt: string[] = []

      for (const row of participants || []) {
        const chatId = String((row as { chat_id?: string }).chat_id || '').trim()
        if (!chatId) continue
        const lr = (row as { last_read_at?: string | null }).last_read_at ?? null
        chatIds.push(chatId)
        lastReadAt[chatId] = lr
        if (lr) withReadAt.push({ chatId, lastReadAt: lr })
        else withoutReadAt.push(chatId)
      }

      const perChat: Record<string, number> = {}
      let total = 0

      if (withReadAt.length > 0) {
        let earliest = withReadAt[0]!.lastReadAt
        for (let i = 1; i < withReadAt.length; i++) earliest = minIso(earliest, withReadAt[i]!.lastReadAt)
        const { data: msgs } = await supabaseServer
          .from('chat_messages')
          .select('chat_id, sender_id, created_at')
          .in('chat_id', withReadAt.map((x) => x.chatId))
          .neq('sender_id', userId)
          .gt('created_at', earliest)
          .order('created_at', { ascending: true })
          .limit(5000)
        for (const m of (msgs || []) as Array<{ chat_id?: string; created_at?: string }>) {
          const c = m.chat_id
          const createdAt = m.created_at
          if (!c || !createdAt) continue
          const lr = lastReadAt[c]
          if (lr && createdAt > lr) perChat[c] = (perChat[c] || 0) + 1
        }
      }

      if (withoutReadAt.length > 0) {
        const counts = await Promise.all(
          withoutReadAt.map(async (chatId) => {
            const { count, error } = await supabaseServer
              .from('chat_messages')
              .select('id', { count: 'exact', head: true })
              .eq('chat_id', chatId)
              .neq('sender_id', userId)
            return { chatId, count: error ? 0 : (typeof count === 'number' ? count : 0) }
          })
        )
        for (const r of counts) perChat[r.chatId] = (perChat[r.chatId] || 0) + r.count
      }

      for (const chatId of chatIds) {
        if (!(chatId in perChat)) perChat[chatId] = 0
        total += perChat[chatId] || 0
      }

      return NextResponse.json({
        ok: true,
        user: normalizedAdmin,
        chats: chatIds,
        unread: { total, perChat, lastReadAt },
      })
    }

    // 1) Agent / guide user (same shape HeaderWrapper expects)
    const userSelect =
      'id, first_name, last_name, email, role, guide_number, country, city, guide_approved, is_active'

    const { data: user, error: uErr } = await supabase
      .from('users')
      .select(userSelect)
      .eq('id', userId)
      .single()

    if (uErr || !user) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    let isOperator = false
    let isManagedGuide = false
    let managedByOperatorName: string | null = null
    const { data: opRow, error: opErr } = await supabase
      .from('users')
      .select('is_operator, managed_by_operator_id')
      .eq('id', userId)
      .maybeSingle()
    if (!opErr && opRow) {
      isOperator = Boolean((opRow as { is_operator?: boolean }).is_operator)
      const managedById = (opRow as { managed_by_operator_id?: string | null }).managed_by_operator_id
      isManagedGuide = Boolean(managedById)
      if (managedById) {
        const { data: opUser } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', managedById)
          .maybeSingle()
        if (opUser) {
          managedByOperatorName = `${opUser.first_name || ''} ${opUser.last_name || ''}`.trim()
        }
      }
    }

    const userRole = ((user.role || roleFromCookie) as string) || undefined
    if ((userRole === 'guide' || userRole === 'agent') && (user as { is_active?: boolean }).is_active === false) {
      const now = new Date().toISOString()
      try {
        const srv = getSupabaseServer()
        await srv
          .from('users')
          .update({
            presence_state: 'offline',
            presence_updated_at: now,
          })
          .eq('id', userId)
        broadcastUserPresenceUpdate({
          userId,
          presence_state: 'offline',
          presence_updated_at: now,
        })
      } catch {
        /* ignore */
      }

      const res = NextResponse.json(
        { ok: false, user: null, suspended: true, suspendedRole: userRole },
        { status: 401 }
      )
      clearAuthCookies(res)
      return res
    }

    const activityOk =
      isImpersonating(jar) ||
      canPerformFullActivity({
        role: user.role || roleFromCookie,
        guide_approved: (user as { guide_approved?: boolean | null }).guide_approved,
      })

    let avatar: string | undefined
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('profile_picture_path')
      .eq('user_id', userId)
      .maybeSingle()
    const picPath = (profileRow as { profile_picture_path?: string | null } | null)?.profile_picture_path
    if (picPath) {
      try {
        const srv = getSupabaseServer()
        const { data: signed } = await srv.storage
          .from(BUCKETS.avatars)
          .createSignedUrl(picPath, 60 * 60 * 24)
        avatar = signed?.signedUrl ?? undefined
      } catch {
        /* ignore */
      }
    }

    const targetName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'User'

    // Carries everything the overall-access banner needs, so the client reads identity from
    // one place instead of the banner and the chat composer each polling
    // /api/admin/impersonate on their own.
    const impersonation: BootstrapImpersonation | null = isImpersonating(jar)
      ? {
          active: true,
          adminId: jar.get('impersonator_id')?.value || '',
          targetName,
          targetEmail: user.email ?? null,
          targetRole: (user as { role?: string | null }).role ?? null,
        }
      : null

    const normalizedUser: BootstrapUser = {
      id: user.id,
      name: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role || roleFromCookie,
      guideNumber: user.guide_number || '',
      country: user.country || '',
      city: user.city || '',
      guideApproved: activityOk,
      isOperator,
      isManagedGuide,
      managedByOperatorName,
      avatar,
    }

    if (!activityOk) {
      return NextResponse.json({
        ok: true,
        user: normalizedUser,
        impersonation,
        chats: [],
        unread: { total: 0, perChat: {}, lastReadAt: {} },
      })
    }

    // 2) Participants (chat ids + last read)
    const supabaseServer = getSupabaseServer()
    const { data: participants, error: pErr } = await supabaseServer
      .from('chat_participants')
      .select('chat_id, last_read_at')
      .eq('user_id', userId)

    if (pErr) {
      return NextResponse.json({ ok: true, user: normalizedUser, chats: [], unread: { total: 0, perChat: {}, lastReadAt: {} } })
    }

    const chatIds: string[] = []
    const lastReadAt: Record<string, string | null> = {}
    const withReadAt: Array<{ chatId: string; lastReadAt: string }> = []
    const withoutReadAt: string[] = []

    for (const row of participants || []) {
      const chatId = String((row as { chat_id?: string }).chat_id || '').trim()
      if (!chatId) continue
      const lr = (row as { last_read_at?: string | null }).last_read_at ?? null
      chatIds.push(chatId)
      lastReadAt[chatId] = lr
      if (lr) withReadAt.push({ chatId, lastReadAt: lr })
      else withoutReadAt.push(chatId)
    }

    // 3) Unread counts
    const perChat: Record<string, number> = {}
    let total = 0

    // 3a) Chats that have a last_read_at: fetch messages since the earliest last_read_at across those chats
    if (withReadAt.length > 0) {
      let earliest = withReadAt[0]!.lastReadAt
      for (let i = 1; i < withReadAt.length; i++) earliest = minIso(earliest, withReadAt[i]!.lastReadAt)

      // Pull only the columns we need; unread is typically recent so this avoids N+1 queries.
      const { data: msgs, error: mErr } = await supabaseServer
        .from('chat_messages')
        .select('chat_id, sender_id, created_at')
        .in('chat_id', withReadAt.map((x) => x.chatId))
        .neq('sender_id', userId)
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

    // 3b) Chats with null last_read_at: fall back to per-chat count, but do it in parallel (small subset)
    if (withoutReadAt.length > 0) {
      const counts = await Promise.all(
        withoutReadAt.map(async (chatId) => {
          const { count, error } = await supabaseServer
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('sender_id', userId)
          return { chatId, count: error ? 0 : (typeof count === 'number' ? count : 0) }
        })
      )
      for (const r of counts) perChat[r.chatId] = (perChat[r.chatId] || 0) + r.count
    }

    // Ensure all chats exist in perChat map (stable shape for client)
    for (const chatId of chatIds) {
      if (!(chatId in perChat)) perChat[chatId] = 0
      total += perChat[chatId] || 0
    }

    return NextResponse.json({
      ok: true,
      user: normalizedUser,
      impersonation,
      chats: chatIds,
      unread: { total, perChat, lastReadAt },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

