import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthCookieClearOptions } from '@/lib/auth-session-cookies';
import { supabase } from '@/lib/supabase';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { broadcastUserPresenceUpdate } from '@/lib/admin-presence-broadcast';
import { canPerformFullActivity } from '@/lib/activity-approval';

export const dynamic = 'force-dynamic';

/** Clear auth cookies (same as logout) so the client is logged out. */
function clearAuthCookies(res: NextResponse) {
    const clearOpts = getAuthCookieClearOptions(process.env.NODE_ENV === 'production');
    res.cookies.set('session', '', clearOpts);
    res.cookies.set('role', '', clearOpts);
    res.cookies.set('userId', '', clearOpts);
}

export async function GET() {
    const jar = await cookies();
    const userId = jar.get('userId')?.value;
    const role = jar.get('role')?.value;

    if (!userId) {
        return NextResponse.json({ ok: false, user: null });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role, guide_number, country, city, guide_approved, is_active')
        .eq('id', userId)
        .single();

    if (error || !user) {
        return NextResponse.json({ ok: false, user: null });
    }

    // If guide/agent is suspended, log them out: clear cookies and return 401 so client redirects to login
    const userRole = (user.role || role) as string;
    if ((userRole === 'guide' || userRole === 'agent') && (user as { is_active?: boolean }).is_active === false) {
        const now = new Date().toISOString();
        try {
            const srv = getSupabaseServer();
            await srv
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
            /* ignore */
        }
        const res = NextResponse.json(
            { ok: false, user: null, suspended: true, suspendedRole: userRole },
            { status: 401 }
        );
        clearAuthCookies(res);
        return res;
    }

    const normalized = {
        id: user.id,
        name: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role || role,
        guideNumber: user.guide_number || '',
        country: user.country || '',
        city: user.city || '',
        guideApproved: canPerformFullActivity({
            role: user.role || role,
            guide_approved: user.guide_approved,
        }),
    };

    return NextResponse.json({ ok: true, user: normalized });
}





// import { NextResponse } from 'next/server';
// import { cookies } from 'next/headers';
// import { supabase } from '@/lib/supabase';

// export const dynamic = 'force-dynamic';

// export async function GET() {
//     const jar = await cookies();
//     const userId = jar.get('userId')?.value;
//     const role = jar.get('role')?.value;

//     if (!userId) {
//         return NextResponse.json({ ok: false, user: null });
//     }

//     const { data: user, error } = await supabase
//         .from('users')
//         .select('id, first_name, last_name, email, phone, country, city, guide_number, languages, has_valid_license, years_experience, role')
//         .eq('id', userId)
//         .single();

//     if (error || !user) {
//         return NextResponse.json({ ok: false, user: null });
//     }

//     const normalized = {
//         id: user.id,
//         firstName: user.first_name,
//         lastName: user.last_name,
//         email: user.email,
//         phone: user.phone || '',
//         country: user.country || '',
//         city: user.city || '',
//         guideNumber: user.guide_number || '',
//         languages: user.languages || [],
//         hasValidLicense: user.has_valid_license || false,
//         yearsExperience: user.years_experience || 0,
//         role: user.role || role,
//     };

//     return NextResponse.json({ ok: true, user: normalized });
// }