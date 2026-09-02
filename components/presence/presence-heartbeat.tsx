"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useBootstrap } from "@/components/shared/bootstrap-context";

function shouldSkipPresence(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/guide/login")) return true;
  if (pathname.startsWith("/agent/login")) return true;
  if (pathname.startsWith("/admin/login")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

function computePresenceState(): "online" | "idle" {
  if (typeof document === "undefined") return "idle";
  if (document.visibilityState === "visible" && document.hasFocus()) {
    return "online";
  }
  return "idle";
}

/**
 * Sends periodic presence for agents/guides while they use the app.
 * Online = focused Pagoda tab; idle = logged in but elsewhere (other tab/app).
 * Offline when heartbeats stop or on logout (see API + logout).
 */
export function PresenceHeartbeat() {
  const pathname = usePathname();
  const { user, loaded, impersonating } = useBootstrap();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Last state the server was told, so a keepalive is not reported as a change. */
  const lastSentStateRef = useRef<"online" | "idle" | null>(null);

  const pendingActivity =
    loaded &&
    user &&
    (user.role === "agent" || user.role === "guide") &&
    user.guideApproved === false;

  useEffect(() => {
    if (shouldSkipPresence(pathname) || pendingActivity || impersonating) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const send = () => {
      const state = computePresenceState();
      // The server broadcasts to admins only on a transition; the row itself is refreshed on
      // every tick either way, so a dropped keepalive still expires the user naturally.
      const changed = lastSentStateRef.current !== state;
      lastSentStateRef.current = state;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, changed }),
        keepalive: true,
      }).catch(() => {
        // Let the next tick re-report this state as a change.
        lastSentStateRef.current = null;
      });
    };

    // Defer first ping so it does not compete with critical navigation + data requests.
    const first = window.setTimeout(() => {
      send();
    }, 2_000);
    const onChange = () => send();
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("blur", onChange);
    timerRef.current = setInterval(send, 25_000);

    return () => {
      window.clearTimeout(first);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("focus", onChange);
      window.removeEventListener("blur", onChange);
    };
  }, [pathname, pendingActivity, impersonating]);

  return null;
}
