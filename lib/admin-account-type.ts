export type AdminAccountType = "agent" | "operator" | "guide" | "managed_guide";

export type AdminAccountUser = {
  role: string;
  is_operator?: boolean | null;
  managed_by_operator_id?: string | null;
};

export function resolveAdminAccountType(user: AdminAccountUser): AdminAccountType {
  if (user.role === "agent") return "agent";
  if (user.role === "guide") {
    if (user.managed_by_operator_id) return "managed_guide";
    return "operator";
  }
  return "guide";
}

export const ADMIN_ACCOUNT_TYPE_LABELS: Record<AdminAccountType, string> = {
  agent: "Travel Agent",
  operator: "Tour Operator",
  guide: "Independent Guide",
  managed_guide: "Managed Guide",
};

export const ADMIN_ACCOUNT_TYPE_BADGE: Record<AdminAccountType, string> = {
  agent: "bg-blue-100 text-blue-800",
  operator: "bg-amber-100 text-amber-900",
  guide: "bg-green-100 text-green-800",
  managed_guide: "bg-teal-100 text-teal-800",
};

export function isPlaceholderManagedEmail(email: string | null | undefined): boolean {
  return Boolean(email?.includes("@managed.pagoda.local"));
}

/**
 * True when the address is safe to send SMTP mail to.
 * Managed-guide placeholders (`*@managed.pagoda.local`) are not real mailboxes —
 * sending them via PrivateEmail/Namecheap bounces as spam (JFE040000) to the From address.
 */
export function isDeliverableUserEmail(email: string | null | undefined): boolean {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value || !value.includes("@")) return false;
  if (isPlaceholderManagedEmail(value)) return false;
  const domain = value.split("@").pop()?.toLowerCase() ?? "";
  if (!domain || domain === "localhost" || domain.endsWith(".local") || domain.endsWith(".test")) {
    return false;
  }
  return true;
}

export function displayUserEmail(email: string | null | undefined): string {
  if (!email || isPlaceholderManagedEmail(email)) return "—";
  return email;
}
