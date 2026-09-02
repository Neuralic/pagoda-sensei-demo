export const SECURITY_EVENT_TYPES = {
  impersonation_start: {
    label: "Overall access started",
    tone: "start" as const,
  },
  impersonation_stop: {
    label: "Overall access ended",
    tone: "stop" as const,
  },
} as const;

export type SecurityEventType = keyof typeof SECURITY_EVENT_TYPES;
export type SecurityEventTone = "start" | "stop" | "other";

export type SecurityAuditParty = {
  id: string | null;
  name: string;
  email: string | null;
};

export type SecurityAuditTarget = SecurityAuditParty & {
  role: string | null;
  roleLabel: string;
};

export type SecurityAuditRow = {
  id: string;
  createdAt: string;
  eventType: string;
  eventLabel: string;
  tone: SecurityEventTone;
  admin: SecurityAuditParty;
  target: SecurityAuditTarget;
  ip: string | null;
  userAgent: string | null;
};

export function isSecurityEventType(value: string): value is SecurityEventType {
  return value in SECURITY_EVENT_TYPES;
}

export function securityEventLabel(eventType: string): string {
  if (isSecurityEventType(eventType)) return SECURITY_EVENT_TYPES[eventType].label;
  return eventType.replace(/_/g, " ");
}

export function securityEventTone(eventType: string): SecurityEventTone {
  if (isSecurityEventType(eventType)) return SECURITY_EVENT_TYPES[eventType].tone;
  return "other";
}

export function marketplaceRoleLabel(role: string | null | undefined): string {
  const r = String(role || "").toLowerCase();
  if (r === "agent" || r === "agency") return "Advisor";
  if (r === "guide") return "Guide";
  if (r === "admin") return "Admin";
  return role?.trim() ? String(role) : "—";
}

export function displayPersonName(opts: {
  first?: string | null;
  last?: string | null;
  email?: string | null;
  fallback?: string | null;
}): string {
  const name = [opts.first, opts.last].filter(Boolean).join(" ").trim();
  return name || opts.email?.trim() || opts.fallback?.trim() || "Unknown";
}

export function periodStartIso(period: string): string | null {
  const now = Date.now();
  if (period === "weekly") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === "monthly") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (period === "yearly") return new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

/** Strip filter operators so PostgREST `or=` search stays valid. */
export function sanitizeAuditSearch(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/[%_,.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
