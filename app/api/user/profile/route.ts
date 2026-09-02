import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  try {
    const { firstName, lastName } = await req.json();
    if (!firstName && !lastName) {
      return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
    }

    const jar = await cookies();
    const userId = jar.get('userId')?.value;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 });
    }

    const supabase = getSupabaseServer();
    const updates: Record<string, unknown> = {};
    if (typeof firstName === 'string') updates.first_name = firstName;
    if (typeof lastName === 'string') updates.last_name = lastName;

    const { error } = await supabase.from('users').update(updates).eq('id', userId);
    if (error) {
      console.error('[profile update] error', error);
      return NextResponse.json({ ok: false, error: 'Database error.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
