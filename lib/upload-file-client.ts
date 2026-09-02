import type { ClientUploadOptions, ClientUploadedFile } from "@/lib/upload-client";
import { uploadViaApi } from "@/lib/upload-client";

const CHUNK_SIZE = 3 * 1024 * 1024; // under Vercel's ~4.5MB body limit

export type UploadFileProgress = (percent: number) => void;

/** Upload a file via /api/upload, using chunked upload for large files. */
export async function uploadFileToStorage(
  file: File,
  opts: ClientUploadOptions & { onProgress?: UploadFileProgress; useChunked?: boolean }
): Promise<ClientUploadedFile> {
  const { onProgress, useChunked = false, ...apiOpts } = opts;
  const shouldChunk = useChunked && file.size > CHUNK_SIZE;

  if (!shouldChunk) {
    onProgress?.(10);
    const [result] = await uploadViaApi(file, apiOpts);
    onProgress?.(100);
    return result;
  }

  onProgress?.(5);

  const initRes = await fetch("/api/upload/chunk/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: apiOpts.bucket,
      folder: apiOpts.folder,
      originalName: file.name,
      contentType: file.type || "video/mp4",
      totalSize: file.size,
    }),
    credentials: "include",
  });

  if (!initRes.ok) {
    const errorData = await initRes.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || "Failed to initialize upload");
  }

  const { uploadId, path } = (await initRes.json()) as { uploadId?: string; path?: string };
  if (!uploadId || !path) {
    throw new Error("Failed to initialize upload");
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const chunkFormData = new FormData();
    chunkFormData.append("chunk", chunk);
    chunkFormData.append("uploadId", uploadId);
    chunkFormData.append("chunkIndex", String(chunkIndex));
    chunkFormData.append("totalChunks", String(totalChunks));
    chunkFormData.append("bucket", apiOpts.bucket);
    chunkFormData.append("path", path);

    const chunkRes = await fetch("/api/upload/chunk", {
      method: "POST",
      body: chunkFormData,
      credentials: "include",
    });

    if (!chunkRes.ok) {
      const errorData = await chunkRes.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error || `Failed to upload chunk ${chunkIndex + 1}`
      );
    }

    uploadedBytes += chunk.size;
    onProgress?.(10 + Math.round((uploadedBytes / file.size) * 80));
  }

  onProgress?.(92);

  const expiresIn = apiOpts.expiresIn ?? 60 * 60 * 24;
  const finalizeRes = await fetch("/api/upload/chunk/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      path,
      bucket: apiOpts.bucket,
      totalChunks,
      contentType: file.type || "video/mp4",
      createSignedUrl: Boolean(apiOpts.signed),
      expiresIn,
    }),
    credentials: "include",
  });

  if (!finalizeRes.ok) {
    const errorData = await finalizeRes.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || "Failed to finalize upload");
  }

  const finalizeData = (await finalizeRes.json()) as {
    path: string;
    publicUrl?: string | null;
    signedUrl?: string | null;
  };

  onProgress?.(100);

  return {
    name: file.name,
    size: file.size,
    type: file.type,
    path: finalizeData.path,
    publicUrl: finalizeData.publicUrl ?? null,
    signedUrl: finalizeData.signedUrl ?? null,
  };
}
