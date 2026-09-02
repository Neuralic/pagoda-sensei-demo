"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole } from "@/lib/auth-home";

type RedirectOpts = {
  redirectTo?: string | null;
  isValidRedirect?: (path: string) => boolean;
};

/**
 * If a session already exists, leave the login page (covers browser Back
 * restoring /login from history without requiring logout).
 * When `redirectTo` is valid, go there instead of the role home (email deep links).
 */
export function useRedirectIfAuthenticated(opts?: RedirectOpts): boolean {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/bootstrap", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (json?.ok && json?.user?.id && json?.user?.role) {
          const role = String(json.user.role);
          const redirect = opts?.redirectTo?.trim();
          let destination = homePathForRole(role);
          if (redirect && opts?.isValidRedirect?.(redirect)) {
            destination = redirect.startsWith("/") ? redirect : `/${redirect}`;
          }
          router.replace(destination);
          return;
        }
      } catch {
        /* stay on login */
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void check();

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router, opts?.redirectTo, opts?.isValidRedirect]);

  return checking;
}
