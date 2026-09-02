/**
 * Admin overall access — enter an advisor/guide account without their password.
 * Uses POST /api/admin/impersonate (already wired with banner + restore).
 * If a prior access left cookies in a bad state, clears and retries once.
 */
export async function startAdminOverallAccess(userId: string): Promise<{
  ok: boolean;
  error?: string;
  redirectTo?: string;
  targetName?: string;
}> {
  const attempt = async () => {
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json().catch(() => null);
    return { res, json };
  };

  let { res, json } = await attempt();

  const alreadyMsg =
    typeof json?.error === "string" &&
    /already accessing another account/i.test(json.error);

  if ((!res.ok || !json?.ok) && alreadyMsg) {
    // End any stuck overall-access session, then retry once
    await fetch("/api/admin/impersonate", { method: "DELETE" }).catch(() => null);
    ({ res, json } = await attempt());
  }

  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || "Could not access this account." };
  }
  return {
    ok: true,
    redirectTo: typeof json.redirectTo === "string" ? json.redirectTo : "/",
    targetName: json?.target?.name,
  };
}
