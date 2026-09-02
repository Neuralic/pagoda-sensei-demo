import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { denyIfActivityNotApproved } from '@/lib/activity-approval'
import { BUCKETS } from '@/lib/buckets'
import { fetchAssignedToursForGuide } from '@/lib/guide-tour-assignments'
import { guideTierLabel, isGuideTier } from '@/lib/guide-tier'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const userId = id

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing id param", profile: null, user: null },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer()

    const jar = await cookies()
    const sessionUserId = jar.get('userId')?.value
    if (sessionUserId && sessionUserId !== userId) {
      const block = await denyIfActivityNotApproved(sessionUserId, supabase)
      if (block) return block
    }

    // 1️⃣ Get profile by user_id (the id param is a user_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: "Database error", profile: null, user: null },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Profile not found", profile: null, user: null },
        { status: 404 }
      );
    }

    // 2️⃣ Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, role, first_name, last_name, created_at, phone, country, city, guide_number, guide_tier, is_verified, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      return NextResponse.json(
        { ok: false, error: "User fetch error", profile: null, user: null },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found", profile: null, user: null },
        { status: 404 }
      );
    }

    // 3️⃣ Add avatarUrl if exists
    let avatarUrl: string | null = null;

    if (profile.profile_picture_path) {
      try {
        const { data: signedUrl } = await supabase.storage
          .from(BUCKETS.avatars)
          .createSignedUrl(profile.profile_picture_path, 60 * 60 * 24 * 7);

        avatarUrl = signedUrl?.signedUrl || null;
      } catch (error) {
        console.error('Error getting signed URL for profile picture', error);
        avatarUrl = null;
      }
    }

    // Get reviews for this user (only visible ones)
    const { data: reviews } = await supabase
      .from("reviews")
      .select(`
        id,
        rating,
        comment,
        created_at,
        reviewer:users!reviews_reviewer_id_fkey(id, first_name, last_name, role)
      `)
      .eq("reviewee_id", userId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(10); // Get latest 10 reviews

    let assignedTours: Awaited<ReturnType<typeof fetchAssignedToursForGuide>> = []
    let marketplaceAvailable = true
    if (user.role === 'guide') {
      assignedTours = await fetchAssignedToursForGuide(supabase, userId, { publishedOnly: true })
      const { data: profRow } = await supabase
        .from('profiles')
        .select('marketplace_available')
        .eq('user_id', userId)
        .maybeSingle()
      marketplaceAvailable = profRow?.marketplace_available !== false
    }

    const tier = isGuideTier(user.guide_tier as string) ? user.guide_tier : 'professional'

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        name: user.first_name || '',
        lastName: user.last_name || '',
        phone: user.phone || null,
        country: user.country || null,
        city: user.city || null,
        guide_number: user.guide_number || null,
        guideNumber: user.guide_number || null,
        is_verified: user.is_verified || false,
        is_active: user.is_active !== undefined ? user.is_active : true,
        created_at: user.created_at || null,
        createdAt: user.created_at || null,
        guideTier: tier,
        guideTierLabel: guideTierLabel(tier as string),
        marketplaceAvailable,
      },
      profile: { ...profile, avatarUrl },
      reviews: reviews || [],
      assignedTours,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json(
      { ok: false, error: msg, profile: null, user: null },
      { status: 500 }
    );
  }
}
