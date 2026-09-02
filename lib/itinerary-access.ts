import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { denyIfActivityNotApproved } from "@/lib/activity-approval";
import { readVerifiedSessionCookies } from "@/lib/auth-session-token";
import { getSupabaseServer } from "@/lib/supabaseServer";

export type ItineraryAccessRow = {
  id: string;
  user_id: string;
  build_mode?: string | null;
};

export type SessionActor = {
  userId: string;
  role: string;
  isAdmin: boolean;
};

export async function getSessionActor(): Promise<SessionActor | null> {
  const jar = await cookies();
  const verified = await readVerifiedSessionCookies(jar);
  if (!verified) return null;
  return {
    userId: verified.userId,
    role: verified.role,
    isAdmin: verified.role === "admin",
  };
}

async function assertLiveSessionAccount(
  actor: SessionActor
): Promise<NextResponse | null> {
  const supabase = getSupabaseServer();
  if (actor.isAdmin) {
    const { data } = await supabase
      .from("admin")
      .select("id, is_active")
      .eq("id", actor.userId)
      .maybeSingle();
    if (!data || data.is_active === false) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select("id, is_active")
    .eq("id", actor.userId)
    .maybeSingle();
  if (!data || data.is_active === false) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  return null;
}

export async function requireSessionActor(): Promise<
  { ok: true; actor: SessionActor } | { ok: false; response: NextResponse }
> {
  const actor = await getSessionActor();
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }),
    };
  }
  const live = await assertLiveSessionAccount(actor);
  if (live) {
    return { ok: false, response: live };
  }
  return { ok: true, actor };
}

/** Skips pending-approval gate for admins (admin ids are not in users table). */
export async function denyActivityUnlessAdmin(
  actor: SessionActor,
  supabase: SupabaseClient
): Promise<NextResponse | null> {
  if (actor.isAdmin) return null;
  return denyIfActivityNotApproved(actor.userId, supabase);
}

export function adminMayEditItinerary(_row?: Pick<ItineraryAccessRow, "build_mode">): boolean {
  // Overall access: admins can read/write every itinerary from the admin console.
  return true;
}

export async function fetchItineraryAccessRow(
  supabase: SupabaseClient,
  itineraryId: string
): Promise<
  { ok: true; row: ItineraryAccessRow } | { ok: false; response: NextResponse }
> {
  const { data, error } = await supabase
    .from("itineraries")
    .select("id, user_id, build_mode")
    .eq("id", itineraryId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Database error" }, { status: 500 }),
    };
  }
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }),
    };
  }
  return { ok: true, row: data as ItineraryAccessRow };
}

export async function assertItineraryAccess(
  supabase: SupabaseClient,
  actor: SessionActor,
  itineraryId: string,
  mode: "read" | "write" = "read"
): Promise<
  | { ok: true; ownerUserId: string; row: ItineraryAccessRow }
  | { ok: false; response: NextResponse }
> {
  const fetched = await fetchItineraryAccessRow(supabase, itineraryId);
  if (!fetched.ok) return fetched;

  const { row } = fetched;

  if (actor.isAdmin) {
    return { ok: true, ownerUserId: row.user_id, row };
  }

  if (row.user_id !== actor.userId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }),
    };
  }

  if (mode === "write" && actor.role !== "agent" && actor.role !== "agency") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, ownerUserId: row.user_id, row };
}

export async function assertJobItineraryAccess(
  supabase: SupabaseClient,
  actor: SessionActor,
  jobId: string,
  mode: "read" | "write" = "write"
): Promise<
  | { ok: true; ownerUserId: string; itineraryId: string; row: ItineraryAccessRow }
  | { ok: false; response: NextResponse }
> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, itinerary_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Database error" }, { status: 500 }),
    };
  }
  if (!job?.itinerary_id) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }),
    };
  }

  const access = await assertItineraryAccess(supabase, actor, job.itinerary_id, mode);
  if (!access.ok) return access;

  return {
    ok: true,
    ownerUserId: access.ownerUserId,
    itineraryId: job.itinerary_id,
    row: access.row,
  };
}

/** Drop-in replacement for transferz routes' assertItineraryOwnedBy. */
export async function assertItineraryOwnedBySession(
  supabase: SupabaseClient,
  itineraryId: string
): Promise<{ ok: true; ownerUserId: string } | { ok: false; response: NextResponse }> {
  const session = await requireSessionActor();
  if (!session.ok) return session;

  const access = await assertItineraryAccess(supabase, session.actor, itineraryId, "write");
  if (!access.ok) return access;

  return { ok: true, ownerUserId: access.ownerUserId };
}
