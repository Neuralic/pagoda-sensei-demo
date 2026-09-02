import type { ClientUploadOptions, ClientUploadedFile } from "@/lib/upload-client";

export async function uploadViaInviteApi(
  files: File | File[],
  opts: ClientUploadOptions & { inviteToken: string }
): Promise<ClientUploadedFile[]> {
  const fileArray = files instanceof File ? [files] : [...files];
  if (!fileArray.length) throw new Error("No files provided");
  if (!opts.inviteToken.trim()) throw new Error("Missing invite token");

  const results: ClientUploadedFile[] = [];
  for (const file of fileArray) {
    const fd = new FormData();
    fd.append("token", opts.inviteToken);
    fd.append("bucket", opts.bucket);
    if (opts.folder) fd.append("folder", opts.folder);
    if (opts.signed) fd.append("signed", "true");
    if (opts.expiresIn) fd.append("expiresIn", String(opts.expiresIn));
    fd.append("file", file);

    const res = await fetch("/api/auth/guide-invite/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Upload failed");
    }
    const data = (await res.json()) as { files: ClientUploadedFile[] };
    results.push(...data.files);
  }
  return results;
}
