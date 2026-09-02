import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSessionActor } from "@/lib/itinerary-access";

export async function requireAdmin() {
  const actor = await getSessionActor();
  if (!actor?.isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  const supabase = getSupabaseServer();
  const { data: admin, error } = await supabase
    .from("admin")
    .select("id, is_active")
    .eq("id", actor.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !admin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, userId: actor.userId, supabase };
}
