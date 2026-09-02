import { NextRequest, NextResponse } from "next/server";
import { requireOperatorAccount, assertOperatorOwnsGuide } from "@/lib/operator-auth";
import { enrichGuidesWithStats } from "@/lib/guide-profile-stats";
import {
  marketplaceInputFromProfileRows,
  parseManagedGuideBody,
  updateManagedGuideProfile,
} from "@/lib/managed-guide-profile";
import { getCurrentExperienceTierDisplay, certificationStatusLabel } from "@/lib/guide-experience-display";
import { validateGuideMarketplaceProfile } from "@/lib/guide-marketplace-validation";
import { fetchAssignedToursForGuide } from "@/lib/guide-tour-assignments";
import { BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";

function publicProfileUrl(slug: string | null): string | null {
  if (!slug) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/g/${slug}`;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;
  const { id: guideId } = await context.params;

  if (!(await assertOperatorOwnsGuide(supabase, userId, guideId))) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, guide_number, country, city, is_active, guide_tier")
    .eq("id", guideId)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", guideId)
    .maybeSingle();

  const [stats, assignedTours] = await Promise.all([
    enrichGuidesWithStats(supabase, [guideId]),
    fetchAssignedToursForGuide(supabase, guideId, { publishedOnly: false }),
  ]);

  let avatarUrl: string | null = null;
  const pic = profile?.profile_picture_path;
  if (pic) {
    const { data: signed } = await supabase.storage.from(BUCKETS.avatars).createSignedUrl(pic, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }

  let introVideoSignedUrl: string | null = null;
  const introPath = profile?.intro_video_path;
  if (introPath) {
    const { data: signed } = await supabase.storage
      .from(BUCKETS.introVideos)
      .createSignedUrl(introPath, 3600);
    introVideoSignedUrl = signed?.signedUrl ?? null;
  }

  const tierDisplay = getCurrentExperienceTierDisplay({
    guideTier: user?.guide_tier as string | null,
    experienceTierDeclared: profile?.experience_tier_declared as number | null,
    experienceTierVerified: profile?.experience_tier_verified as number | null,
  });
  const slug = profile?.profile_slug as string | null;
  const certStatus = (profile?.certification_status as string) || "pending";
  const published = profile?.guide_profile_status === "published";
  const experienceTier =
    tierDisplay.source === "verified"
      ? (profile?.experience_tier_verified as number)
      : (profile?.experience_tier_declared as number);

  return NextResponse.json({
    ok: true,
    guide: {
      user,
      profile: profile ? { ...profile, avatarUrl, introVideoSignedUrl } : null,
      certificationStatus: certStatus,
      certificationLabel: certificationStatusLabel(certStatus),
      experienceTier,
      experienceTierLabel: tierDisplay.label,
      experienceTierShortLabel: tierDisplay.shortLabel,
      experienceTierSource: tierDisplay.source,
      bookingCount: stats[guideId]?.bookingCount ?? 0,
      ratingAverage: stats[guideId]?.ratingAverage ?? null,
      reviewCount: stats[guideId]?.reviewCount ?? 0,
      profileSlug: slug,
      publicProfileUrl: published ? publicProfileUrl(slug) : null,
      assignedTours,
    },
  });
}

export async function PUT(
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const saveAsDraft = body.saveAsDraft === true;
  const parsed = parseManagedGuideBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  if (!saveAsDraft) {
    const validation = validateGuideMarketplaceProfile(parsed);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, error: validation.error, field: validation.field },
        { status: 400 }
      );
    }
  }

  const result = await updateManagedGuideProfile(supabase, guideId, parsed);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("guide_tier")
    .eq("id", guideId)
    .maybeSingle();
  const { data: profile } = await supabase
    .from("profiles")
    .select("certification_status, experience_tier_declared, experience_tier_verified")
    .eq("user_id", guideId)
    .maybeSingle();

  const tierDisplay = getCurrentExperienceTierDisplay({
    guideTier: user?.guide_tier as string | null,
    experienceTierDeclared: profile?.experience_tier_declared as number | null,
    experienceTierVerified: profile?.experience_tier_verified as number | null,
  });
  const certStatus = (profile?.certification_status as string) || "pending";

  return NextResponse.json({
    ok: true,
    certificationLabel: certificationStatusLabel(certStatus),
    experienceTierLabel: tierDisplay.label,
    experienceTierShortLabel: tierDisplay.shortLabel,
  });
}

/** Archive, deactivate, or publish */
export async function PATCH(
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

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    guideProfileStatus?: string;
  };

  if (body.action === "deactivate") {
    await supabase.from("users").update({ is_active: false }).eq("id", guideId);
    await updateManagedGuideProfile(supabase, guideId, {
      guideProfileStatus: "deactivated",
    });
    await supabase.from("profiles").update({ marketplace_available: false }).eq("user_id", guideId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "archive") {
    await supabase.from("users").update({ is_active: false }).eq("id", guideId);
    await updateManagedGuideProfile(supabase, guideId, { guideProfileStatus: "archived" });
    await supabase.from("profiles").update({ marketplace_available: false }).eq("user_id", guideId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reactivate") {
    await supabase.from("users").update({ is_active: true }).eq("id", guideId);
    await updateManagedGuideProfile(supabase, guideId, { guideProfileStatus: "draft" });
    await supabase.from("profiles").update({ marketplace_available: true }).eq("user_id", guideId);
    return NextResponse.json({ ok: true });
  }

  if (body.guideProfileStatus === "published") {
    const { data: user } = await supabase
      .from("users")
      .select("first_name, last_name, guide_tier")
      .eq("id", guideId)
      .maybeSingle();
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", guideId)
      .maybeSingle();

    if (!prof?.profile_slug) {
      return NextResponse.json({ ok: false, error: "Profile slug missing" }, { status: 400 });
    }

    const publishCheck = validateGuideMarketplaceProfile(
      marketplaceInputFromProfileRows(
        { first_name: user?.first_name, last_name: user?.last_name },
        prof as Record<string, unknown>
      )
    );
    if (!publishCheck.ok) {
      return NextResponse.json(
        { ok: false, error: publishCheck.error, field: publishCheck.field },
        { status: 400 }
      );
    }

    await updateManagedGuideProfile(supabase, guideId, { guideProfileStatus: "published" });
    await supabase.from("profiles").update({ marketplace_available: true }).eq("user_id", guideId);
    return NextResponse.json({ ok: true, publicProfileUrl: publicProfileUrl(prof.profile_slug) });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

/**
 * Permanently delete a deactivated (or archived) managed guide profile.
 * Only the owning operator can delete, and only when the guide is not active.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperatorAccount();
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth.session;
  const { id: guideId } = await context.params;

  if (!(await assertOperatorOwnsGuide(supabase, userId, guideId))) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  const { data: guide, error: guideErr } = await supabase
    .from("users")
    .select("id, is_active, managed_by_operator_id, role")
    .eq("id", guideId)
    .maybeSingle();

  if (guideErr || !guide) {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  if (guide.managed_by_operator_id !== userId || guide.role !== "guide") {
    return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("guide_profile_status")
    .eq("user_id", guideId)
    .maybeSingle();

  const status = String(profile?.guide_profile_status || "");
  const isDeactivated =
    status === "deactivated" || status === "archived" || guide.is_active === false;

  if (!isDeactivated) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only deactivated or archived guide profiles can be deleted. Deactivate the guide first.",
      },
      { status: 400 }
    );
  }

  // Block delete while the guide still has an open hire.
  const { count: openHireCount } = await supabase
    .from("job_hiring_history")
    .select("id", { count: "exact", head: true })
    .eq("guide_id", guideId)
    .eq("is_closed", false);

  if ((openHireCount ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "This guide still has an active booking. End or complete it before deleting the profile.",
      },
      { status: 400 }
    );
  }

  // Clean operator-scoped + guide-owned rows, then the user.
  await supabase.from("operator_guide_invites").delete().eq("guide_user_id", guideId);
  await supabase.from("operator_roster").delete().eq("guide_id", guideId);
  await supabase.from("guide_tour_assignments").delete().eq("guide_id", guideId);
  await supabase.from("guide_commission_settings").delete().eq("user_id", guideId);
  await supabase.from("email_verification_codes").delete().eq("user_id", guideId);
  await supabase.from("password_reset_tokens").delete().eq("user_id", guideId);
  await supabase.from("password_reset_codes").delete().eq("user_id", guideId);
  await supabase.from("job_applications").delete().eq("applicant_id", guideId);

  // Closed hiring history + related end requests
  const { data: hiringRows } = await supabase
    .from("job_hiring_history")
    .select("id")
    .eq("guide_id", guideId);
  const hiringIds = (hiringRows ?? []).map((h) => (h as { id: string }).id);
  if (hiringIds.length > 0) {
    await supabase.from("job_end_requests").delete().in("hiring_history_id", hiringIds);
    await supabase.from("job_hiring_history").delete().in("id", hiringIds);
  }

  await supabase.from("reviews").delete().eq("reviewee_id", guideId);
  await supabase.from("reviews").delete().eq("reviewer_id", guideId);

  // Tours owned by this managed guide (if any)
  const { data: tours } = await supabase.from("tour").select("id").eq("user_id", guideId);
  const tourIds = (tours ?? []).map((t) => (t as { id: string }).id);
  if (tourIds.length > 0) {
    await supabase.from("guide_tour_assignments").delete().in("tour_id", tourIds);
    await supabase.from("tour").delete().in("id", tourIds);
  }

  await supabase.from("profiles").delete().eq("user_id", guideId);

  const { error: deleteErr } = await supabase.from("users").delete().eq("id", guideId);
  if (deleteErr) {
    console.error("[operator/my-guides DELETE]", deleteErr);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not delete this guide because related records still reference them. Contact support if this continues.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, message: "Guide profile deleted." });
}
