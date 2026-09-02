import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/remove
 * Permanently remove an administrator. Admin only.
 * Body: { adminId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const adminId = body?.adminId != null ? String(body.adminId).trim() : "";
    if (!adminId) {
      return NextResponse.json(
        { ok: false, error: "Valid adminId is required." },
        { status: 400 }
      );
    }

    if (adminId === auth.userId) {
      return NextResponse.json(
        { ok: false, error: "You cannot remove your own admin account." },
        { status: 400 }
      );
    }

    const { data: target, error: targetErr } = await auth.supabase
      .from("admin")
      .select("id, email, first_name, last_name, is_active")
      .eq("id", adminId)
      .maybeSingle();

    if (targetErr || !target) {
      return NextResponse.json(
        { ok: false, error: "Administrator not found." },
        { status: 404 }
      );
    }

    const { count: activeCount, error: countErr } = await auth.supabase
      .from("admin")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (countErr) {
      console.error("[admin/remove] count error", countErr);
      return NextResponse.json(
        { ok: false, error: "Failed to verify admin accounts." },
        { status: 500 }
      );
    }

    if (target.is_active && (activeCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cannot remove the last active administrator.",
        },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await auth.supabase
      .from("admin")
      .delete()
      .eq("id", adminId);

    if (deleteErr) {
      console.error("[admin/remove] delete error", deleteErr);
      return NextResponse.json(
        { ok: false, error: "Failed to remove administrator." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Administrator removed.",
      admin: {
        id: target.id,
        email: target.email,
        firstName: target.first_name,
        lastName: target.last_name,
      },
    });
  } catch (e) {
    console.error("[admin/remove] exception", e);
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
