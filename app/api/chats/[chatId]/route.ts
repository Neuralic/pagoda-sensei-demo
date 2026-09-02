import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { denyIfActivityNotApproved } from '@/lib/activity-approval';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/chats/[chatId]
 * Remove a chat room. Only participants (agency or guide) can delete.
 * Used to remove client-name threads from the message board.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const jar = await cookies();
    const meId = jar.get('userId')?.value;
    if (!meId) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { chatId } = await context.params;
    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'Chat ID required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(meId, supabase);
    if (activityBlock) return activityBlock;

    const { data: chat, error: chatErr } = await supabase
      .from('chats')
      .select('id, agency_id, guide_id')
      .eq('id', chatId)
      .maybeSingle();

    if (chatErr || !chat) {
      return NextResponse.json({ ok: false, error: 'Chat not found' }, { status: 404 });
    }

    const agencyId = chat.agency_id as string | null;
    const guideId = chat.guide_id as string | null;
    const isParticipant = meId === agencyId || meId === guideId;
    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, error: 'You can only remove chats you participate in' },
        { status: 403 }
      );
    }

    // Delete in order: messages (reactions CASCADE with message delete), participants, chat
    const { error: messagesErr } = await supabase
      .from('chat_messages')
      .delete()
      .eq('chat_id', chatId);
    if (messagesErr) {
      console.error('[chats DELETE] chat_messages', messagesErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to remove chat messages' },
        { status: 500 }
      );
    }

    const { error: participantsErr } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId);
    if (participantsErr) {
      console.error('[chats DELETE] chat_participants', participantsErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to remove chat participants' },
        { status: 500 }
      );
    }

    const { error: chatDeleteErr } = await supabase.from('chats').delete().eq('id', chatId);
    if (chatDeleteErr) {
      console.error('[chats DELETE] chats', chatDeleteErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to remove chat' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Chat removed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
