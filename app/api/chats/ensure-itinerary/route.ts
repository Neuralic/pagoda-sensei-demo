import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { readImpersonation } from "@/lib/admin-impersonation";
import {
  assertItineraryAccess,
  denyActivityUnlessAdmin,
  requireSessionActor,
} from "@/lib/itinerary-access";
import { isAgencyChatRole } from "@/lib/chat-pair-roles";

export const dynamic = "force-dynamic";

/**
 * POST /api/chats/ensure-itinerary
 * Create or get the Pagoda ↔ travel advisor support chat for an itinerary.
 * Body: { itineraryId: string }
 *
 * Note: guide_id stays NULL — it FKs to users, and Pagoda admins are in `admin`.
 * Access for admins is via itinerary_support rules in assertUserCanAccessChat.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionActor();
    if (!session.ok) return session.response;

    const { actor } = session;
    const body = (await req.json().catch(() => ({}))) as { itineraryId?: string };
    const itineraryId =
      typeof body.itineraryId === "string" ? body.itineraryId.trim() : "";

    if (!itineraryId) {
      return NextResponse.json(
        { ok: false, error: "Missing itineraryId" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const activityBlock = await denyActivityUnlessAdmin(actor, supabase);
    if (activityBlock) return activityBlock;

    const access = await assertItineraryAccess(supabase, actor, itineraryId, "read");
    if (!access.ok) return access.response;

    const advisorId = access.ownerUserId;

    const { data: advisor } = await supabase
      .from("users")
      .select("id, first_name, last_name, email, role")
      .eq("id", advisorId)
      .maybeSingle();

    if (!advisor || !isAgencyChatRole(advisor.role as string | null)) {
      return NextResponse.json(
        { ok: false, error: "Itinerary owner is not a travel advisor account" },
        { status: 400 }
      );
    }

    const { data: itinerary } = await supabase
      .from("itineraries")
      .select("id, name")
      .eq("id", itineraryId)
      .maybeSingle();

    const itineraryName =
      (itinerary as { name?: string | null } | null)?.name?.trim() || "Itinerary";

    // Existing support chat for this itinerary
    let chatId: string | null = null;
    const { data: existing, error: existingErr } = await supabase
      .from("chats")
      .select("id, agency_id, guide_id, client_name")
      .eq("itinerary_id", itineraryId)
      .eq("chat_kind", "itinerary_support")
      .maybeSingle();

    if (existingErr && !/itinerary_id|chat_kind/i.test(existingErr.message || "")) {
      console.error("[ensure-itinerary] lookup", existingErr);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    if (existing?.id) {
      chatId = existing.id as string;
    } else {
      // guide_id must remain null: FK → users, and admins are not in users.
      const insertPayload: Record<string, unknown> = {
        job_id: null,
        application_id: null,
        agency_id: advisorId,
        guide_id: null,
        client_name: itineraryName,
        itinerary_id: itineraryId,
        chat_kind: "itinerary_support",
      };

      const { data: created, error: createErr } = await supabase
        .from("chats")
        .insert(insertPayload)
        .select("id")
        .single();

      if (createErr) {
        if (/itinerary_id|chat_kind/i.test(createErr.message || "")) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Itinerary chat is not available yet. Please run the latest database migration.",
            },
            { status: 503 }
          );
        }
        if (/guide_id/i.test(createErr.message || "") && /null|not-null|violates/i.test(createErr.message || "")) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Please re-run migration 20260807_itinerary_support_chats.sql (guide_id must allow NULL).",
            },
            { status: 503 }
          );
        }
        if (createErr.code === "23505" || /unique/i.test(createErr.message || "")) {
          const { data: raced } = await supabase
            .from("chats")
            .select("id")
            .eq("itinerary_id", itineraryId)
            .eq("chat_kind", "itinerary_support")
            .maybeSingle();
          if (raced?.id) {
            chatId = raced.id as string;
          }
        }
        if (!chatId) {
          console.error("[ensure-itinerary] create", createErr);
          return NextResponse.json(
            { ok: false, error: createErr.message || "Failed to create chat" },
            { status: 500 }
          );
        }
      } else {
        chatId = created.id as string;
      }
    }

    if (!chatId) {
      return NextResponse.json({ ok: false, error: "Failed to create chat" }, { status: 500 });
    }

    // Only upsert the advisor into chat_participants (FK typically → users).
    // Admins access via assertUserCanAccessChat itinerary_support rule.
    const { error: upsertError } = await supabase.from("chat_participants").upsert(
      [{ chat_id: chatId, user_id: advisorId }],
      { onConflict: "chat_id,user_id" }
    );
    if (upsertError) {
      console.error("[ensure-itinerary] participants", upsertError);
    }

    // If the current actor is the advisor, also fine. If admin, try upsert but ignore FK failures.
    if (actor.isAdmin && actor.userId !== advisorId) {
      const { error: adminParticipantErr } = await supabase
        .from("chat_participants")
        .upsert([{ chat_id: chatId, user_id: actor.userId }], {
          onConflict: "chat_id,user_id",
        });
      if (adminParticipantErr) {
        // Expected when chat_participants.user_id references users only.
        console.warn(
          "[ensure-itinerary] admin participant skipped (likely FK to users):",
          adminParticipantErr.message
        );
      }
    }

    const advisorName =
      `${advisor.first_name ?? ""} ${advisor.last_name ?? ""}`.trim() ||
      advisor.email ||
      "Travel advisor";

    // An admin inside the advisor's account is still Pagoda: the session role reads as
    // `agent`, but the thread they are opening reaches the advisor, so the header should name
    // the advisor rather than telling them they are talking to Pagoda Support.
    const adminActing = actor.isAdmin || readImpersonation(await cookies()) != null;

    const peer = adminActing
      ? {
          id: advisorId,
          name: advisorName,
          role: "advisor" as const,
          email: advisor.email ?? null,
        }
      : {
          id: "pagoda-support",
          name: "Pagoda Support",
          role: "admin" as const,
          email: null as string | null,
        };

    return NextResponse.json({
      ok: true,
      chatId,
      itineraryId,
      itineraryName,
      peer,
      currentUserId: actor.userId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
