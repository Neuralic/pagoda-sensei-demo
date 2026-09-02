import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { applyAuthSessionCookies } from '@/lib/auth-session-cookies';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { findUserByEmail, normalizeEmail } from '@/lib/register-identity';

const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8sKq0e0e0e0e0e0e0e0e0e0e0e0e';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, password } = await req.json();
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const limited = await assertAuthRateLimit(req, 'login-agent', email);
    if (limited) return limited;

    const supabaseServer = getSupabaseServer();
    const matched = await findUserByEmail(supabaseServer, email, { role: 'agent' });
    if (!matched) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    const { data: user, error } = await supabaseServer
      .from('users')
      .select('id, password_hash, is_verified, is_active, role, first_name')
      .eq('id', matched.id)
      .single();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });
    }

    // ❌ Block guide
    if (user.role === 'guide') {
      return NextResponse.json(
        { ok: false, error: 'Only agents can log in.' },
        { status: 403 }
      );
    }

    // ❌ Block unexpected roles for safety
    if (user.role !== 'agent') {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized role.' },
        { status: 403 }
      );
    }

    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { ok: false, error: 'Your account is inactive.' },
        { status: 403 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    if (!user.is_verified) {
      return NextResponse.json(
        {
          ok: false,
          needsVerification: true,
          error: 'Please verify your email first.',
        },
        { status: 403 }
      );
    }

    // === Successful login ===
    const res = NextResponse.json({
      ok: true,
      role: user.role,
      userId: user.id,
      name: user.first_name,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    await applyAuthSessionCookies(res, {
      userId: user.id,
      role: user.role,
      isProduction,
    });

    return res;
  } catch (error) {
    console.error('[login] exception', error);

    return NextResponse.json(
      { ok: false, error: 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
