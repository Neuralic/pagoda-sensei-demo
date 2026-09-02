import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  applyTargetSessionCookies,
  clearImpersonationCookies,
  isImpersonating,
  restoreAdminSessionCookies,
  setImpersonationBackupCookies,
} from "@/lib/admin-impersonation";
import { recordImpersonationAudit } from "@/lib/impersonation-audit";
import { clientIpFromRequest, clientUserAgent } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

async function requireActiveAdmin(adminId: string | undefined) {
  if (!adminId) return null;
  const supabase = getSupabaseServer();
  const { data: admin } = await supabase
    .from("admin")
    .select("id, first_name, last_name, email, is_active")
    .eq("id", adminId)
    .eq("is_active", true)
    .maybeSingle();
  return admin;
}

/**
 * GET — current impersonation status (for banner / bootstrap clients).
 */
export async function GET() {
  try {
    const jar = await cookies();
    const isProduction = process.env.NODE_ENV === "production";

    // Stale impersonator_* while already admin — clear and report inactive
    if (jar.get("impersonator_id")?.value && jar.get("role")?.value === "admin") {
      const res = NextResponse.json({ ok: true, impersonating: false, clearedStale: true });
      clearImpersonationCookies(res, isProduction);
      return res;
    }

    if (!isImpersonating(jar)) {
      return NextResponse.json({ ok: true, impersonating: false });
    }

    const adminId = jar.get("impersonator_id")?.value;
    const targetId = jar.get("userId")?.value;
    const targetRole = jar.get("role")?.value;

    const admin = await requireActiveAdmin(adminId);
    if (!admin || !targetId) {
      const res = NextResponse.json({ ok: true, impersonating: false });
      clearImpersonationCookies(res, isProduction);
      return res;
    }

    const supabase = getSupabaseServer();
    const { data: target } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, role")
      .eq("id", targetId)
      .maybeSingle();

    const targetName = target
      ? [target.first_name, target.last_name].filter(Boolean).join(" ").trim() ||
        target.email
      : "User";

    return NextResponse.json({
      ok: true,
      impersonating: true,
      admin: {
        id: admin.id,
        name: [admin.first_name, admin.last_name].filter(Boolean).join(" ").trim(),
      },
      target: {
        id: targetId,
        name: targetName,
        email: target?.email ?? null,
        role: targetRole,
      },
    });
  } catch (e) {
    console.error("[admin/impersonate GET]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}

/**
 * POST — start overall access: admin uses an advisor/guide account without their password.
 * Body: { userId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const role = jar.get("role")?.value;
    const adminId = jar.get("userId")?.value;
    const adminSession = jar.get("session")?.value;

    if (role !== "admin" || !adminId || !adminSession) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Leftover impersonator_* cookies after logging back in as admin used to block this.
    // Clear them and continue when the active session is already admin.
    const hasStaleImpersonatorCookie = Boolean(jar.get("impersonator_id")?.value);
    if (isImpersonating(jar)) {
      return NextResponse.json(
        { ok: false, error: "Already accessing another account. Return to admin first." },
        { status: 400 }
      );
    }

    const admin = await requireActiveAdmin(adminId);
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { data: target, error } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, role, is_active, is_verified")
      .eq("id", userId)
      .maybeSingle();

    if (error || !target) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    if (target.role !== "agent" && target.role !== "guide") {
      return NextResponse.json(
        { ok: false, error: "You can only access travel advisor or guide accounts." },
        { status: 400 }
      );
    }

    if (target.is_active === false) {
      return NextResponse.json(
        { ok: false, error: "This account is suspended. Reactivate it before accessing." },
        { status: 400 }
      );
    }

    const targetName =
      [target.first_name, target.last_name].filter(Boolean).join(" ").trim() || target.email;

    const res = NextResponse.json({
      ok: true,
      redirectTo: target.role === "guide" ? "/guide/landing" : "/agent/itineraries",
      target: {
        id: target.id,
        name: targetName,
        email: target.email,
        role: target.role,
      },
    });

    if (hasStaleImpersonatorCookie) {
      clearImpersonationCookies(res, isProduction);
    }

    setImpersonationBackupCookies(res, {
      adminId,
      adminSession,
      isProduction,
    });
    await applyTargetSessionCookies(res, {
      userId: target.id,
      role: target.role as "agent" | "guide",
      isProduction,
    });

    await recordImpersonationAudit({
      action: "start",
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: [admin.first_name, admin.last_name].filter(Boolean).join(" ").trim(),
      targetUserId: target.id,
      targetRole: target.role,
      targetEmail: target.email,
      targetName,
      ip: clientIpFromRequest(req),
      userAgent: clientUserAgent(req),
    });

    return res;
  } catch (e) {
    console.error("[admin/impersonate POST]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}

/**
 * DELETE — stop overall access and restore the admin session.
 */
export async function DELETE(req: NextRequest) {
  try {
    const jar = await cookies();
    const adminId = jar.get("impersonator_id")?.value;
    const adminSession = jar.get("impersonator_session")?.value;
    const targetUserId = jar.get("userId")?.value || "";
    const targetRole = jar.get("role")?.value || "";
    const isProduction = process.env.NODE_ENV === "production";

    if (!adminId || !adminSession) {
      // Not impersonating — no-op
      const res = NextResponse.json({ ok: true, impersonating: false, redirectTo: "/admin/user" });
      clearImpersonationCookies(res, isProduction);
      return res;
    }

    const admin = await requireActiveAdmin(adminId);
    if (!admin) {
      const res = NextResponse.json(
        { ok: false, error: "Admin session expired. Please log in again." },
        { status: 401 }
      );
      clearImpersonationCookies(res, isProduction);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      impersonating: false,
      redirectTo: "/admin/user",
    });
    restoreAdminSessionCookies(res, {
      adminId,
      adminSession,
      isProduction,
    });

    await recordImpersonationAudit({
      action: "stop",
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: [admin.first_name, admin.last_name].filter(Boolean).join(" ").trim(),
      targetUserId,
      targetRole,
      ip: clientIpFromRequest(req),
      userAgent: clientUserAgent(req),
    });

    return res;
  } catch (e) {
    console.error("[admin/impersonate DELETE]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
