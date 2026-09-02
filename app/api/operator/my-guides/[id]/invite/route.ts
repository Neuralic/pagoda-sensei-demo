import { NextRequest, NextResponse } from "next/server";
import { requireOperatorAccount, assertOperatorOwnsGuide } from "@/lib/operator-auth";
import { createOperatorGuideInvite } from "@/lib/operator-guide-invite";
import { sendOperatorGuideInviteEmail } from "@/lib/mailer";
import {
  findUserByEmail,
  normalizeEmail,
  registrationConflictMessage,
} from "@/lib/register-identity";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;
  const { id: guideId } = await context.params;

  if (!(await assertOperatorOwnsGuide(supabase, userId, guideId))) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim() || "";

  if (email) {
    const existingByEmail = await findUserByEmail(supabase, normalizeEmail(email), {
      role: "guide",
    });
    if (
      existingByEmail &&
      existingByEmail.id !== guideId &&
      !existingByEmail.email?.includes("@managed.pagoda.local")
    ) {
      const conflict = registrationConflictMessage(existingByEmail, "email");
      return NextResponse.json(
        { ok: false, error: conflict.error, field: "email" },
        { status: 409 }
      );
    }
  }
  const { data: guide } = await supabase
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", guideId)
    .maybeSingle();

  const invite = await createOperatorGuideInvite(supabase, userId, guideId, email || null);
  if ("error" in invite) {
    return NextResponse.json({ ok: false, error: invite.error }, { status: 500 });
  }

  let emailSent = false;
  let emailFallback = false;
  const recipient = email || (guide?.email?.includes("@managed.pagoda.local") ? "" : guide?.email || "");
  if (recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    const { data: operator } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    const operatorName = operator
      ? `${operator.first_name || ""} ${operator.last_name || ""}`.trim()
      : undefined;
    const guideName = guide
      ? `${guide.first_name || ""} ${guide.last_name || ""}`.trim()
      : "Guide";
    const mail = await sendOperatorGuideInviteEmail(recipient, {
      guideName,
      inviteUrl: invite.inviteUrl,
      operatorName,
    });
    emailSent = mail.ok && !("fallback" in mail && mail.fallback);
    emailFallback = Boolean("fallback" in mail && mail.fallback);
  }

  return NextResponse.json({
    ok: true,
    token: invite.token,
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt,
    emailSent,
    emailFallback,
  });
}
