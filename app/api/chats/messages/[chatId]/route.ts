import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { sendNewChatMessageNotificationEmail } from '@/lib/mailer'
import {
  claimChatEmailSlot,
} from '@/lib/chat-email-notify'
import {
  mirrorOutboundChatMessageToWhatsApp,
  setUserWhatsAppRoutingChat,
} from '@/lib/chat-whatsapp-sync'
import { maskSensitiveChatContent } from '@/lib/chat-message-sanitize'
import { assertUserCanAccessChat, isItinerarySupportChat } from '@/lib/chat-access'
import { getActiveAdminEmails } from '@/lib/admin-emails'
import {
  buildAdminSupportChatOpenUrl,
  buildAdvisorSupportChatOpenUrl,
  shouldEmailAdvisorForAdminSupportMessage,
} from '@/lib/itinerary-support-chat'
import { conversationPortalFromUserRole, getConversationLoginDeepLinkUrl } from '@/lib/conversation-deep-link'
import { excludeSelfFromRecipients } from '@/lib/chat-recipients'
import { resolveChatSenderIdentity } from '@/lib/chat-sender-identity'
import { chatLog } from '@/lib/ops-log'
import { unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    const role = jar.get('role')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    const { chatId } = await context.params
    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    const access = await assertUserCanAccessChat(supabase, chatId, userId, { role })
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status })
    }

    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('id, chat_id, sender_id, message, message_type, file_path, created_at, is_deleted, deleted_at, is_edited, edited_at, updated_at, source_channel')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    if (!messages || messages.length === 0) {
      return NextResponse.json({ ok: true, messages: [] })
    }

    // Get all unique sender IDs
    const senderIds = [...new Set(messages.map(m => m.sender_id).filter((id): id is string => !!id))]

    // Fetch user information for all senders
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', senderIds)

    type UserRow = { id: string; first_name: string | null; last_name: string | null }
    const usersById: Record<string, UserRow> = {}
    if (users) {
      for (const u of users as UserRow[]) usersById[u.id] = u
    }

    // Admins are not in users — resolve missing names from admin table
    const missingIds = senderIds.filter((id) => !usersById[id])
    if (missingIds.length > 0) {
      const { data: adminRows } = await supabase
        .from('admin')
        .select('id, first_name, last_name')
        .in('id', missingIds)
      for (const a of adminRows ?? []) {
        usersById[a.id as string] = {
          id: a.id as string,
          first_name: (a.first_name as string | null) ?? 'Pagoda',
          last_name: (a.last_name as string | null) ?? 'Support',
        }
      }
    }

    // Fetch profiles for avatars
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id, profile_picture_path')
      .in('user_id', senderIds)

    type ProfileRow = { id: string; user_id: string; profile_picture_path: string | null }
    const profileByUserId: Record<string, ProfileRow> = {}
    if (profiles) {
      for (const p of profiles as ProfileRow[]) profileByUserId[p.user_id] = p
    }

    // Sign all avatar URLs
    const avatarPathsToSign: string[] = []
    const pathToUserId: Record<string, string> = {}

    profiles?.forEach((p) => {
      const path = p.profile_picture_path
      if (path && typeof path === 'string' && !path.startsWith('http')) {
        avatarPathsToSign.push(path)
        pathToUserId[path] = p.user_id
      }
    })

    const signedAvatars: Record<string, string | null> = {}
    if (avatarPathsToSign.length > 0) {
      try {
        const signPromises = avatarPathsToSign.map(async (path) => {
          try {
            const { data: signed } = await supabase.storage
              .from(BUCKETS.avatars)
              .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 days expiry
            return { path, url: signed?.signedUrl || null }
          } catch {
            return { path, url: null }
          }
        })

        const signResults = await Promise.all(signPromises)
        signResults.forEach(({ path, url }) => {
          const uid = pathToUserId[path]
          if (uid) {
            signedAvatars[uid] = url
          }
        })
      } catch {
        // If signing fails, avatars will be null
      }
    }

    // Fetch reactions for all messages
    const messageIds = messages.map(m => m.id)
    const { data: reactions } = await supabase
      .from('chat_message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds)

    // Group reactions by message_id and emoji
    type ReactionRow = { message_id: string; user_id: string; emoji: string }
    const reactionsByMessage: Record<string, Record<string, string[]>> = {}
    if (reactions) {
      for (const r of reactions as ReactionRow[]) {
        if (!reactionsByMessage[r.message_id]) {
          reactionsByMessage[r.message_id] = {}
        }
        if (!reactionsByMessage[r.message_id][r.emoji]) {
          reactionsByMessage[r.message_id][r.emoji] = []
        }
        reactionsByMessage[r.message_id][r.emoji].push(r.user_id)
      }
    }

    // Enrich messages with sender information and reactions
    const enrichedMessages = messages.map((msg) => {
      const senderId = msg.sender_id as string
      const user = usersById[senderId]
      const profile = profileByUserId[senderId]
      
      const firstName = user?.first_name || ''
      const lastName = user?.last_name || ''
      const senderName = `${firstName} ${lastName}`.trim() || 'User'
      
      const avatarPath = profile?.profile_picture_path
      let avatarUrl: string | null = null
      if (avatarPath) {
        if (typeof avatarPath === 'string' && avatarPath.startsWith('http')) {
          avatarUrl = avatarPath
        } else {
          avatarUrl = signedAvatars[senderId] || null
        }
      }

      // Format reactions: { emoji: [userIds] }
      const messageReactions = reactionsByMessage[msg.id] || {}

      const rawMessage = typeof msg.message === 'string' ? msg.message : ''
      const displayMessage =
        msg.is_deleted || msg.message_type !== 'text'
          ? rawMessage
          : maskSensitiveChatContent(rawMessage)

      return {
        ...msg,
        message: displayMessage,
        sender_name: senderName,
        sender_avatar: avatarUrl,
        reactions: messageReactions,
      }
    })

    return NextResponse.json({ ok: true, messages: enrichedMessages })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params
    const { message, type, filePath } = await req.json().catch(() => ({})) as { message?: string, type?: string, filePath?: string }
    if (!message && !filePath) return NextResponse.json({ ok: false, error: 'Missing message' }, { status: 400 })

    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    // Verify user participates in chat
    const role = jar.get('role')?.value
    const access = await assertUserCanAccessChat(supabase, chatId, userId, { role })
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status })
    }
    const chat = access.chat

    // Admin overall-access runs on the target's cookies, so `userId` here is the advisor even
    // when a Pagoda admin is typing. The message is attributed to whoever is really writing.
    const identity = await resolveChatSenderIdentity(jar, supabase)
    if (!identity) {
      return unauthorized()
    }
    const senderIsAdmin = identity.senderRole === 'admin'

    const rawText = (message || '').trim()
    const sanitizedText =
      type && type !== 'text' ? rawText : maskSensitiveChatContent(rawText)

    const payload = {
      chat_id: chatId,
      sender_id: identity.senderId,
      message: sanitizedText,
      message_type: type || 'text',
      file_path: filePath || null,
      source_channel: 'app' as const,
    }

    const { data: created, error: cErr } = await supabase
      .from('chat_messages')
      .insert(payload)
      .select('id, chat_id, sender_id, message, message_type, file_path, created_at, source_channel, is_deleted, is_edited')
      .single()

    if (cErr || !created?.id) {
      chatLog.error('message.insert_failed', cErr, {
        chatId,
        senderId: identity.senderId,
        adminActing: identity.isAdminActing,
      })
      const hint =
        cErr?.message?.includes('foreign key') || cErr?.code === '23503'
          ? 'Sender is not allowed for this chat. If you are an admin, run migration 20260811_chat_messages_sender_allow_admin.sql.'
          : cErr?.message || 'Insert failed'
      return NextResponse.json({ ok: false, error: hint }, { status: 500 })
    }

    void setUserWhatsAppRoutingChat(userId, chatId).catch((e) =>
      console.error('[chat message POST] whatsapp routing session failed', e)
    )

    const supportChat = isItinerarySupportChat(chat)
    chatLog.info('message.stored', {
      chatId,
      messageId: created.id,
      senderId: identity.senderId,
      sessionUserId: identity.sessionUserId,
      adminActing: identity.isAdminActing,
      supportChat,
    })
    // Routing still follows the session account — that is the side of the thread being used.
    const recipientId =
      chat.agency_id === userId ? chat.guide_id : chat.agency_id

    // Skip the WhatsApp mirror for support threads, and whenever an admin is acting through
    // someone's account: the mirror resolves sender names from `users` and would put the
    // account holder's name on a message Pagoda wrote.
    if (!supportChat && !identity.isAdminActing && recipientId && typeof recipientId === 'string') {
      void mirrorOutboundChatMessageToWhatsApp({
        chatId,
        senderId: userId,
        recipientId,
        text: sanitizedText,
        filePath,
      }).catch((e) => console.error('[chat message POST] whatsapp mirror failed', e))
    }
    const previewText =
      sanitizedText || (filePath ? 'Sent an attachment' : 'New message')

    const senderName = identity.displayName

    if (supportChat) {
      void (async () => {
        try {
          const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
          const itineraryId = chat.itinerary_id

          // `senderIsAdmin` comes from the resolved identity, not the role cookie. Reading the
          // cookie meant an admin writing through overall access looked like the advisor, so
          // the advisor's own inbox was skipped and the admin team was emailed instead — the
          // admin received their own message and the advisor heard nothing.
          const notifySenderName = senderName

          if (senderIsAdmin && chat.agency_id) {
            const { data: advisor } = await supabase
              .from('users')
              .select('email, first_name, last_name, presence_state, presence_updated_at')
              .eq('id', chat.agency_id)
              .maybeSingle()
            if (advisor?.email) {
              const allowed = await claimChatEmailSlot(supabase, chatId, advisor.email)
              const notify = shouldEmailAdvisorForAdminSupportMessage({
                senderIsAdmin: true,
                advisorEmail: advisor.email,
                cooldownAllowed: allowed,
              })
              if (!notify.shouldEmail) return
              const openUrl = buildAdvisorSupportChatOpenUrl(base, {
                chatId,
                itineraryId,
              })
              await sendNewChatMessageNotificationEmail(
                advisor.email,
                `${advisor.first_name ?? ''} ${advisor.last_name ?? ''}`.trim() || 'there',
                notifySenderName,
                previewText,
                'agent',
                chatId,
                openUrl
              )
            }
          } else {
            const { data: senderAdmin } = senderIsAdmin
              ? await supabase
                  .from('admin')
                  .select('email')
                  .eq('id', identity.senderId)
                  .maybeSingle()
              : { data: null }
            const adminEmails = excludeSelfFromRecipients(
              await getActiveAdminEmails(),
              (senderAdmin as { email?: string } | null)?.email
            )
            const openUrl = buildAdminSupportChatOpenUrl(base, {
              chatId,
              itineraryId,
            })
            for (const email of adminEmails) {
              const allowed = await claimChatEmailSlot(supabase, chatId, email)
              if (!allowed) continue
              await sendNewChatMessageNotificationEmail(
                email,
                'Pagoda admin',
                notifySenderName,
                previewText,
                'agent',
                chatId,
                openUrl
              )
            }
          }
        } catch (e) {
          console.error('[chat message POST] itinerary support notify failed', e)
        }
      })()
    } else if (recipientId && typeof recipientId === 'string') {
      void (async () => {
        try {
          const { data: usersRows } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, role, presence_state, presence_updated_at')
            .in('id', [userId, recipientId])

          type URow = {
            id: string
            email: string | null
            first_name: string | null
            last_name: string | null
            role: string | null
            presence_state: string | null
            presence_updated_at: string | null
          }
          const list = (usersRows || []) as URow[]
          const sender = list.find((u) => u.id === userId)
          const recipient = list.find((u) => u.id === recipientId)
          if (!recipient?.email) {
            chatLog.info('email.skip_no_recipient_email', { chatId, recipientId })
            return
          }
          const allowed = await claimChatEmailSlot(supabase, chatId, recipient.email)
          if (!allowed) {
            chatLog.info('email.skip_cooldown', { chatId, recipientEmail: recipient.email })
            return
          }

          // During overall access the message is from Pagoda, not from the account holder.
          const senderName = identity.isAdminActing
            ? identity.displayName
            : [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() ||
              'Someone'
          const recipientName =
            [recipient.first_name, recipient.last_name].filter(Boolean).join(' ').trim() ||
            'there'
          const portal = conversationPortalFromUserRole(recipient.role)
          const openUrl = getConversationLoginDeepLinkUrl(portal, chatId)

          const mailResult = await sendNewChatMessageNotificationEmail(
            recipient.email,
            recipientName,
            senderName,
            previewText,
            portal,
            chatId,
            openUrl
          )
          chatLog.info(
            mailResult?.ok ? 'email.sent' : 'email.failed',
            {
              chatId,
              recipientId,
              recipientEmail: recipient.email,
              portal,
              messageId:
                mailResult && typeof mailResult === 'object' && 'messageId' in mailResult
                  ? (mailResult as { messageId?: string }).messageId
                  : undefined,
            }
          )
        } catch (e) {
          console.error('[chat message POST] notify recipient email failed', e)
        }
      })()
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      message: {
        id: created.id,
        chat_id: created.chat_id,
        sender_id: created.sender_id,
        message: created.message,
        message_type: created.message_type || 'text',
        file_path: created.file_path ?? null,
        created_at: created.created_at,
        source_channel: created.source_channel || 'app',
        is_deleted: Boolean(created.is_deleted),
        is_edited: Boolean(created.is_edited),
        sender_name: senderName,
        reactions: {},
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params
    const { messageId } = await req.json().catch(() => ({})) as { messageId?: string }
    if (!messageId) return NextResponse.json({ ok: false, error: 'Missing messageId' }, { status: 400 })

    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    // Verify user participates in chat
    const access = await assertUserCanAccessChat(supabase, chatId, userId, {
      role: jar.get('role')?.value,
    })
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status })
    }

    // Verify message belongs to this chat and user is the sender
    const { data: message } = await supabase
      .from('chat_messages')
      .select('id, sender_id, chat_id')
      .eq('id', messageId)
      .eq('chat_id', chatId)
      .maybeSingle()

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message not found' }, { status: 404 })
    }

    if (message.sender_id !== userId) {
      return NextResponse.json({ ok: false, error: 'You can only delete your own messages' }, { status: 403 })
    }

    // Soft delete: mark as deleted instead of actually deleting
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    if (updateError) {
      return NextResponse.json({ ok: false, error: 'Delete failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params
    const { messageId, message: newMessage } = await req.json().catch(() => ({})) as { messageId?: string, message?: string }
    if (!messageId) return NextResponse.json({ ok: false, error: 'Missing messageId' }, { status: 400 })
    if (!newMessage || !newMessage.trim()) return NextResponse.json({ ok: false, error: 'Missing message content' }, { status: 400 })

    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    // Verify user participates in chat
    const access = await assertUserCanAccessChat(supabase, chatId, userId, {
      role: jar.get('role')?.value,
    })
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status })
    }

    // Verify message belongs to this chat and user is the sender
    const { data: message } = await supabase
      .from('chat_messages')
      .select('id, sender_id, chat_id, is_deleted')
      .eq('id', messageId)
      .eq('chat_id', chatId)
      .maybeSingle()

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message not found' }, { status: 404 })
    }

    if (message.sender_id !== userId) {
      return NextResponse.json({ ok: false, error: 'You can only edit your own messages' }, { status: 403 })
    }

    if (message.is_deleted) {
      return NextResponse.json({ ok: false, error: 'Cannot edit deleted message' }, { status: 400 })
    }

    const sanitizedText = maskSensitiveChatContent(newMessage.trim())

    // Update message and mark as edited
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        message: sanitizedText,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    if (updateError) {
      return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params
    const { messageId, emoji } = await req.json().catch(() => ({})) as { messageId?: string, emoji?: string }
    if (!messageId || !emoji) return NextResponse.json({ ok: false, error: 'Missing messageId or emoji' }, { status: 400 })

    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const supabase = getSupabaseServer()
    const activityBlock = await denyIfActivityNotApproved(userId, supabase)
    if (activityBlock) return activityBlock

    // Verify message belongs to chat
    const { data: message } = await supabase
      .from('chat_messages')
      .select('id, chat_id')
      .eq('id', messageId)
      .eq('chat_id', chatId)
      .maybeSingle()

    if (!message) return NextResponse.json({ ok: false, error: 'Message not found' }, { status: 404 })

    // Check if reaction already exists
    const { data: existing } = await supabase
      .from('chat_message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .maybeSingle()

    if (existing) {
      // Remove reaction
      const { error } = await supabase
        .from('chat_message_reactions')
        .delete()
        .eq('id', existing.id)

      if (error) return NextResponse.json({ ok: false, error: 'Failed to remove reaction' }, { status: 500 })
      return NextResponse.json({ ok: true, action: 'removed' })
    } else {
      // Add reaction
      const { error } = await supabase
        .from('chat_message_reactions')
        .insert({
          message_id: messageId,
          user_id: userId,
          emoji: emoji,
        })

      if (error) return NextResponse.json({ ok: false, error: 'Failed to add reaction' }, { status: 500 })
      return NextResponse.json({ ok: true, action: 'added' })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
