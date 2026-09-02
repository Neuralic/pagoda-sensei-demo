"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Shield, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useBootstrap } from "@/components/shared/bootstrap-context";

/**
 * Persistent banner while an admin is using overall access on an advisor/guide account.
 * Hidden on /admin routes — admin UI should not show this strip.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { impersonation } = useBootstrap();
  const [stopping, setStopping] = useState(false);

  const onAdminRoute = pathname?.startsWith("/admin") ?? false;

  const stop = useCallback(async () => {
    setStopping(true);
    try {
      const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Could not return to admin");
        return;
      }
      toast.success("Returned to admin");
      // A full page load, not router.push: the session identity has changed and every client
      // cache built for the advisor — bootstrap, unread counts, presence — must be discarded.
      // A soft navigation kept them, which is why admin screens carried on polling as the
      // advisor and 403ing.
      window.location.assign(
        typeof json.redirectTo === "string" ? json.redirectTo : "/admin/user"
      );
    } catch {
      toast.error("Could not return to admin");
    } finally {
      setStopping(false);
    }
  }, [router]);

  // Never show this banner on admin pages.
  if (onAdminRoute || !impersonation) return null;

  const roleLabel =
    impersonation.targetRole === "guide"
      ? "guide"
      : impersonation.targetRole === "agent"
        ? "travel advisor"
        : "account";

  return (
    <div className="sticky top-0 z-[100] w-full border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
        <div className="flex items-start gap-2 min-w-0">
          <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <p className="leading-snug">
            <span className="font-semibold">Admin overall access</span>
            {" — "}
            viewing as {roleLabel}{" "}
            <span className="font-medium">{impersonation.targetName}</span>
            {impersonation.targetEmail ? (
              <span className="text-amber-800/80"> ({impersonation.targetEmail})</span>
            ) : null}
            . Changes you make apply to this account. Messages you send are attributed to{" "}
            <strong>Pagoda Support</strong> and notify {impersonation.targetName || "them"}, not you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={stopping}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          {stopping ? "Returning…" : "Return to admin"}
        </button>
      </div>
    </div>
  );
}
