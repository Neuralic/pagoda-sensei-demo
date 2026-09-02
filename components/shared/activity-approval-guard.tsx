"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useBootstrap } from "@/components/shared/bootstrap-context"
import { isPathAllowedWithoutFullActivity } from "@/lib/activity-approval-paths"

/**
 * Redirects agents/guides with guideApproved === false away from platform pages
 * so they can only use profile/settings until an admin approves them.
 */
export function ActivityApprovalGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { loaded, user } = useBootstrap()

  useEffect(() => {
    if (!loaded || !user?.id) return
    const role = user.role
    if (role !== "agent" && role !== "guide") return
    if (user.guideApproved !== false) return
    if (isPathAllowedWithoutFullActivity(pathname, user.id)) return
    const dest = role === "agent" ? "/agent/profile" : "/settings"
    router.replace(dest)
  }, [loaded, pathname, router, user])

  return null
}
