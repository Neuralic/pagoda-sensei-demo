import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    urlPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  try {
    // Perform a cheap head-count select to validate DB connectivity.
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: true, env, db: { ok: false, error: error.message } });
    }

    return NextResponse.json({ ok: true, env, db: { ok: true } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, env, error: message }, { status: 500 });
  }
}
