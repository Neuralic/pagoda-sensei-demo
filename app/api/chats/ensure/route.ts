import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { assertAgentGuideChatPair } from '@/lib/chat-pair-roles'

export const dynamic = 'force-dynamic'

// POST /api/chats/ensure - Create or get existing chat between agent and guide
// Body: { agencyId, guideId } (jobId and applicationId are optional and deprecated)
export async function POST(req: NextRequest) {
	try {
		const jar = await cookies()
		const userId = jar.get('userId')?.value
		if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

		const body = await req.json().catch(() => ({})) as {
			jobId?: string
			applicationId?: string
			agencyId?: string
			guideId?: string
		}

		const { agencyId, guideId } = body

		if (!agencyId || !guideId) {
			return NextResponse.json({ ok: false, error: 'Missing required fields: agencyId, guideId' }, { status: 400 })
		}

		// Verify user is one of the participants
		if (userId !== agencyId && userId !== guideId) {
			return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
		}

		const supabase = getSupabaseServer()
		const activityBlock = await denyIfActivityNotApproved(userId, supabase)
		if (activityBlock) return activityBlock

		const pairCheck = await assertAgentGuideChatPair(supabase, agencyId, guideId)
		if (!pairCheck.ok) {
			return NextResponse.json({ ok: false, error: pairCheck.error }, { status: pairCheck.status })
		}

		// Check if chat already exists for this guide-agent pair (regardless of job_id)
		// We prioritize finding existing chats between the same guide and agent
		// Use limit(1) instead of maybeSingle() to handle cases where multiple chats exist
		const { data: existingChats, error: checkError } = await supabase
			.from('chats')
			.select('id')
			.eq('agency_id', agencyId)
			.eq('guide_id', guideId)
			.order('created_at', { ascending: false })
			.limit(1)

		if (checkError) {
			console.error('Error checking for existing chat:', checkError);
			return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
		}

		const existing = existingChats && existingChats.length > 0 ? existingChats[0] : null

		if (existing) {
			// Ensure chat_participants rows exist for both participants
			const { error: upsertError } = await supabase
				.from('chat_participants')
				.upsert([
					{ chat_id: existing.id, user_id: agencyId },
					{ chat_id: existing.id, user_id: guideId },
				], { onConflict: 'chat_id,user_id' })

			if (upsertError) {
				console.error('Failed to upsert chat participants:', upsertError);
				// Continue anyway - participants might already exist
			}

			return NextResponse.json({ ok: true, chatId: existing.id, created: false })
		}

		// Create new chat - job_id and application_id are optional and can be null
		// Note: The unique constraint on (agency_id, guide_id) ensures only ONE chat per pair
		const { data: created, error: createErr } = await supabase
			.from('chats')
			.insert({
				job_id: null, // No longer required
				application_id: null, // No longer required
				agency_id: agencyId,
				guide_id: guideId,
			})
			.select('id')
			.single()

		if (createErr) {
			// If unique constraint violation (shouldn't happen since we check first, but handle gracefully)
			if (createErr.code === '23505' || createErr.message?.includes('unique')) {
				// Race condition: another request created the chat, fetch it
				const { data: existingChats } = await supabase
					.from('chats')
					.select('id')
					.eq('agency_id', agencyId)
					.eq('guide_id', guideId)
					.limit(1)
				
				if (existingChats && existingChats.length > 0) {
					return NextResponse.json({ ok: true, chatId: existingChats[0].id, created: false })
				}
			}
			console.error('Error creating chat:', createErr);
			return NextResponse.json({ ok: false, error: `Failed to create chat: ${createErr.message}` }, { status: 500 })
		}
		
		if (!created) {
			console.error('Chat creation returned no data');
			return NextResponse.json({ ok: false, error: 'Failed to create chat: no data returned' }, { status: 500 })
		}

		// Create participant rows for both users
		const { error: participantError } = await supabase
			.from('chat_participants')
			.upsert([
				{ chat_id: created.id, user_id: agencyId },
				{ chat_id: created.id, user_id: guideId },
			], { onConflict: 'chat_id,user_id' })

		if (participantError) {
			console.error('Failed to create chat participants:', participantError);
			// Still return success since chat was created, but log the error
		}

		return NextResponse.json({ ok: true, chatId: created.id, created: true })
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unexpected error'
		return NextResponse.json({ ok: false, error: msg }, { status: 500 })
	}
}

