"use client";

import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type Props = {
  guideId: string;
  guideName?: string;
  /** When set, unauthenticated users return here after agent login */
  returnPath?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
};

export function ContactGuideButton({
  guideId,
  guideName,
  returnPath,
  variant = "default",
  size = "default",
  className,
  label = "Contact guide",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState<
    "loading" | "agent" | "login" | "hidden"
  >("loading");
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        const user = data?.user;
        if (!user?.id) {
          setAuthState("login");
          return;
        }
        if (user.role === "agent") {
          if (user.guideApproved === false) {
            setAuthState("hidden");
            return;
          }
          setAgentId(user.id);
          setAuthState(user.id === guideId ? "hidden" : "agent");
          return;
        }
        setAuthState("hidden");
      } catch {
        if (!cancelled) setAuthState("login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guideId]);

  const handleClick = useCallback(async () => {
    if (authState === "login") {
      const path =
        returnPath ||
        (typeof window !== "undefined" ? window.location.pathname : "/agent/find-guide");
      router.push(`/agent/login?redirect=${encodeURIComponent(path)}`);
      return;
    }

    if (!agentId) {
      toast.error("Please log in as a travel agent to contact this guide.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/chats/ensure-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId: agentId,
          guideId,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Failed to parse response" }));

      if (res.ok && json?.ok && json?.chatId) {
        router.push(`/agent/conversation/${json.chatId}`);
        return;
      }

      if (json?.pendingApproval) {
        toast.error(
          "Your account is pending approval. You can update your profile until an administrator enables full access."
        );
        return;
      }

      toast.error(json?.error || "Failed to start conversation");
    } catch {
      toast.error("Failed to start conversation");
    } finally {
      setLoading(false);
    }
  }, [agentId, authState, guideId, returnPath, router]);

  if (authState === "loading" || authState === "hidden") {
    return null;
  }

  const ariaLabel = guideName ? `${label} — ${guideName}` : label;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={() => void handleClick()}
      aria-label={ariaLabel}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
