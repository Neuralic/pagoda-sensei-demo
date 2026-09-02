import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendVerificationEmail } from '@/lib/mailer';
import { verificationCodeExpiresAt } from '@/lib/verification-code';
import { findUserByEmail, normalizeEmail } from '@/lib/register-identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, role: rawRole } = await req.json();
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    const role =
      rawRole === 'guide' || rawRole === 'agent' ? String(rawRole) : undefined;
    if (!email) return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 });

    const supabaseServer = getSupabaseServer();
    const user = await findUserByEmail(supabaseServer, email, {
      ...(role ? { role } : {}),
      preferUnverified: true,
    });
    if (!user) return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });

    const code = (Math.floor(100000 + Math.random() * 900000)).toString().slice(0, 6);
    const expiresAt = verificationCodeExpiresAt();

    const { error: insertErr } = await supabaseServer
      .from('email_verification_codes')
      .insert({ user_id: user.id, code, expires_at: expiresAt });

    if (insertErr) return NextResponse.json({ ok: false, error: 'Failed to generate code.' }, { status: 500 });

    const mail = await sendVerificationEmail(email, code, "verification");
    const isProd = process.env.NODE_ENV === 'production';
    return NextResponse.json({
      ok: true,
      ...(mail && 'fallback' in mail && mail.fallback && !isProd ? { devCode: code } : {}),
    });
  } catch (e) {
    console.error('[resend] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
