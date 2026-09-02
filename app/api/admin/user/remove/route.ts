import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/admin/user/remove
 * Permanently remove a user and all related data. Admin only.
 * Body: { userId: string } (users.id, UUID)
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const adminId = jar.get('userId')?.value;
    const role = jar.get('role')?.value;

    if (role !== 'admin' || !adminId) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();
    const { data: admin } = await supabase
      .from('admin')
      .select('id')
      .eq('id', adminId)
      .eq('is_active', true)
      .single();

    if (!admin) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    if (userId === undefined || userId === null || userId === '') {
      return NextResponse.json(
        { ok: false, error: 'Valid userId is required.' },
        { status: 400 }
      );
    }
    const userIdStr = String(userId);

    // Prevent deleting self if admin id matches user id
    if (adminId === userIdStr) {
      return NextResponse.json(
        { ok: false, error: 'You cannot remove your own admin user account from this page.' },
        { status: 400 }
      );
    }

    // Verify user exists
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', userIdStr)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // 1) Panic
    await supabase.from('panic').delete().eq('sender_id', userIdStr);

    // 2) Chat message reactions
    await supabase.from('chat_message_reactions').delete().eq('user_id', userIdStr);

    // 3) Chat participants
    await supabase.from('chat_participants').delete().eq('user_id', userIdStr);

    // 4) Chats where user is agency or guide: delete messages, then participants, then chats
    const { data: userChats } = await supabase
      .from('chats')
      .select('id')
      .or(`agency_id.eq.${userIdStr},guide_id.eq.${userIdStr}`);
    const chatIds = (userChats ?? []).map((c) => c.id);
    if (chatIds.length > 0) {
      await supabase.from('chat_messages').delete().in('chat_id', chatIds);
      await supabase.from('chat_participants').delete().in('chat_id', chatIds);
      await supabase.from('chats').delete().in('id', chatIds);
    }

    // 5) Reviews where user is reviewer or reviewee
    await supabase.from('reviews').delete().eq('reviewer_id', userIdStr);
    await supabase.from('reviews').delete().eq('reviewee_id', userIdStr);

    // 6) Job hiring history where user is agent or guide: delete job_end_requests first, then hiring history
    const { data: hiringRows } = await supabase
      .from('job_hiring_history')
      .select('id')
      .or(`agent_id.eq.${userIdStr},guide_id.eq.${userIdStr}`);
    const hiringIds = (hiringRows ?? []).map((h) => h.id);
    if (hiringIds.length > 0) {
      await supabase.from('job_end_requests').delete().in('hiring_history_id', hiringIds);
      await supabase.from('job_hiring_history').delete().in('id', hiringIds);
    }

    // 8) Job applications by this user
    await supabase.from('job_applications').delete().eq('applicant_id', userIdStr);

    // 9) Jobs owned by this user: delete reviews, job_end_requests, job_hiring_history, job_applications, then jobs
    const { data: ownedJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('created_by', userIdStr);
    const jobIds = (ownedJobs ?? []).map((j) => j.id);
    if (jobIds.length > 0) {
      await supabase.from('reviews').delete().in('job_id', jobIds);
      const { data: ownedHiring } = await supabase
        .from('job_hiring_history')
        .select('id')
        .in('job_id', jobIds);
      const ownedHiringIds = (ownedHiring ?? []).map((h) => h.id);
      if (ownedHiringIds.length > 0) {
        await supabase.from('job_end_requests').delete().in('hiring_history_id', ownedHiringIds);
      }
      await supabase.from('job_hiring_history').delete().in('job_id', jobIds);
      await supabase.from('job_applications').delete().in('job_id', jobIds);
      await supabase.from('jobs').delete().in('id', jobIds);
    }

    // 10) Itineraries (user_id)
    await supabase.from('itineraries').delete().eq('user_id', userIdStr);

    // 11) Tour (user_id)
    await supabase.from('tour').delete().eq('user_id', userIdStr);

    // 12) Guide commission settings
    await supabase.from('guide_commission_settings').delete().eq('user_id', userIdStr);

    // 13) Email verification codes
    await supabase.from('email_verification_codes').delete().eq('user_id', userIdStr);

    // 14) Password reset (if tables use user_id)
    const { error: _prTokens } = await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', userIdStr);
    const { error: _prCodes } = await supabase
      .from('password_reset_codes')
      .delete()
      .eq('user_id', userIdStr);
    // Ignore errors if tables/columns don't exist

    // 15) Profiles
    await supabase.from('profiles').delete().eq('user_id', userIdStr);

    // 16) Public users row
    const { error: deleteUserErr } = await supabase.from('users').delete().eq('id', userIdStr);
    if (deleteUserErr) {
      console.error('[admin/user/remove] users delete error', deleteUserErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to remove user record.' },
        { status: 500 }
      );
    }

    // 17) Auth user (Supabase Auth)
    const { error: authErr } = await supabase.auth.admin.deleteUser(userIdStr);
    if (authErr) {
      console.error('[admin/user/remove] auth delete error', authErr);
      // User row is already deleted; log but don't fail the request
    }

    return NextResponse.json({ ok: true, message: 'User and all related data removed.' });
  } catch (e) {
    console.error('[admin/user/remove] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
