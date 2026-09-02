import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/list
 * Get list of all administrators
 * Requires: Admin authentication
 */
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const userId = jar.get("userId")?.value;
    const role = jar.get("role")?.value;

    // Verify current user is an admin
    if (role !== "admin" || !userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();

    // Verify admin exists and is active
    const { data: currentAdmin, error: adminCheckError } = await supabase
      .from("admin")
      .select("id, is_active")
      .eq("id", userId)
      .eq("is_active", true)
      .single();

    if (adminCheckError || !currentAdmin) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    // Fetch all admins (excluding password for security)
    const { data: admins, error } = await supabase
      .from("admin")
      .select("id, email, first_name, last_name, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin_list] error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch administrators" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      admins: admins || [],
    });
  } catch (err) {
    console.error("[admin_list] exception:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

