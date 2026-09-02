import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'
import { BUCKETS } from '@/lib/buckets'
import { applySelfGuideProfileUpdate, parseSelfProfileBody } from '@/lib/guide-self-profile'
import { computeProfileCompleteness } from '@/lib/profile-completeness'
import { buildPublicProfileUrl } from '@/lib/profile-refresh'

export const dynamic = 'force-dynamic'

const FIELDS = [
  'bio',
  'street',
  'country',
  'city',
  'postal',
  'website',
  'contact_email',
  'languages',
  'specialties',
  'profile_picture_path',
  'cover_image_path',
  'intro_video_path',
  'intro_photos_paths',
  'document',
] as const

type ProfilePayload = Partial<Record<(typeof FIELDS)[number], unknown>>

export async function GET() {
 const jar = await cookies()
  const userId = jar.get('userId')?.value

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated", profile: null, user: null },
      { status: 401 }
    );
  }

  const supabase = getSupabaseServer();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: "Database error", profile: null, user: null },
      { status: 500 }
    );
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, role, created_at, phone, first_name, last_name, is_operator, managed_by_operator_id, guide_approved")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    return NextResponse.json(
      { ok: false, error: "User fetch error", profile: null, user: null },
      { status: 500 }
    );
  }

  let managedByOperatorName: string | null = null
  const managedById = (user as { managed_by_operator_id?: string | null })?.managed_by_operator_id
  if (managedById) {
    const { data: op } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', managedById)
      .maybeSingle()
    if (op) {
      managedByOperatorName = `${op.first_name || ''} ${op.last_name || ''}`.trim()
    }
  }

  let avatarUrl: string | null = null;

  if (profile?.profile_picture_path) {
    try {
      const { data: signed } = await supabase.storage
        .from(BUCKETS.avatars)
        .createSignedUrl(profile.profile_picture_path as string, 60 * 60 * 24);
      avatarUrl = signed?.signedUrl ?? null;
    } catch {
      avatarUrl = null;
    }
  }

  let resolvedProfile = profile
  const role = (user as { role?: string } | null)?.role
  if ((role === 'guide' || role === 'agent' || role === 'agency') && userId) {
    if (!profile) {
      const { ensureGuideMarketplaceProfile } = await import('@/lib/ensure-guide-marketplace-profile')
      await ensureGuideMarketplaceProfile(supabase, userId)
    } else if (role === 'guide' && !profile.profile_slug) {
      const { ensureGuideMarketplaceProfile } = await import('@/lib/ensure-guide-marketplace-profile')
      await ensureGuideMarketplaceProfile(supabase, userId)
    }
    const { data: refreshed } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (refreshed) resolvedProfile = refreshed
  }

  const slug = resolvedProfile?.profile_slug as string | null | undefined
  const published = resolvedProfile?.guide_profile_status === 'published'

  return NextResponse.json({
    ok: true,
    user: user
      ? {
          ...user,
          isOperator: Boolean((user as { is_operator?: boolean }).is_operator),
          isManagedGuide: Boolean(managedById),
          managedByOperatorName,
        }
      : null,
    profile: resolvedProfile
      ? {
          ...resolvedProfile,
          avatarUrl,
          publicProfileUrl: buildPublicProfileUrl(slug ?? null, { published }),
        }
      : null,
    profileCompleteness: computeProfileCompleteness(
      resolvedProfile as Record<string, unknown> | null
    ),
  });
}
export async function PUT(req: Request) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as ProfilePayload & Record<string, unknown>
    const payload: Record<string, unknown> = {}

    for (const key of FIELDS) {
      if (key in body) {
        const val = body[key]
        if (key === 'languages' || key === 'specialties' || key === 'intro_photos_paths' || key === 'document') {
          if (Array.isArray(val) && val.every((v) => typeof v === 'string')) payload[key] = val
        } else if (
          key === 'bio' ||
          key === 'street' ||
          key === 'country' ||
          key === 'city' ||
          key === 'postal' ||
          key === 'website' ||
          key === 'contact_email' ||
          key === 'profile_picture_path' ||
          key === 'cover_image_path' ||
          key === 'intro_video_path'
        ) {
          if (typeof val === 'string') payload[key] = val
        }
      }
    }

    const supabase = getSupabaseServer()

    const marketplaceInput = parseSelfProfileBody(body)
    const marketplaceResult = await applySelfGuideProfileUpdate(supabase, userId, marketplaceInput)
    if (marketplaceResult.error) {
      return NextResponse.json({ ok: false, error: marketplaceResult.error }, { status: 500 })
    }

    const { data: existing, error: exErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (exErr) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    if (Object.keys(payload).length > 0) {
      if (!existing) {
        const { ensureGuideMarketplaceProfile } = await import('@/lib/ensure-guide-marketplace-profile')
        const created = await ensureGuideMarketplaceProfile(supabase, userId)
        if ('error' in created) {
          return NextResponse.json({ ok: false, error: created.error }, { status: 500 })
        }
      }
      const { error } = await supabase.from('profiles').update(payload).eq('user_id', userId)
      if (error) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 })
    }

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    let avatarUrl: string | null = null
    if (updatedProfile?.profile_picture_path) {
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKETS.avatars)
          .createSignedUrl(updatedProfile.profile_picture_path as string, 60 * 60 * 24)
        avatarUrl = signed?.signedUrl ?? null
      } catch {
        avatarUrl = null
      }
    }

    const slug = updatedProfile?.profile_slug as string | null | undefined
    const published = updatedProfile?.guide_profile_status === 'published'

    return NextResponse.json({
      ok: true,
      profile: updatedProfile
        ? {
            ...updatedProfile,
            avatarUrl,
            publicProfileUrl: buildPublicProfileUrl(slug ?? null, { published }),
          }
        : null,
      profileCompleteness: computeProfileCompleteness(
        updatedProfile as Record<string, unknown> | null
      ),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
