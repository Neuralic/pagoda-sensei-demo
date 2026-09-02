import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { findUserByEmail, normalizeEmail } from '@/lib/register-identity';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, token, newPassword } = await req.json();
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    if (!email || !token || !newPassword) {
      return NextResponse.json({ ok: false, error: 'All fields are required.' }, { status: 400 });
    }

    const limited = await assertAuthRateLimit(req, 'reset-password', email);
    if (limited) return limited;

    if (newPassword.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const supabaseServer = getSupabaseServer();
    
    const matched = await findUserByEmail(supabaseServer, email);
    if (!matched) {
      return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
    }

    const { data: user, error: userErr } = await supabaseServer
      .from('users')
      .select('id, password_hash')
      .eq('id', matched.id)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
    }

    // Verify token
    const nowIso = new Date().toISOString();
    const { data: resetToken, error: tokenErr } = await supabaseServer
      .from('password_reset_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .gt('expires_at', nowIso)
      .single();

    if (tokenErr || !resetToken) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired token.' }, { status: 400 });
    }

    // Hash password (following your register pattern)
    const password_hash = await bcrypt.hash(newPassword, 10);

    // Update password (following your register pattern)
    const { error: updateErr } = await supabaseServer
      .from('users')
      .update({ 
        password_hash,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateErr) {
      console.error('[reset-password] update error', updateErr);
      return NextResponse.json({ ok: false, error: 'Failed to reset password.' }, { status: 500 });
    }

    // Delete used token
    await supabaseServer
      .from('password_reset_tokens')
      .delete()
      .eq('id', resetToken.id);

    // Clean up any remaining reset codes for this user
    await supabaseServer
      .from('password_reset_codes')
      .delete()
      .eq('user_id', user.id);

    return NextResponse.json({ 
      ok: true, 
      message: 'Password reset successfully.' 
    });
  } catch (e) {
    console.error('[reset-password] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

