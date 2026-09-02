import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { findUserByEmail, normalizeEmail } from '@/lib/register-identity';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  
  try {
    const body = await req.json();
    
    const { email: rawEmail, code } = body;
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    if (!email || !code) {
      return NextResponse.json({ ok: false, error: 'Email and code are required.' }, { status: 400 });
    }

    const limited = await assertAuthRateLimit(req, 'verify-reset', email);
    if (limited) return limited;


    const supabaseServer = getSupabaseServer();
    
    const matched = await findUserByEmail(supabaseServer, email);
    if (!matched) {
      return NextResponse.json({ ok: false, error: 'Invalid code.' }, { status: 400 });
    }
    const user = matched;


    // Verify code
    const nowIso = new Date().toISOString();
    const { data: resetCode, error: codeErr } = await supabaseServer
      .from('password_reset_codes')
      .select('id, expires_at')
      .eq('user_id', user.id)
      .eq('code', code)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (codeErr || !resetCode) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired code.' }, { status: 400 });
    }


    // Generate token
    const token = crypto.randomUUID();

    // Store token
    const { error: tokenErr } = await supabaseServer
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

    if (tokenErr) {
      console.error('Token insert error:', tokenErr);
      return NextResponse.json({ ok: false, error: 'Failed to verify code.' }, { status: 500 });
    }

    // Delete used code
    await supabaseServer
      .from('password_reset_codes')
      .delete()
      .eq('id', resetCode.id);

    return NextResponse.json({ 
      ok: true, 
      token,
      message: 'Code verified.' 
    });
  } catch (e) {
    console.error('Exception in verify-reset-code:', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}