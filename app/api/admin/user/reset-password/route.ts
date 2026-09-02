import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { passwordMeetsAdminResetPolicy } from '@/lib/admin-password-policy';

export const runtime = 'nodejs';

/**
 * POST /api/admin/user/reset-password
 * Set a new password for an agent or guide. Admin only.
 * Body: { userId: string | number, newPassword: string }
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

    const body = (await req.json().catch(() => ({}))) as {
      userId?: unknown;
      newPassword?: unknown;
    };

    const rawUserId = body?.userId;
    const userId =
      rawUserId !== undefined && rawUserId !== null && rawUserId !== ''
        ? String(rawUserId)
        : null;

    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Valid userId is required.' }, { status: 400 });
    }

    if (!passwordMeetsAdminResetPolicy(newPassword)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Password must be 8–200 characters with lowercase, uppercase, a number, and a symbol (see policy in the admin form).',
        },
        { status: 400 }
      );
    }

    const { data: target, error: userErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (userErr || !target) {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }

    if (target.role !== 'agent' && target.role !== 'guide') {
      return NextResponse.json(
        { ok: false, error: 'Password reset is only allowed for agent and guide accounts.' },
        { status: 403 }
      );
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash, updated_at: now })
      .eq('id', userId);

    if (updateErr) {
      console.error('[admin/user/reset-password] update', updateErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to update password.' },
        { status: 500 }
      );
    }

    await supabase.from('password_reset_tokens').delete().eq('user_id', userId);
    await supabase.from('password_reset_codes').delete().eq('user_id', userId);

    return NextResponse.json({ ok: true, message: 'Password updated.' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('[admin/user/reset-password]', e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
