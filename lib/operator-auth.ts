import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { bypassesResourceOwnership } from "@/lib/platform-access";
export type OperatorSession = {
  userId: string;
  supabase: ReturnType<typeof getSupabaseServer>;
};

/** Tour company / DMC account (is_operator) or legacy guide who uploads tours. */
export async function requireOperatorAccount(): Promise<
  { ok: true; session: OperatorSession } | { ok: false; response: NextResponse }
> {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;

  if (!userId || (role !== "guide" && role !== "admin")) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  const supabase = getSupabaseServer();

  if (bypassesResourceOwnership(role)) {
    return { ok: true, session: { userId, supabase } };
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, is_operator")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "User not found" }, { status: 404 }),
    };
  }

  if (!(user as { is_operator?: boolean }).is_operator) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Operator account required. Contact Pagoda to enable operator access, or register as a tour operator.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: { userId, supabase } };
}

export async function assertOperatorOwnsGuide(
  supabase: ReturnType<typeof getSupabaseServer>,
  operatorId: string,
  guideUserId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("id", guideUserId)
    .eq("managed_by_operator_id", operatorId)
    .maybeSingle();
  return Boolean(data);
}
