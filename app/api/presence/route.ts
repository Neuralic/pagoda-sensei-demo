import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { denyIfActivityNotApproved } from '@/lib/activity-approval';
import { broadcastUserPresenceUpdate } from '@/lib/admin-presence-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/presence
 * Body: { state: "online" | "idle" } — agents/guides only.
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get('userId')?.value;
    const role = jar.get('role')?.value;

    if (!userId || (role !== 'agent' && role !== 'guide')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as {
      state?: string;
      /** The client saw a transition (focus/blur/visibility), not a keepalive tick. */
      changed?: boolean;
    };
    const state = body?.state;
    if (state !== 'online' && state !== 'idle') {
      return NextResponse.json({ ok: false, error: 'Invalid state' }, { status: 400 });
    }
    const stateChanged = body?.changed === true;

    const supabase = getSupabaseServer();
    const activityBlock = await denyIfActivityNotApproved(userId, supabase);
    if (activityBlock) return activityBlock;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('users')
      .update({
        presence_state: state,
        presence_updated_at: now,
      })
      .eq('id', userId);

    if (error) {
      console.error('[presence] update failed', error);
      return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
    }

    // The row is refreshed on every heartbeat because the admin list derives online/idle/
    // offline from presence_updated_at. The broadcast is only worth sending when the state
    // actually flipped — this route ran 7,926 times in an 8-hour window, and all but a
    // handful were "online → online".
    if (stateChanged) {
      broadcastUserPresenceUpdate({
        userId,
        presence_state: state,
        presence_updated_at: now,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[presence] exception', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
