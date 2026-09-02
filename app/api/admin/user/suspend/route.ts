import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/user/suspend
 * Suspend a user account. Admin only.
 * - If user is agent: their jobs will show as "no longer available" and guides cannot bid.
 * - If user is guide: their tours are set to status 'banned'.
 * Returns counts so the admin UI can display the results.
 * Body: { userId: string | number }
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const adminId = jar.get('userId')?.value;
    const role = jar.get('role')?.value;

    if (role !== 'admin' || !adminId) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();
    const { data: admin } = await supabase
      .from('admin')
      .select('id')
      .eq('id', adminId)
      .eq('is_active', true)
      .single();

    if (!admin) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawUserId = body?.userId;
    const userId =
      rawUserId !== undefined && rawUserId !== null && rawUserId !== ''
        ? String(rawUserId)
        : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Valid userId is required.' },
        { status: 400 }
      );
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, role, is_active')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { ok: false, error: 'User is already suspended.' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (updateErr) {
      console.error('[admin/user/suspend] users update', updateErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to suspend user.' },
        { status: 500 }
      );
    }

    let jobsNoLongerAvailable: number | undefined;
    let toursBanned: number | undefined;

    if (user.role === 'agent') {
      const { count, error: jobsErr } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId);
      if (!jobsErr) jobsNoLongerAvailable = count ?? 0;
    }

    if (user.role === 'guide') {
      const { data: tourUpdates, error: tourErr } = await supabase
        .from('tour')
        .update({ status: 'banned', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('id');
      if (!tourErr) toursBanned = Array.isArray(tourUpdates) ? tourUpdates.length : 0;
    }

    return NextResponse.json({
      ok: true,
      message: 'User suspended.',
      role: user.role,
      jobsNoLongerAvailable,
      toursBanned,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
