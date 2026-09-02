import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendAgentApprovedEmail, sendGuideApprovedEmail } from '@/lib/mailer';

/**
 * PATCH /api/admin/user/approve
 * Approve an agent or guide so they can use the full platform. Only admins can call this.
 * Body: { userId: number | string } (users.id can be integer or UUID)
 */
export async function PATCH(req: NextRequest) {
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
    // Accept both number (legacy) and string (UUID) for users.id
    const userId = rawUserId !== undefined && rawUserId !== null && rawUserId !== ''
      ? rawUserId
      : null;
    if (userId === null || (typeof userId === 'number' && (!Number.isInteger(userId) || userId < 1))) {
      return NextResponse.json(
        { ok: false, error: 'Valid userId is required.' },
        { status: 400 }
      );
    }

    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('id, role, email, first_name, is_operator, managed_by_operator_id')
      .eq('id', userId)
      .single();

    if (fetchErr || !user) {
      return NextResponse.json(
        { ok: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    if (user.role !== 'guide' && user.role !== 'agent') {
      return NextResponse.json(
        { ok: false, error: 'Only agents and guides can be approved with this action.' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ guide_approved: true })
      .eq('id', userId);

    if (updateErr) {
      console.error('[admin/user/approve] update error', updateErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to approve user.' },
        { status: 500 }
      );
    }

    const userEmail = (user as { email?: string }).email;
    const firstName = (user as { first_name?: string }).first_name ?? '';
    if (userEmail && typeof userEmail === 'string') {
      try {
        if (user.role === 'guide') {
          await sendGuideApprovedEmail(userEmail, firstName);
        } else {
          await sendAgentApprovedEmail(userEmail, firstName);
        }
      } catch (emailErr) {
        console.error('[admin/user/approve] approval email failed', emailErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        user.role === 'agent'
          ? 'Agent approved.'
          : (user as { is_operator?: boolean }).is_operator
            ? 'Tour operator approved.'
            : (user as { managed_by_operator_id?: string | null }).managed_by_operator_id
              ? 'Managed guide approved.'
              : 'Guide approved.',
    });
  } catch (e) {
    console.error('[admin/user/approve] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
