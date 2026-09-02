"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  label?: string;
  className?: string;
  /** When set, always go here (used on conversation pages so Back cannot dump you on the wrong page). */
  href?: string;
  fallbackHref?: string;
}

export function BackButton({
  label = "Back",
  className = "inline-flex items-center gap-2 text-sm hover:text-foreground transition-colors cursor-pointer",
  href,
  fallbackHref,
}: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (href) {
          router.push(href);
          return;
        }
        if (fallbackHref) {
          const canGoBack =
            typeof window !== "undefined" &&
            window.history.length > 1 &&
            document.referrer &&
            (() => {
              try {
                const ref = new URL(document.referrer);
                return ref.origin === window.location.origin && ref.pathname !== window.location.pathname;
              } catch {
                return false;
              }
            })();
          if (canGoBack) {
            router.back();
            return;
          }
          router.push(fallbackHref);
          return;
        }
        router.back();
      }}
      className={className}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
