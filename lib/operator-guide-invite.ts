import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ValidOperatorInvite = {
  id: string;
  operator_id: string;
  guide_user_id: string;
  token: string;
  email: string | null;
  expires_at: string;
};

export async function findValidOperatorInvite(
  supabase: SupabaseClient,
  token: string
): Promise<{ invite: ValidOperatorInvite } | { error: string; status: number }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { error: "Missing token", status: 400 };
  }

  const { data: invite } = await supabase
    .from("operator_guide_invites")
    .select("id, operator_id, guide_user_id, token, email, expires_at, used_at")
    .eq("token", trimmed)
    .maybeSingle();

  if (!invite || invite.used_at) {
    return { error: "Invalid or used invite", status: 404 };
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    return { error: "Invite expired", status: 410 };
  }

  return { invite: invite as ValidOperatorInvite };
}

export function buildGuideInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/auth/guide-invite?token=${encodeURIComponent(token)}`;
}

export async function createOperatorGuideInvite(
  supabase: SupabaseClient,
  operatorId: string,
  guideUserId: string,
  email?: string | null
): Promise<{ token: string; inviteUrl: string; expiresAt: string } | { error: string }> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("operator_guide_invites").insert({
    operator_id: operatorId,
    guide_user_id: guideUserId,
    token,
    email: email?.trim() || null,
    expires_at: expiresAt,
  });

  if (error) {
    return { error: error.message };
  }

  return { token, inviteUrl: buildGuideInviteUrl(token), expiresAt };
}
