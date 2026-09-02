import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendVerificationEmail } from '@/lib/mailer';
import { findUserByEmail, normalizeEmail } from '@/lib/register-identity';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { email: rawEmail } = await req.json();
        const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
        if (!email) {
            return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 });
        }

        const limited = await assertAuthRateLimit(req, 'forgot-password', email);
        if (limited) return limited;

        const supabaseServer = getSupabaseServer();

        const user = await findUserByEmail(supabaseServer, email);

        // Don't reveal if user exists for security
        if (!user) {
            return NextResponse.json({
                ok: true,
                message: 'If an account with that email exists, a reset code has been sent.'
            });
        }

        if (!user.is_verified) {
            return NextResponse.json({
                ok: false,
                error: 'Please verify your email first.'
            }, { status: 403 });
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

        // Store reset code
        const { error: codeErr } = await supabaseServer
            .from('password_reset_codes')
            .insert({
                user_id: user.id,
                code,
                expires_at: expiresAt,
            });

        if (codeErr) {
            console.error('[forgot-password] code insert error', codeErr);
            return NextResponse.json({ ok: false, error: 'Failed to generate reset code.' }, { status: 500 });
        }

        // Use the SAME email function that works for verification
        const mail = await sendVerificationEmail(email, code, "reset");

        const isProd = process.env.NODE_ENV === 'production';

        // REMOVED: No longer returning devCode for auto-fill
        return NextResponse.json({
            ok: true,
            message: 'Reset code sent to your email.',
            ...(mail && 'fallback' in mail && mail.fallback && !isProd ? { devCode: code } : {}),
        });
    } catch (e) {
        console.error('[forgot-password] exception', e);
        const message = e instanceof Error ? e.message : 'Unexpected error.';
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}