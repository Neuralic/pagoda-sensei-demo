import { getSupabaseServer } from "@/lib/supabaseServer";

export async function recordImpersonationAudit(opts: {
  action: "start" | "stop";
  adminId: string;
  adminEmail?: string | null;
  adminName?: string | null;
  targetUserId: string;
  targetRole?: string | null;
  targetEmail?: string | null;
  targetName?: string | null;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseServer();
    await supabase.from("security_audit_log").insert({
      event_type: `impersonation_${opts.action}`,
      actor_id: opts.adminId,
      target_user_id: opts.targetUserId,
      target_role: opts.targetRole || null,
      ip: opts.ip || null,
      user_agent: opts.userAgent || null,
      meta: {
        adminEmail: opts.adminEmail || null,
        adminName: opts.adminName || null,
        targetEmail: opts.targetEmail || null,
        targetName: opts.targetName || null,
      },
    });
  } catch (e) {
    console.error("[security-audit] failed to write impersonation log", e);
  }

  console.info(
    `[security-audit] impersonation ${opts.action} admin=${opts.adminId} target=${opts.targetUserId} ip=${opts.ip || ""}`
  );

  // No email — overall access is logged in Admin → Security log only.
}
