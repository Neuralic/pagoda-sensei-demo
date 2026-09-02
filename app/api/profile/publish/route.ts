import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  marketplaceInputFromProfileRows,
  updateManagedGuideProfile,
} from "@/lib/managed-guide-profile";
import { validateGuideMarketplaceProfile } from "@/lib/guide-marketplace-validation";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { buildPublicProfileUrl } from "@/lib/profile-refresh";
import { getActiveAdminEmails } from "@/lib/admin-emails";
import { sendGuideProfilePublishedAdminNotification } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publish the currently logged-in guide's marketplace profile (§3.3 validation). */
export async function POST() {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (!userId || role !== "guide") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServer();

  const { data: user } = await supabase
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", userId)
    .maybeSingle();

  const { data: prof } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
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

  const result = await updateManagedGuideProfile(supabase, userId, { guideProfileStatus: "published" });
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  await supabase.from("profiles").update({ marketplace_available: true }).eq("user_id", userId);

  const { data: publishedProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const publicProfileUrl = buildPublicProfileUrl(prof.profile_slug as string, { published: true });
  const guideName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || "Guide";
  const guideEmail = typeof user?.email === "string" ? user.email : "";

  void (async () => {
    try {
      const adminEmails = await getActiveAdminEmails();
      if (adminEmails.length > 0) {
        await sendGuideProfilePublishedAdminNotification(adminEmails, {
          guideName,
          guideEmail,
          profileSlug: prof.profile_slug as string,
          publicProfileUrl,
        });
      }
    } catch (e) {
      console.error("[profile/publish] admin notification failed", e);
    }
  })();

  return NextResponse.json({
    ok: true,
    guideProfileStatus: "published",
    publicProfileUrl,
    profileCompleteness: computeProfileCompleteness(
      publishedProfile as Record<string, unknown> | null
    ),
  });
}
