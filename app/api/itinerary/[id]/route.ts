import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

// GET - Retrieve a specific itinerary
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('itinerary')
      .select('id, name, location, start_date, end_date, image, description, status, highlights, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true, itinerary: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// PUT - Update an itinerary (full or partial update)
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })

    const allowedFields = ['name', 'location', 'start_date', 'end_date', 'image', 'description', 'status', 'highlights']
    const updates: Record<string, unknown> = {}
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const supabase = getSupabaseServer()

    const { data: existingItinerary, error: fetchError } = await supabase
      .from('itinerary')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    if (!existingItinerary) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    const { data, error: updateError } = await supabase
      .from('itinerary')
      .update(updates)
      .eq('id', id)
      .select('id, name, location, start_date, end_date, image, description, status, highlights, created_at, updated_at')
      .single()

    if (updateError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true, itinerary: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
// In /api/itinerary/[id]/route.ts
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })

    const allowedFields = ['name', 'location', 'start_date', 'end_date', 'image', 'description', 'highlights', 'status']
    const updates: Record<string, unknown> = {}
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const supabase = getSupabaseServer()

    // Verify the itinerary exists and belongs to the user
    const { data: existingItinerary, error: fetchError } = await supabase
      .from('itinerary')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    if (!existingItinerary) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    // Update the itinerary
    const { data, error: updateError } = await supabase
      .from('itinerary')
      .update(updates)
      .eq('id', id)
      .select('id, name, location, start_date, end_date, image, description, highlights, status, created_at, updated_at')
      .single()

    if (updateError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true, itinerary: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
// DELETE - Remove an itinerary
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jar = await cookies()
    const userId = jar.get('userId')?.value
    if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const { id } = await context.params
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

    const supabase = getSupabaseServer()

    // First, verify the itinerary exists and belongs to the user
    const { data: existingItinerary, error: fetchError } = await supabase
      .from('itinerary')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    if (!existingItinerary) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    // Delete related jobs first (to maintain referential integrity)
    const { error: jobsDeleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('itinerary_id', id)

    if (jobsDeleteError) {
      console.error('Error deleting related jobs:', jobsDeleteError)
      return NextResponse.json({ ok: false, error: 'Failed to delete related jobs' }, { status: 500 })
    }

    // Delete the itinerary
    const { error: deleteError } = await supabase
      .from('itinerary')
      .delete()
      .eq('id', id)

    if (deleteError) return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })

    return NextResponse.json({ ok: true, message: 'Itinerary and related jobs deleted successfully' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

