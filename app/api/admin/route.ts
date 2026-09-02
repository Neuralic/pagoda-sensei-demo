import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { applyAuthSessionCookies } from '@/lib/auth-session-cookies';
import { assertAuthRateLimit } from '@/lib/auth-rate-limit';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { cookies } from 'next/headers';
import { clearImpersonationCookies } from '@/lib/admin-impersonation';

const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8sKq0e0e0e0e0e0e0e0e0e0e0e0e';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const limited = await assertAuthRateLimit(req, 'login-admin', String(email || ''));
    if (limited) return limited;

    const supabase = getSupabaseServer();

    // Fetch admin from admin table
    const { data: admin, error } = await supabase
      .from('admin')
      .select('id, password, first_name, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[admin_login] supabase error', error);
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    if (!admin || !admin.password) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    if (admin.is_active === false) {
      return NextResponse.json(
        { ok: false, error: 'Your account is inactive.' },
        { status: 403 }
      );
    }

    // Compare password
    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return NextResponse.json(
        { ok: false, error: 'Invalid credentials.' },
        { status: 401 }
      );
    }

    // Create response with session cookies
    const res = NextResponse.json({
      ok: true,
      role: "admin",
      adminId: admin.id,
      name: admin.first_name,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    await applyAuthSessionCookies(res, {
      userId: admin.id,
      role: 'admin',
      isProduction,
    });
    // Drop leftover overall-access cookies from a prior session
    clearImpersonationCookies(res, isProduction);

    return res;

  } catch (e) {
    console.error('[admin_login] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
    const jar = await cookies();
    const userId = jar.get('userId')?.value;
    const role = jar.get('role')?.value;

    if (!userId) {
        return NextResponse.json({ ok: false, user: null });
    }

    // If role is admin, fetch from admin table, otherwise from users table
     const supabase = getSupabaseServer();

    if (role === 'admin') {
        // Fetch admin from admin table
        const { data: admin, error } = await supabase
            .from('admin')
            .select('id, first_name, last_name, email')
            .eq('id', userId)
            .single();

        if (error || !admin) {
            return NextResponse.json({ ok: false, user: null });
        }

        const normalized = {
            id: admin.id,
            name: admin.first_name,
            lastName: admin.last_name || null,
            email: admin.email,
            role: 'admin',
        };

        return NextResponse.json({ ok: true, user: normalized });
    } else {
        // Fetch user from users table (for agents/guides)
    const { data: user, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .eq('id', userId)
        .single();

    if (error || !user) {
        return NextResponse.json({ ok: false, user: null });
    }

    const normalized = {
        id: user.id,
        name: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role || role,
    };

    return NextResponse.json({ ok: true, user: normalized });
    }
}