"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useBootstrap } from "@/components/shared/bootstrap-context";

type Props = {
  children: React.ReactNode;
  /** Shown when a team guide opens an operator-only page */
  message?: string;
  /**
   * operator — requires is_operator (My Guides, tour assignments).
   * not-managed — blocks team guides only (tour library for operators / self-employed guides).
   */
  mode?: "operator" | "not-managed";
};

export function OperatorOnlyGuard({
  children,
  message = "This page is for tour operators only. Use the Jobs Board to find and bid on trips.",
  mode = "operator",
}: Props) {
  const { user, loaded } = useBootstrap();
  const router = useRouter();
  const blocked =
    loaded &&
    user?.role === "guide" &&
    (mode === "not-managed" ? user.isManagedGuide : !user.isOperator);

  useEffect(() => {
    if (!blocked) return;
    toast.error(message);
    router.replace("/guide/landing");
  }, [blocked, message, router]);

  // Always render children — blocking with null/spinner left operator pages stuck on navigation.
  return <>{children}</>;
}
