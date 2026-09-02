import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthCookieClearOptions } from '@/lib/auth-session-cookies';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { broadcastUserPresenceUpdate } from '@/lib/admin-presence-broadcast';
import { clearImpersonationCookies, isImpersonating } from '@/lib/admin-impersonation';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  const userId = jar.get('userId')?.value;
  const role = jar.get('role')?.value;
  const impersonating = isImpersonating(jar);

  // Do not mark the real user's presence offline when an admin is only viewing as them.
  if (userId && (role === 'agent' || role === 'guide') && !impersonating) {
    const now = new Date().toISOString();
    try {
      const supabase = getSupabaseServer();
      await supabase
        .from('users')
        .update({
          presence_state: 'offline',
          presence_updated_at: now,
        })
        .eq('id', userId);
      broadcastUserPresenceUpdate({
        userId,
        presence_state: 'offline',
        presence_updated_at: now,
      });
    } catch {
      // non-blocking
    }
  }

  const res = NextResponse.json({ ok: true });
  const clearOpts = getAuthCookieClearOptions(process.env.NODE_ENV === 'production');
  res.cookies.set('session', '', clearOpts);
  res.cookies.set('role', '', clearOpts);
  res.cookies.set('userId', '', clearOpts);
  clearImpersonationCookies(res, process.env.NODE_ENV === 'production');
  return res;
}
