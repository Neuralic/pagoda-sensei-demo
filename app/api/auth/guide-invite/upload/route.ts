import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { findValidOperatorInvite } from "@/lib/operator-guide-invite";
import { uploadToStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const token = String(form.get("token") ?? "").trim();
    const bucket = String(form.get("bucket") ?? "");
    if (!token || !bucket) {
      return NextResponse.json({ error: "Missing token or bucket" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const inviteResult = await findValidOperatorInvite(supabase, token);
    if ("error" in inviteResult) {
      return NextResponse.json({ error: inviteResult.error }, { status: inviteResult.status });
    }

    const guideUserId = inviteResult.invite.guide_user_id;
    const folder =
      form.get("folder")?.toString() || `invites/${guideUserId}`;
    const createSignedUrl = form.get("signed")?.toString() === "true";
    const expiresIn = Number(form.get("expiresIn") ?? 0) || undefined;

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadToStorage(file, {
      bucket,
      folder,
      contentType: file.type,
      createSignedUrl,
      signedUrlExpiresIn: expiresIn,
    });

    return NextResponse.json({
      files: [
        {
          name: file.name,
          size: file.size,
          type: file.type,
          path: result.path,
          publicUrl: result.publicUrl,
          signedUrl: result.signedUrl,
        },
      ],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
