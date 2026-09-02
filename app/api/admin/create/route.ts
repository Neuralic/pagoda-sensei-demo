import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/create
 * Create a new admin user
 * Requires: Current user must be an admin
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const currentUserId = jar.get('userId')?.value;
    const currentRole = jar.get('role')?.value;

    // Verify current user is an admin
    if (currentRole !== 'admin' || !currentUserId) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    // Verify admin exists in database
    const supabase = getSupabaseServer();
    const { data: currentAdmin, error: adminCheckError } = await supabase
      .from('admin')
      .select('id, is_active')
      .eq('id', currentUserId)
      .eq('is_active', true)
      .single();

    if (adminCheckError || !currentAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    // Parse request body
    const { email, password, firstName, lastName } = await req.json();

    if (!email || !password || !firstName) {
      return NextResponse.json(
        { ok: false, error: 'Email, password, and first name are required.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid email format.' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    // Check if admin with this email already exists
    const { data: existingAdmin, error: existingError } = await supabase
      .from('admin')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingError) {
      console.error('[admin_create] check existing error', existingError);
      return NextResponse.json(
        { ok: false, error: 'Database error checking existing admin.' },
        { status: 500 }
      );
    }

    if (existingAdmin) {
      return NextResponse.json(
        { ok: false, error: 'An admin with this email already exists.' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create new admin
    const { data: newAdmin, error: createError } = await supabase
      .from('admin')
      .insert({
        email,
        password: passwordHash,
        first_name: firstName,
        last_name: lastName || null,
        is_active: true,
      })
      .select('id, email, first_name, last_name, created_at')
      .single();

    if (createError || !newAdmin) {
      console.error('[admin_create] create error', createError);
      return NextResponse.json(
        { ok: false, error: 'Failed to create admin user.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Admin user created successfully.',
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        firstName: newAdmin.first_name,
        lastName: newAdmin.last_name,
        createdAt: newAdmin.created_at,
      },
    });
  } catch (e) {
    console.error('[admin_create] exception', e);
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

