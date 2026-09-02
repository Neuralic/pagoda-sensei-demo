"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/components/shared/header";
import { FallbackHeader } from "@/components/shared/fallback-header";
import toast from "react-hot-toast";
import { useBootstrap } from "@/components/shared/bootstrap-context";

export default function HeaderWrapper() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loaded, suspended, suspendedRole } = useBootstrap();
  const [handledSuspended, setHandledSuspended] = useState(false);

  const isAuth =
    pathname?.startsWith("/auth") ||
    pathname === "/guide/login" ||
    pathname === "/agent/login" ||
    pathname === "/admin/login";

  const isAdminApp = pathname?.startsWith("/admin");

  useEffect(() => {
    if (isAuth) {
      return;
    }
    if (!handledSuspended && suspended) {
      setHandledSuspended(true);
      toast.error("Your account has been suspended. You have been logged out.");
      const loginPath = suspendedRole === "guide" ? "/guide/login" : "/agent/login";
      router.replace(loginPath);
    }
  }, [handledSuspended, isAuth, router, suspended, suspendedRole]);

  // Hide header on auth routes; admin uses AdminLayout sidebar
  if (isAuth || isAdminApp) return null;

  if (!user) {
    return <FallbackHeader />;
  }
  const headerUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    guideApproved: user.guideApproved,
    isOperator: user.isOperator,
    isManagedGuide: user.isManagedGuide,
  };
  return <Header user={headerUser} />;
}
