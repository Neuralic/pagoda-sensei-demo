import type { NextRequest } from "next/server";

export function clientIpFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

export function clientUserAgent(req: NextRequest): string {
  return (req.headers.get("user-agent") || "").slice(0, 300);
}
