import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { assertAgentGuideChatPair } from '@/lib/chat-pair-roles'
import {
	badRequest,
	forbidden,
	migrationRequired,
	ok,
	unauthorized,
} from '@/lib/api-response'
import { optionalString, parseJsonObject, requireString } from '@/lib/validate'

export const dynamic = 'force-dynamic'

type ChatRow = { id: string; client_name?: string | null; chat_kind?: string | null }

function isGeneralClientName(name: string | null | undefined): boolean {
	return name == null || String(name).trim() === ''
}

function isMarketplaceChat(row: { chat_kind?: string | null } | null | undefined): boolean {
	const kind = row?.chat_kind
	return kind == null || kind === '' || kind === 'marketplace'
}

async function findPairChats(
	supabase: ReturnType<typeof getSupabaseServer>,
	agencyId: string,
	guideId: string
): Promise<ChatRow[]> {
	const { data, error } = await supabase
		.from('chats')
		.select('id, client_name, chat_kind')
		.eq('agency_id', agencyId)
		.eq('guide_id', guideId)
		.order('created_at', { ascending: false })
		.limit(50)

	if (error) {
		// chat_kind may not exist yet — fall back without it
		if (/chat_kind/i.test(error.message || '')) {
			const fallback = await supabase
				.from('chats')
				.select('id, client_name')
				.eq('agency_id', agencyId)
				.eq('guide_id', guideId)
				.order('created_at', { ascending: false })
				.limit(50)
			if (fallback.error) {
				console.error('Error listing pair chats:', fallback.error)
				return []
			}
			return (fallback.data || []) as ChatRow[]
		}
		console.error('Error listing pair chats:', error)
		return []
	}
	return ((data || []) as ChatRow[]).filter(isMarketplaceChat)
}

/**
 * The thread this request is actually asking for — never a different one.
 *
 * There used to be a `rows[0]` fallback here for databases that still carried the old
 * one-chat-per-pair constraint. It meant typing a new client name opened the *general*
 * thread and reported success, so advisors believed the "+" button was broken. A request we
 * cannot satisfy is now an error the advisor can read, not a silent swap.
 */
function pickExistingChat(
	rows: ChatRow[],
	clientName: string,
	isGeneralChat: boolean
): ChatRow | null {
	if (!rows.length) return null
	if (isGeneralChat) {
		return rows.find((r) => isGeneralClientName(r.client_name)) || null
	}
	return (
		rows.find((r) => String(r.client_name || '').trim() === clientName) || null
	)
}

async function ensureParticipants(
	supabase: ReturnType<typeof getSupabaseServer>,
	chatId: string,
	agencyId: string,
	guideId: string
) {
	const { error } = await supabase.from('chat_participants').upsert(
		[
			{ chat_id: chatId, user_id: agencyId },
			{ chat_id: chatId, user_id: guideId },
		],
		{ onConflict: 'chat_id,user_id' }
	)
	if (error) {
		console.error('Failed to upsert chat participants:', error)
	}
}

// POST /api/chats/ensure-pair - Create or get existing chat based on guide-agent pair only
// Body: { agencyId, guideId, clientName? }
export async function POST(req: NextRequest) {
	try {
		const jar = await cookies()
		const userId = jar.get('userId')?.value
		if (!userId) return unauthorized()

		const parsedBody = await parseJsonObject(req)
		if (!parsedBody.ok) return badRequest(parsedBody.error)
		const body = parsedBody.value

		const parsedAgencyId = requireString(body.agencyId, 'agencyId')
		if (!parsedAgencyId.ok) return badRequest(parsedAgencyId.error)
		const parsedGuideId = requireString(body.guideId, 'guideId')
		if (!parsedGuideId.ok) return badRequest(parsedGuideId.error)
		const agencyId = parsedAgencyId.value
		const guideId = parsedGuideId.value

		const role = jar.get('role')?.value
		const isAdmin = role === 'admin'

		// Participants, or admin helping the advisor on their itinerary
		if (userId !== agencyId && userId !== guideId && !isAdmin) {
			return forbidden()
		}

		const clientName = optionalString(body.clientName) ?? ''
		const isGeneralChat = clientName === ''

		const supabase = getSupabaseServer()
		if (!isAdmin) {
			const activityBlock = await denyIfActivityNotApproved(userId, supabase)
			if (activityBlock) return activityBlock
		}

		const pairCheck = await assertAgentGuideChatPair(supabase, agencyId, guideId)
		if (!pairCheck.ok) {
			return NextResponse.json({ ok: false, error: pairCheck.error }, { status: pairCheck.status })
		}

		const existingRows = await findPairChats(supabase, agencyId, guideId)
		const existing = pickExistingChat(existingRows, clientName, isGeneralChat)

		if (existing) {
			await ensureParticipants(supabase, existing.id, agencyId, guideId)
			return ok({
				chatId: existing.id,
				created: false,
				clientName: isGeneralClientName(existing.client_name)
					? null
					: String(existing.client_name).trim(),
			})
		}

		// Create new marketplace chat
		const insertPayload: Record<string, unknown> = {
			job_id: null,
			application_id: null,
			agency_id: agencyId,
			guide_id: guideId,
			client_name: isGeneralChat ? null : clientName,
			chat_kind: 'marketplace',
		}
		let { data: created, error: createErr } = await supabase
			.from('chats')
			.insert(insertPayload)
			.select('id')
			.single()

		// chat_kind column may be missing before migration — retry without it
		if (createErr && /chat_kind/i.test(createErr.message || '')) {
			const retry = await supabase
				.from('chats')
				.insert({
					job_id: null,
					application_id: null,
					agency_id: agencyId,
					guide_id: guideId,
					client_name: isGeneralChat ? null : clientName,
				})
				.select('id')
				.single()
			created = retry.data
			createErr = retry.error
		}

		if (createErr) {
			if (createErr.code === '23505' || createErr.message?.includes('unique')) {
				// Either another request created this exact thread (fine — return it), or the
				// database still enforces one chat per advisor-guide pair. Only the first is
				// safe to resolve silently; the second means this thread cannot exist yet.
				const raced = await findPairChats(supabase, agencyId, guideId)
				const match = pickExistingChat(raced, clientName, isGeneralChat)
				if (match) {
					await ensureParticipants(supabase, match.id, agencyId, guideId)
					return ok({
						chatId: match.id,
						created: false,
						clientName: isGeneralClientName(match.client_name)
							? null
							: String(match.client_name).trim(),
					})
				}

				console.error('Chat creation blocked by a unique constraint:', createErr)
				return migrationRequired(
					'20250223_chats_client_name.sql',
					'This database still allows only one thread per advisor and guide.'
				)
			}
			console.error('Error creating chat:', createErr)
			return NextResponse.json({ ok: false, error: `Failed to create chat: ${createErr.message}` }, { status: 500 })
		}

		if (!created) {
			console.error('Chat creation returned no data')
			return NextResponse.json({ ok: false, error: 'Failed to create chat: no data returned' }, { status: 500 })
		}

		await ensureParticipants(supabase, created.id, agencyId, guideId)

		return ok({
			chatId: created.id,
			created: true,
			clientName: isGeneralChat ? null : clientName,
		})
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unexpected error'
		return NextResponse.json({ ok: false, error: msg }, { status: 500 })
	}
}
