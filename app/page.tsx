import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { canPerformFullActivity } from '@/lib/activity-approval';

export default async function Home() {
  const jar = await cookies();
  const session = jar.get('session')?.value;
  const role = jar.get('role')?.value;
  const userId = jar.get('userId')?.value;

  if (session && userId && (role === 'agent' || role === 'guide')) {
    const supabase = getSupabaseServer();
    const { data: row } = await supabase
      .from('users')
      .select('role, guide_approved')
      .eq('id', userId)
      .maybeSingle();
    if (row && !canPerformFullActivity(row)) {
      redirect(role === 'agent' ? '/agent/profile' : '/settings');
    }
  }

  if (session) {
    if (role === 'agent') redirect('/agent/itineraries');
    if (role === 'guide') redirect('/guide/landing');
    if (role === 'admin') redirect('/admin/dashboard');
    redirect('/agent/itineraries');
  }

  redirect('/agent/login');
}