import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type TransferzAgentSession = { userId: string; role: string };

export async function requireTransferzAgent(): Promise<
  { ok: true } & TransferzAgentSession | { ok: false; response: NextResponse }
> {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (role !== "agent" && role !== "agency" && role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId, role };
}

export async function requireTransferzAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const jar = await cookies();
  const userId = jar.get("userId")?.value;
  const role = jar.get("role")?.value;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 }),
    };
  }
  return { ok: true, userId };
}
