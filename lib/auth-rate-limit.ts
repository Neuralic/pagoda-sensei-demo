import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { clientIpFromRequest } from "@/lib/request-meta";
import type { NextRequest } from "next/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

const memory = new Map<string, { count: number; startedAt: number }>();

function memoryHit(bucket: string, max: number): boolean {
  const now = Date.now();
  const row = memory.get(bucket);
  if (!row || now - row.startedAt > WINDOW_MS) {
    memory.set(bucket, { count: 1, startedAt: now });
    return false;
  }
  row.count += 1;
  return row.count > max;
}

async function dbHit(bucket: string, max: number): Promise<boolean | null> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("auth_rate_limits")
      .select("bucket, hit_count, window_started_at")
      .eq("bucket", bucket)
      .maybeSingle();
    if (error) return null;

    const now = Date.now();
    const started = data?.window_started_at ? new Date(data.window_started_at).getTime() : 0;
    if (!data || !started || now - started > WINDOW_MS) {
      await supabase.from("auth_rate_limits").upsert({
        bucket,
        hit_count: 1,
        window_started_at: new Date(now).toISOString(),
      });
      return false;
    }

    const next = Number(data.hit_count || 0) + 1;
    await supabase.from("auth_rate_limits").update({ hit_count: next }).eq("bucket", bucket);
    return next > max;
  } catch {
    return null;
  }
}

async function hit(bucket: string, max: number): Promise<boolean> {
  const fromDb = await dbHit(bucket, max);
  if (fromDb != null) return fromDb;
  return memoryHit(bucket, max);
}

export async function assertAuthRateLimit(
  req: NextRequest,
  kind: string,
  email?: string
): Promise<NextResponse | null> {
  const ip = clientIpFromRequest(req);
  const emailKey = (email || "").trim().toLowerCase() || "none";
  const blockedIp = await hit(`${kind}:ip:${ip}`, MAX_PER_IP);
  const blockedEmail = await hit(`${kind}:id:${ip}:${emailKey}`, MAX_PER_EMAIL);
  if (blockedIp || blockedEmail) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }
  return null;
}
