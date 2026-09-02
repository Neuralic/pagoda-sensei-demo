import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { isValidAgentGuideChatPair } from '@/lib/chat-pair-roles'
import { enrichItinerarySupportChatForAdvisorList } from '@/lib/itinerary-support-chat'

export const dynamic = 'force-dynamic'

// GET /api/chats - Get all chats for the current user
export async function GET() {
  try {
    const jar = await cookies()
    const meId = jar.get('userId')?.value
    if (!meId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(meId, supabase)
    if (activityBlock) return activityBlock

    // Get all chats the user participates in
    const { data: participants, error: pErr } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', meId)

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ ok: true, chats: [] })
    }

    const chatIds = participants.map(p => p.chat_id).filter((id): id is string => !!id)

    type ChatRow = {
      id: string
      job_id: string | null
      application_id: string | null
      agency_id: string | null
      guide_id: string | null
      client_name?: string | null
      chat_kind?: string | null
      itinerary_id?: string | null
      created_at: string
    }

    // Fetch all chats (include client_name for general vs client threads)
    let chats: ChatRow[] | null = null
    {
      const full = await supabase
        .from('chats')
        .select('id, job_id, application_id, agency_id, guide_id, client_name, chat_kind, itinerary_id, created_at')
        .in('id', chatIds)
        .order('created_at', { ascending: false })
      if (full.error && /chat_kind|itinerary_id/i.test(full.error.message || '')) {
        const fallback = await supabase
          .from('chats')
          .select('id, job_id, application_id, agency_id, guide_id, client_name, created_at')
          .in('id', chatIds)
          .order('created_at', { ascending: false })
        if (fallback.error) {
          return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 })
        }
        chats = (fallback.data || []) as ChatRow[]
      } else if (full.error) {
        return NextResponse.json({ ok: false, error: full.error.message }, { status: 500 })
      } else {
        chats = (full.data || []) as ChatRow[]
      }
    }

    if (!chats || chats.length === 0) {
      return NextResponse.json({ ok: true, chats: [] })
    }

    const userIds = new Set<string>()
    chats.forEach(chat => {
      if (chat.agency_id) userIds.add(chat.agency_id)
      if (chat.guide_id) userIds.add(chat.guide_id)
    })

    // Fetch users, profiles, and last messages in parallel (single query for last messages instead of N)
    const [usersResult, profilesResult, lastMessagesResult] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .in('id', Array.from(userIds)),
      supabase
        .from('profiles')
        .select('id, user_id, profile_picture_path')
        .in('user_id', Array.from(userIds)),
      supabase
        .from('chat_messages')
        .select('chat_id, message, created_at')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false })
        .limit(Math.min(chatIds.length * 2, 500)),
    ])

    const users = usersResult.data
    const profiles = profilesResult.data

    type UserRow = {
      id: string
      first_name: string | null
      last_name: string | null
      email: string | null
      role: string | null
    }
    const usersById: Record<string, UserRow> = {}
    if (users) {
      for (const u of users as UserRow[]) usersById[u.id] = u
    }

    type ProfileRow = { id: string; user_id: string; profile_picture_path: string | null }
    const profileByUserId: Record<string, ProfileRow> = {}
    if (profiles) {
      for (const p of profiles as ProfileRow[]) profileByUserId[p.user_id] = p
    }

    // Build last message per chat from single query (first occurrence per chat_id = latest due to order)
    const lastMessages: Record<string, { content: string; created_at: string } | null> = {}
    const messagesList = lastMessagesResult.data || []
    for (const row of messagesList as Array<{ chat_id: string; message: string | null; created_at: string }>) {
      if (row.chat_id && !(row.chat_id in lastMessages)) {
        lastMessages[row.chat_id] = {
          content: (row.message as string) || '',
          created_at: (row.created_at as string) || '',
        }
      }
    }

    // Collect all unique avatar paths that need signing
    const avatarPathsToSign: string[] = []
    const pathToChatMap: Record<string, string[]> = {} // path -> array of chatIds that need this path

    chats.forEach(chat => {
      const agencyId = chat.agency_id
      const guideId = chat.guide_id
      if (!agencyId || !guideId) return
      const agencyProfile = profileByUserId[agencyId]
      const guideProfile = profileByUserId[guideId]

      // Determine the other participant
      const otherId = meId === agencyId ? guideId : agencyId
      const otherProfile = meId === agencyId ? guideProfile : agencyProfile

      const path = otherProfile?.profile_picture_path
      if (path && typeof path === 'string' && !path.startsWith('http')) {
        if (!pathToChatMap[path]) {
          pathToChatMap[path] = []
          avatarPathsToSign.push(path)
        }
        pathToChatMap[path].push(chat.id)
      }
    })

    // Sign all avatar URLs in parallel
    const signedAvatars: Record<string, string | null> = {}
    if (avatarPathsToSign.length > 0) {
      try {
        // Create promises for all avatar paths
        const signPromises: Array<Promise<{ path: string; url: string | null }>> = []
        
        for (const path of avatarPathsToSign) {
          const promise = (async () => {
            try {
              const { data: signed } = await supabase.storage
                .from(BUCKETS.avatars)
                .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days expiry
              return { path, url: signed?.signedUrl || null }
            } catch {
              return { path, url: null }
            }
          })()
          signPromises.push(promise)
        }

        const signResults = await Promise.all(signPromises)
        signResults.forEach(({ path, url }) => {
          signedAvatars[path] = url
        })
      } catch {
        // If signing fails, all avatars will be null
      }
    }

    // Build enriched chats — marketplace agent↔guide plus advisor itinerary support threads
    const enrichedChats = chats.flatMap(chat => {
      const supportItem = enrichItinerarySupportChatForAdvisorList(chat, meId, lastMessages)
      if (supportItem) {
        return [supportItem]
      }

      const agencyId = chat.agency_id
      const guideId = chat.guide_id
      const jobId = chat.job_id // Optional now
      if (chat.chat_kind === 'itinerary_support') {
        return []
      }

      if (!agencyId || !guideId) {
        return []
      }

      const agencyUser = usersById[agencyId]
      const guideUser = usersById[guideId]

      if (!isValidAgentGuideChatPair(agencyUser?.role, guideUser?.role)) {
        return []
      }

      const agencyProfile = profileByUserId[agencyId]
      const guideProfile = profileByUserId[guideId]

      // Determine the other participant
      const otherId = meId === agencyId ? guideId : agencyId
      const otherUser = meId === agencyId ? guideUser : agencyUser
      const otherProfile = meId === agencyId ? guideProfile : agencyProfile

      // Get avatar URL from the pre-signed map
      const path = otherProfile?.profile_picture_path
      const avatarUrl = path && typeof path === 'string' && !path.startsWith('http')
        ? (signedAvatars[path] || null)
        : (path && path.startsWith('http') ? path : null)

      const otherName = otherUser
        ? `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'User'
        : 'User'

      const lastMessage = lastMessages[chat.id]?.content || ''
      const lastMessageTime = lastMessages[chat.id]?.created_at || chat.created_at
      const clientName = chat.client_name?.trim() || null

      return [{
        id: chat.id,
        chatId: chat.id,
        jobId: jobId || null,
        applicationId: chat.application_id || null,
        clientName: clientName || null, // null = general chat; string = client/travel order thread
        chatKind: 'marketplace' as const,
        itineraryId: null,
        otherParticipant: {
          id: otherId,
          name: otherName,
          email: otherUser?.email || null,
          avatarUrl,
          role: otherUser?.role || null,
        },
        lastMessage,
        lastMessageTime,
        createdAt: chat.created_at,
      }]
    })

    return NextResponse.json({ ok: true, chats: enrichedChats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

