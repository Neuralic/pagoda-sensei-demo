import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import bcrypt from "bcryptjs";
import { findValidOperatorInvite } from "@/lib/operator-guide-invite";
import { parseInviteClaimBody, updateManagedGuideProfile } from "@/lib/managed-guide-profile";
import { ensureGuideMarketplaceProfile } from "@/lib/ensure-guide-marketplace-profile";
import { sendVerificationEmail } from "@/lib/mailer";
import { verificationCodeExpiresAt } from "@/lib/verification-code";
import { BUCKETS } from "@/lib/buckets";
import {
  findUserByEmail,
  findUserByNormalizedName,
  findUserByNormalizedPhone,
  isUsableNormalizedName,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  registrationConflictMessage,
} from "@/lib/register-identity";

export const runtime = "nodejs";

const INVITE_PROFILE_SELECT =
  "bio, languages, destinations, years_experience, tours_completed_estimate, experience_tier_declared, crisis_handling_example, local_expertise_highlight, pre_tour_preparation, client_fit_description, intro_video_url, profile_picture_path, intro_video_path, available_for_video_call, country, city";

/** Validate invite token (public) */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const inviteResult = await findValidOperatorInvite(supabase, token);
  if ("error" in inviteResult) {
    return NextResponse.json({ ok: false, error: inviteResult.error }, { status: inviteResult.status });
  }

  const guideUserId = inviteResult.invite.guide_user_id;

  const { data: user } = await supabase
    .from("users")
    .select("first_name, last_name, email, country, city")
    .eq("id", guideUserId)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select(INVITE_PROFILE_SELECT)
    .eq("user_id", guideUserId)
    .maybeSingle();

  let avatarUrl: string | null = null;
  let introVideoSignedUrl: string | null = null;
  const pic = profile?.profile_picture_path as string | undefined;
  if (pic) {
    const { data: signed } = await supabase.storage.from(BUCKETS.avatars).createSignedUrl(pic, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }
  const introPath = profile?.intro_video_path as string | undefined;
  if (introPath) {
    const { data: signed } = await supabase.storage
      .from(BUCKETS.introVideos)
      .createSignedUrl(introPath, 3600);
    introVideoSignedUrl = signed?.signedUrl ?? null;
  }

  const guideName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "Guide";
  const inviteEmail = inviteResult.invite.email;
  const placeholderEmail = user?.email?.includes("@managed.pagoda.local");

  const profileRow = profile
    ? {
        ...profile,
        country: profile.country || user?.country || null,
        city: profile.city || user?.city || null,
        avatarUrl,
        introVideoSignedUrl,
      }
    : null;

  return NextResponse.json({
    ok: true,
    guideUserId,
    guideName,
    expiresAt: inviteResult.invite.expires_at,
    suggestedEmail: inviteEmail || (placeholderEmail ? "" : user?.email || ""),
    profile: profileRow,
  });
}

/** Guide claims invite: account + profile fields they provide (operator pre-fill is preserved). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Email and password (8+ characters) are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServer();
  const inviteResult = await findValidOperatorInvite(supabase, token);
  if ("error" in inviteResult) {
    return NextResponse.json({ ok: false, error: inviteResult.error }, { status: inviteResult.status });
  }

  const guideUserId = inviteResult.invite.guide_user_id;

  const existingByEmail = await findUserByEmail(supabase, email, { role: "guide" });
  if (existingByEmail && existingByEmail.id !== guideUserId) {
    const conflict = registrationConflictMessage(existingByEmail, "email");
    return NextResponse.json(
      { ok: false, error: conflict.error, field: "email" },
      { status: 409 }
    );
  }

  const invitePhone =
    typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  if (invitePhone.length >= 8) {
    const existingByPhone = await findUserByNormalizedPhone(supabase, invitePhone, {
      excludeUserId: guideUserId,
      role: "guide",
    });
    if (existingByPhone) {
      const conflict = registrationConflictMessage(existingByPhone, "phone");
      return NextResponse.json(
        { ok: false, error: conflict.error, field: "phone" },
        { status: 409 }
      );
    }
  }

  const inviteFields = parseInviteClaimBody(body);

  if (!inviteFields.firstName?.trim()) {
    return NextResponse.json({ ok: false, error: "Your name is required" }, { status: 400 });
  }

  const inviteNormalizedName = normalizeFullName(
    inviteFields.firstName,
    inviteFields.lastName ?? ""
  );
  if (isUsableNormalizedName(inviteNormalizedName)) {
    const existingByName = await findUserByNormalizedName(
      supabase,
      inviteFields.firstName,
      inviteFields.lastName ?? "",
      { excludeUserId: guideUserId, role: "guide" }
    );
    if (existingByName) {
      const conflict = registrationConflictMessage(existingByName, "name");
      return NextResponse.json(
        { ok: false, error: conflict.error, field: "name" },
        { status: 409 }
      );
    }
  }
  if (!inviteFields.profilePicturePath) {
    return NextResponse.json({ ok: false, error: "Profile photo is required" }, { status: 400 });
  }
  if (inviteFields.availableForVideoCall == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please indicate if you are available for a video call with the travel advisor",
        field: "availableForVideoCall",
      },
      { status: 400 }
    );
  }

  const { error: userErr } = await supabase
    .from("users")
    .update({
      email,
      password_hash: await bcrypt.hash(password, 8),
      is_verified: false,
      first_name: inviteFields.firstName,
      last_name: inviteFields.lastName ?? "",
      name_normalized: isUsableNormalizedName(inviteNormalizedName)
        ? inviteNormalizedName
        : null,
      ...(invitePhone.length >= 8
        ? { phone: String(body.phone ?? "").trim(), phone_normalized: invitePhone }
        : {}),
    })
    .eq("id", guideUserId);
  if (userErr) {
    return NextResponse.json({ ok: false, error: userErr.message }, { status: 500 });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString().slice(0, 6);
  const expiresAt = verificationCodeExpiresAt();
  const { error: codeErr } = await supabase
    .from("email_verification_codes")
    .insert({ user_id: guideUserId, code, expires_at: expiresAt });
  if (codeErr) {
    return NextResponse.json({ ok: false, error: "Failed to generate verification code." }, { status: 500 });
  }
  try {
    await sendVerificationEmail(email, code, "verification");
  } catch (e) {
    console.error("[guide-invite] verification email failed", e);
  }

  const profileResult = await updateManagedGuideProfile(supabase, guideUserId, {
    ...inviteFields,
    guideProfileStatus: "draft",
  });
  if (profileResult.error) {
    return NextResponse.json({ ok: false, error: profileResult.error }, { status: 500 });
  }

  await ensureGuideMarketplaceProfile(supabase, guideUserId);

  await supabase
    .from("operator_guide_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", inviteResult.invite.id);

  return NextResponse.json({ ok: true, guideUserId });
}
