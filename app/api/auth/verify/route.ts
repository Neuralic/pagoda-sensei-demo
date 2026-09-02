import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { findUsersByEmail, normalizeEmail } from '@/lib/register-identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, code, role: rawRole } = await req.json();
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    const role =
      rawRole === 'guide' || rawRole === 'agent' ? String(rawRole) : undefined;
    if (!email || !code) {
      return NextResponse.json(
        { ok: false, error: 'Email and code are required.' },
        { status: 400 }
      );
    }

    const supabaseServer = getSupabaseServer();
    const candidates = await findUsersByEmail(supabaseServer, email, role ? { role } : undefined);
    if (!candidates.length) {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    let matchedUserId: string | null = null;
    let matchedCodeId: string | null = null;

    for (const user of candidates) {
      const { data: rec, error: codeErr } = await supabaseServer
        .from('email_verification_codes')
        .select('id, expires_at')
        .eq('user_id', user.id)
        .eq('code', code)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (codeErr || !rec) continue;
      if (rec.expires_at && rec.expires_at < nowIso) {
        return NextResponse.json({ ok: false, error: 'Code expired.' }, { status: 400 });
      }
      matchedUserId = user.id;
      matchedCodeId = rec.id;
      break;
    }

    if (!matchedUserId || !matchedCodeId) {
      return NextResponse.json({ ok: false, error: 'Invalid code.' }, { status: 400 });
    }

    const { error: updErr } = await supabaseServer
      .from('users')
      .update({ is_verified: true })
      .eq('id', matchedUserId);
    if (updErr) {
      return NextResponse.json({ ok: false, error: 'Failed to verify user.' }, { status: 500 });
    }

    await supabaseServer.from('email_verification_codes').delete().eq('id', matchedCodeId);

    const verified = candidates.find((c) => c.id === matchedUserId);
    return NextResponse.json({ ok: true, role: verified?.role ?? null });
  } catch (e) {
    console.error('[verify] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
