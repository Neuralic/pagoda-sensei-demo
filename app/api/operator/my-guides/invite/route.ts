import { NextResponse } from "next/server";
import { requireOperatorAccount } from "@/lib/operator-auth";
import {
  createManagedGuideUser,
  parseManagedGuideBody,
} from "@/lib/managed-guide-profile";
import { createOperatorGuideInvite } from "@/lib/operator-guide-invite";
import { sendOperatorGuideInviteEmail } from "@/lib/mailer";

export const runtime = "nodejs";

/** Create a guide stub and send a self-onboarding invite (email optional). */
export async function POST(req: Request) {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const parsed = parseManagedGuideBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const created = await createManagedGuideUser(supabase, userId, parsed, {
    inviteEmail: email || null,
  });
  if ("error" in created) {
    const status = created.field ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: created.error, field: created.field },
      { status }
    );
  }

  const invite = await createOperatorGuideInvite(
    supabase,
    userId,
    created.guideUserId,
    email || null
  );
  if ("error" in invite) {
    return NextResponse.json({ ok: false, error: invite.error }, { status: 500 });
  }

  let emailSent = false;
  let emailFallback = false;
  if (email) {
    const { data: operator } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    const operatorName = operator
      ? `${operator.first_name || ""} ${operator.last_name || ""}`.trim()
      : undefined;
    const mail = await sendOperatorGuideInviteEmail(email, {
      guideName: `${parsed.firstName} ${parsed.lastName}`.trim(),
      inviteUrl: invite.inviteUrl,
      operatorName,
    });
    emailSent = mail.ok && !("fallback" in mail && mail.fallback);
    emailFallback = Boolean("fallback" in mail && mail.fallback);
  }

  return NextResponse.json({
    ok: true,
    guideUserId: created.guideUserId,
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt,
    emailSent,
    emailFallback,
  });
}
