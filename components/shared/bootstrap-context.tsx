"use client"

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { PROFILE_UPDATED_EVENT } from "@/lib/profile-refresh"

type BootstrapUser = {
  id: string
  name: string
  lastName?: string
  email: string
  role?: string
  avatar?: string
  guideNumber?: string
  country?: string
  city?: string
  guideApproved?: boolean
  isOperator?: boolean
  isManagedGuide?: boolean
  managedByOperatorName?: string | null
}

type BootstrapUnread = {
  total: number
  perChat: Record<string, number>
  lastReadAt: Record<string, string | null>
}

export type BootstrapImpersonation = {
  active: true
  adminId: string
  targetName: string
  targetEmail: string | null
  targetRole: string | null
}

type BootstrapValue = {
  loaded: boolean
  user: BootstrapUser | null
  chatIds: string[]
  unread: BootstrapUnread
  suspended: boolean
  suspendedRole?: string
  /** Admin is using overall access on this advisor/guide session */
  impersonating: boolean
  /** Who is being viewed, for the banner and the chat composer. Null when not impersonating. */
  impersonation: BootstrapImpersonation | null
}

const BootstrapContext = createContext<BootstrapValue | undefined>(undefined)

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith("/auth") ||
    pathname === "/guide/login" ||
    pathname === "/agent/login" ||
    pathname === "/admin/login"
  )
}

const emptyUnread = (): BootstrapUnread => ({
  total: 0,
  perChat: {},
  lastReadAt: {},
})

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [loaded, setLoaded] = useState(false)
  const [user, setUser] = useState<BootstrapUser | null>(null)
  const [chatIds, setChatIds] = useState<string[]>([])
  const [unread, setUnread] = useState<BootstrapUnread>(emptyUnread)
  const [suspended, setSuspended] = useState(false)
  const [suspendedRole, setSuspendedRole] = useState<string | undefined>(undefined)
  const [impersonating, setImpersonating] = useState(false)
  const [impersonation, setImpersonation] = useState<BootstrapImpersonation | null>(null)

  /** True after a successful bootstrap while on protected routes; reset when user is on auth pages. */
  const bootstrappedRef = useRef(false)
  const fetchInFlightRef = useRef(false)

  const onAuthRoute = isAuthRoute(pathname)

  useEffect(() => {
    if (onAuthRoute) {
      setLoaded(true)
      bootstrappedRef.current = false
      fetchInFlightRef.current = false
      setSuspended(false)
      setSuspendedRole(undefined)
      setImpersonating(false)
      setImpersonation(null)
      setUser(null)
      setChatIds([])
      setUnread(emptyUnread())
      return
    }

    if (bootstrappedRef.current) {
      setLoaded(true)
      return
    }

    if (fetchInFlightRef.current) {
      if (bootstrappedRef.current || user) setLoaded(true)
      return
    }

    let cancelled = false
    fetchInFlightRef.current = true

    ;(async () => {
      try {
        const res = await fetch("/api/bootstrap", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return

        if (res.status === 401 && json?.suspended) {
          setSuspended(true)
          setSuspendedRole(json?.suspendedRole)
          setUser(null)
          setChatIds([])
          setUnread(emptyUnread())
          setImpersonating(false)
          setImpersonation(null)
      setImpersonation(null)
          bootstrappedRef.current = false
          fetchInFlightRef.current = false
          if (!cancelled) setLoaded(true)
          return
        }

        if (json?.ok) {
          bootstrappedRef.current = true
          setSuspended(false)
          setSuspendedRole(undefined)
          setImpersonating(Boolean(json?.impersonation?.active))
          setImpersonation(
            json?.impersonation?.active
              ? (json.impersonation as BootstrapImpersonation)
              : null
          )
          setUser((json.user || null) as BootstrapUser | null)
          setChatIds((Array.isArray(json.chats) ? json.chats : []) as string[])
          setUnread(
            (json.unread && typeof json.unread === "object"
              ? json.unread
              : emptyUnread()) as BootstrapUnread
          )
        } else {
          bootstrappedRef.current = false
          setUser(null)
          setChatIds([])
          setUnread(emptyUnread())
          setImpersonating(false)
          setImpersonation(null)
      setImpersonation(null)
        }
      } catch {
        bootstrappedRef.current = false
        setUser(null)
        setChatIds([])
        setUnread(emptyUnread())
        setImpersonating(false)
      setImpersonation(null)
      } finally {
        fetchInFlightRef.current = false
        if (!cancelled) setLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
    // Only auth vs protected matters — client navigations within the app must not cancel bootstrap.
  }, [onAuthRoute])

  useEffect(() => {
    if (onAuthRoute) return

    const onProfileUpdated = async () => {
      try {
        const res = await fetch("/api/bootstrap", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (json?.ok && json.user) {
          setUser(json.user as BootstrapUser)
        }
      } catch {
        /* ignore */
      }
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated)
  }, [onAuthRoute])

  const value = useMemo<BootstrapValue>(
    () => ({
      loaded,
      user,
      chatIds,
      unread,
      suspended,
      suspendedRole,
      impersonating,
      impersonation,
    }),
    [loaded, user, chatIds, unread, suspended, suspendedRole, impersonating, impersonation]
  )

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>
}

export function useBootstrap(): BootstrapValue {
  const ctx = useContext(BootstrapContext)
  if (!ctx) {
    throw new Error("useBootstrap must be used within BootstrapProvider")
  }
  return ctx
}

