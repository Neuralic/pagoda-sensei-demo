import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  ADMIN_ACCOUNT_TYPE_LABELS,
  resolveAdminAccountType,
} from "@/lib/admin-account-type";
import { maskSensitiveChatContent } from "@/lib/chat-message-sanitize";
import { BUCKETS } from "@/lib/buckets";
import { derivePresenceDisplay } from "@/lib/presence";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  country: string | null;
  city: string | null;
  guide_number: string | null;
  guide_tier: string | null;
  guide_approved: boolean | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  is_operator: boolean | null;
  managed_by_operator_id: string | null;
  presence_state: string | null;
  presence_updated_at: string | null;
  last_active: string | null;
  created_at: string;
};

type ProfileRow = {
  bio: string | null;
  street: string | null;
  country: string | null;
  city: string | null;
  postal: string | null;
  website: string | null;
  contact_email: string | null;
  languages: unknown;
  specialties: unknown;
  destinations: unknown;
  profile_picture_path: string | null;
  cover_image_path: string | null;
  guide_profile_status: string | null;
  certification_status: string | null;
  marketplace_available: boolean | null;
  years_experience: number | null;
  profile_slug: string | null;
};

function displayName(u: Pick<UserRow, "first_name" | "last_name" | "email">): string {
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return name || u.email || "User";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

async function signStoragePath(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null | undefined
): Promise<string | null> {
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("http")) return path;
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Admin overall access — full user dossier shown entirely on admin pages.
 * No agent/guide login required.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id: userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "User id required" }, { status: 400 });
    }

    const [{ data: user, error: userErr }, { data: profile }] = await Promise.all([
      auth.supabase
        .from("users")
        .select(
          "id, first_name, last_name, email, phone, role, country, city, guide_number, guide_tier, guide_approved, is_active, is_verified, is_operator, managed_by_operator_id, presence_state, presence_updated_at, last_active, created_at"
        )
        .eq("id", userId)
        .maybeSingle(),
      auth.supabase
        .from("profiles")
        .select(
          "bio, street, country, city, postal, website, contact_email, languages, specialties, destinations, profile_picture_path, cover_image_path, guide_profile_status, certification_status, marketplace_available, years_experience, profile_slug"
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (userErr) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const row = user as UserRow;
    const profileRow = (profile as ProfileRow | null) ?? null;
    const accountType = resolveAdminAccountType({
      role: row.role ?? "",
      is_operator: row.is_operator,
      managed_by_operator_id: row.managed_by_operator_id,
    });
    const role = row.role || "";

    const [avatarUrl, coverUrl, panicRes] = await Promise.all([
      signStoragePath(auth.supabase, BUCKETS.avatars, profileRow?.profile_picture_path),
      signStoragePath(auth.supabase, BUCKETS.coverImages, profileRow?.cover_image_path),
      auth.supabase
        .from("panic")
        .select("ticket_id", { count: "exact", head: true })
        .eq("sender_id", userId),
    ]);

    const [
      itinerariesRes,
      toursRes,
      jobsRes,
      applicationsRes,
      chatsAgencyRes,
      chatsGuideRes,
      managedGuidesRes,
      operatorRes,
    ] = await Promise.all([
      role === "agent"
        ? auth.supabase
            .from("itineraries")
            .select("id, name, location, status, start_date, end_date, created_at, build_mode")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      role === "guide"
        ? auth.supabase
            .from("tour")
            .select("id, name, location, status, created_at, activity_type")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      role === "agent"
        ? auth.supabase
            .from("jobs")
            .select("id, name, location, start_time, end_time, created_at, itinerary_id")
            .eq("created_by", userId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      role === "guide"
        ? auth.supabase
            .from("job_applications")
            .select("id, job_id, offer_status, submitted_at, created_at")
            .eq("applicant_id", userId)
            .order("submitted_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      auth.supabase
        .from("chats")
        .select("id, job_id, agency_id, guide_id, client_name, created_at")
        .eq("agency_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      auth.supabase
        .from("chats")
        .select("id, job_id, agency_id, guide_id, client_name, created_at")
        .eq("guide_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      row.is_operator
        ? auth.supabase
            .from("users")
            .select("id, first_name, last_name, email, guide_approved, is_active, created_at")
            .eq("managed_by_operator_id", userId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as UserRow[] }),
      row.managed_by_operator_id
        ? auth.supabase
            .from("users")
            .select("id, first_name, last_name, email")
            .eq("id", row.managed_by_operator_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const itineraries = itinerariesRes.data ?? [];
    const tours = toursRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const managedGuides = (managedGuidesRes.data ?? []) as UserRow[];
    const operator = operatorRes.data as UserRow | null;

    const appJobIds = [
      ...new Set(
        (applications as Array<{ job_id?: string }>)
          .map((a) => a.job_id)
          .filter(Boolean) as string[]
      ),
    ];
    const jobsById = new Map<string, { id: string; name: string | null }>();
    if (appJobIds.length > 0) {
      const { data: appJobs } = await auth.supabase
        .from("jobs")
        .select("id, name")
        .in("id", appJobIds);
      for (const j of appJobs ?? []) {
        jobsById.set(j.id as string, j as { id: string; name: string | null });
      }
    }

    const chatMap = new Map<string, Record<string, unknown>>();
    for (const c of [...(chatsAgencyRes.data ?? []), ...(chatsGuideRes.data ?? [])]) {
      chatMap.set(c.id as string, c);
    }
    const chats = Array.from(chatMap.values()).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );

    const chatParticipantIds = new Set<string>();
    for (const c of chats) {
      if (c.agency_id) chatParticipantIds.add(c.agency_id as string);
      if (c.guide_id) chatParticipantIds.add(c.guide_id as string);
    }
    chatParticipantIds.delete(userId);

    const usersById = new Map<string, UserRow>();
    if (chatParticipantIds.size > 0) {
      const { data: peers } = await auth.supabase
        .from("users")
        .select("id, first_name, last_name, email, role")
        .in("id", Array.from(chatParticipantIds));
      for (const p of peers ?? []) {
        usersById.set(p.id as string, p as UserRow);
      }
    }

    const chatIds = chats.map((c) => c.id as string);
    const lastByChat = new Map<string, { message: string; created_at: string }>();
    if (chatIds.length > 0) {
      const { data: lastMsgs } = await auth.supabase
        .from("chat_messages")
        .select("chat_id, message, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(chatIds.length * 2, 200));

      for (const m of lastMsgs ?? []) {
        const cid = m.chat_id as string;
        if (!lastByChat.has(cid)) {
          lastByChat.set(cid, {
            message: maskSensitiveChatContent((m.message as string) || "").slice(0, 120),
            created_at: (m.created_at as string) || "",
          });
        }
      }
    }

    const conversations = chats.map((c) => {
      const otherId =
        (c.agency_id as string) === userId
          ? (c.guide_id as string)
          : (c.agency_id as string);
      const other = usersById.get(otherId);
      const last = lastByChat.get(c.id as string);
      return {
        id: c.id as string,
        client_name: (c.client_name as string | null) ?? null,
        other_name: other ? displayName(other) : "User",
        other_role: other?.role ?? null,
        last_message: last?.message ?? "",
        last_message_at: last?.created_at || (c.created_at as string),
        created_at: c.created_at as string,
      };
    });

    const presence = derivePresenceDisplay(row.presence_state, row.presence_updated_at);

    return NextResponse.json({
      ok: true,
      user: {
        id: row.id,
        name: displayName(row),
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        country: row.country || profileRow?.country || null,
        city: row.city || profileRow?.city || null,
        guide_number: row.guide_number,
        guide_tier: row.guide_tier,
        account_type: accountType,
        account_type_label: ADMIN_ACCOUNT_TYPE_LABELS[accountType],
        guide_approved: row.guide_approved,
        is_active: row.is_active,
        is_verified: row.is_verified,
        is_operator: row.is_operator,
        managed_by_operator_id: row.managed_by_operator_id,
        managed_by_operator_name: operator ? displayName(operator) : null,
        last_active: row.last_active,
        presence_display: presence,
        alert_count: panicRes.count ?? 0,
        created_at: row.created_at,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        bio: profileRow?.bio ?? null,
        street: profileRow?.street ?? null,
        postal: profileRow?.postal ?? null,
        website: profileRow?.website ?? null,
        contact_email: profileRow?.contact_email ?? null,
        languages: asStringList(profileRow?.languages),
        specialties: asStringList(profileRow?.specialties),
        destinations: asStringList(profileRow?.destinations),
        guide_profile_status: profileRow?.guide_profile_status ?? null,
        certification_status: profileRow?.certification_status ?? null,
        marketplace_available: profileRow?.marketplace_available ?? null,
        years_experience: profileRow?.years_experience ?? null,
        profile_slug: profileRow?.profile_slug ?? null,
      },
      itineraries: itineraries.map((i) => ({
        id: i.id,
        name: i.name,
        location: i.location,
        status: i.status,
        start_date: i.start_date,
        end_date: i.end_date,
        created_at: i.created_at,
        build_mode: i.build_mode,
      })),
      tours: tours.map((t) => ({
        id: t.id,
        name: t.name,
        location: t.location,
        status: t.status,
        activity_type: t.activity_type,
        created_at: t.created_at,
      })),
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        location: j.location,
        start_time: j.start_time,
        end_time: j.end_time,
        created_at: j.created_at,
        itinerary_id: j.itinerary_id,
      })),
      applications: (applications as Array<Record<string, unknown>>).map((a) => ({
        id: a.id,
        job_id: a.job_id,
        job_name: jobsById.get(a.job_id as string)?.name ?? "Job",
        offer_status: a.offer_status,
        submitted_at: a.submitted_at ?? a.created_at,
      })),
      conversations,
      managed_guides: managedGuides.map((g) => ({
        id: g.id,
        name: displayName(g),
        email: g.email,
        guide_approved: g.guide_approved,
        is_active: g.is_active,
        created_at: g.created_at,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * Admin update of user account + profile fields (name, logo path, website, etc.)
 * without needing Access account / impersonation.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id: userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing user id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const userUpdates: Record<string, unknown> = {};
    if (typeof body.first_name === "string") userUpdates.first_name = body.first_name.trim();
    if (typeof body.last_name === "string") userUpdates.last_name = body.last_name.trim();
    if (typeof body.phone === "string" || body.phone === null) {
      userUpdates.phone =
        typeof body.phone === "string" ? body.phone.trim() || null : null;
    }

    const profileUpdates: Record<string, unknown> = {};
    if (typeof body.website === "string" || body.website === null) {
      profileUpdates.website =
        typeof body.website === "string" ? body.website.trim() || null : null;
    }
    if (typeof body.bio === "string" || body.bio === null) {
      profileUpdates.bio =
        typeof body.bio === "string" ? body.bio.trim() || null : null;
    }
    if (typeof body.contact_email === "string" || body.contact_email === null) {
      profileUpdates.contact_email =
        typeof body.contact_email === "string" ? body.contact_email.trim() || null : null;
    }
    if (typeof body.profile_picture_path === "string" || body.profile_picture_path === null) {
      profileUpdates.profile_picture_path =
        typeof body.profile_picture_path === "string"
          ? body.profile_picture_path.trim() || null
          : null;
    }

    if (Object.keys(userUpdates).length === 0 && Object.keys(profileUpdates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data: existingUser, error: userErr } = await auth.supabase
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !existingUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (Object.keys(userUpdates).length > 0) {
      const { error } = await auth.supabase.from("users").update(userUpdates).eq("id", userId);
      if (error) {
        return NextResponse.json({ ok: false, error: "Failed to update user" }, { status: 500 });
      }
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { data: existingProfile } = await auth.supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingProfile) {
        const { ensureGuideMarketplaceProfile } = await import(
          "@/lib/ensure-guide-marketplace-profile"
        );
        const created = await ensureGuideMarketplaceProfile(auth.supabase, userId);
        if ("error" in created) {
          return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
        }
      }

      const { error } = await auth.supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", userId);
      if (error) {
        return NextResponse.json({ ok: false, error: "Failed to update profile" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
