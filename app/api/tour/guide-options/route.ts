import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { fetchTourGuideOptions } from "@/lib/guide-tour-assignments";

export const runtime = "nodejs";

/**
 * Guide/operator options for linking a published profile to a Tour Library tour.
 * Returns self + roster (when applicable).
 */
export async function GET(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;
    if (!userId || (role !== "guide" && role !== "admin")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const operatorIdParam = (searchParams.get("operatorId") || "").trim();
    // Admins editing another user's tour must load that operator's roster.
    const operatorId =
      role === "admin" && operatorIdParam ? operatorIdParam : userId;

    const supabase = getSupabaseServer();
    const options = await fetchTourGuideOptions(supabase, operatorId);
    return NextResponse.json({
      ok: true,
      options,
      selfGuideId: operatorId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
