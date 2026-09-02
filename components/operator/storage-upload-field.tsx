"use client";

import { Label } from "@/components/ui/label";
import type { BucketName } from "@/lib/buckets";
import {
  validateIntroVideoFile,
  validateProfileImageDimensions,
} from "@/lib/guide-marketplace-validation";
import { getSignedUrls } from "@/lib/storage-sign-client";
import { uploadViaApi } from "@/lib/upload-client";
import { uploadFileToStorage } from "@/lib/upload-file-client";
import { uploadViaInviteApi } from "@/lib/upload-invite-client";
import { Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

type Props = {
  label: string;
  bucket: BucketName | string;
  folder?: string;
  accept?: string;
  value: string;
  onChange: (path: string) => void;
  previewUrl?: string | null;
  onPreviewUrl?: (url: string | null) => void;
  inviteToken?: string;
  hint?: string;
  required?: boolean;
  /** Called after upload succeeds and path is set (e.g. persist to profile immediately). */
  onUploaded?: (path: string) => void | Promise<void>;
};

export function StorageUploadField({
  label,
  bucket,
  folder,
  accept,
  value,
  onChange,
  previewUrl,
  onPreviewUrl,
  inviteToken,
  hint,
  required,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const isImage = accept?.startsWith("image");
  const isVideo = accept?.includes("video");
  const fileAccept =
    accept ||
    (label.toLowerCase().includes("video")
      ? "video/mp4,video/quicktime,.mp4,.mov"
      : "image/jpeg,image/png");

  // Prefer client-signed or fresh upload URL over a possibly stale server URL
  const displayPreview = localPreview ?? previewUrl ?? null;

  useEffect(() => {
    if (!value) {
      setLocalPreview(null);
      return;
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      setLocalPreview(value);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [signed] = await getSignedUrls([{ bucket: String(bucket), path: value }]);
        if (cancelled) return;
        setLocalPreview(signed?.signedUrl || signed?.publicUrl || null);
      } catch {
        if (!cancelled) setLocalPreview(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, bucket]);

  const handleFile = async (file: File) => {
    if (isImage) {
      const imgCheck = await validateProfileImageDimensions(file);
      if (!imgCheck.ok) {
        toast.error(imgCheck.error);
        return;
      }
    }
    if (isVideo) {
      const vidCheck = validateIntroVideoFile(file);
      if (!vidCheck.ok) {
        toast.error(vidCheck.error);
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const opts = { bucket, folder, signed: true, expiresIn: 60 * 60 * 24 };
      let res;
      if (inviteToken) {
        [res] = await uploadViaInviteApi(file, { ...opts, inviteToken });
      } else if (isVideo) {
        res = await uploadFileToStorage(file, {
          ...opts,
          useChunked: true,
          onProgress: setUploadProgress,
        });
      } else {
        [res] = await uploadViaApi(file, opts);
      }
      onChange(res.path);
      const url = res.signedUrl || res.publicUrl;
      if (url) {
        setLocalPreview(url);
        onPreviewUrl?.(url);
      } else if (isVideo && res.path) {
        try {
          const [signed] = await getSignedUrls([{ bucket: String(bucket), path: res.path }]);
          const preview = signed?.signedUrl || signed?.publicUrl || null;
          if (preview) {
            setLocalPreview(preview);
            onPreviewUrl?.(preview);
          }
        } catch {
          // path is saved; preview can load on next page visit
        }
      }
      try {
        await onUploaded?.(res.path);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save upload");
      }
      if (isVideo) toast.success("Video uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openPicker = () => {
    if (!uploading) inputRef.current?.click();
  };

  return (
    <div>
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={fileAccept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <div className="mt-2">
        {isImage && (
          <button
            type="button"
            disabled={uploading}
            onClick={openPicker}
            className="group relative shrink-0 rounded-xl border border-border bg-muted/30 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AA25] disabled:opacity-60 cursor-pointer"
            aria-label={value ? "Replace profile photo" : "Upload profile photo"}
          >
            {displayPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayPreview}
                alt="Profile photo preview"
                className="h-28 w-28 object-cover"
              />
            ) : (
              <div className="h-28 w-28 flex flex-col items-center justify-center gap-1 text-muted-foreground px-2">
                <Upload className="h-8 w-8 opacity-60" />
                <span className="text-xs text-center">Click to upload</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
              <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 px-2 text-center">
                {uploading ? "Uploading…" : displayPreview ? "Click to replace" : "Click to upload"}
              </span>
            </div>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            )}
          </button>
        )}

        {isVideo && (
          <div className="space-y-2 min-w-0 max-w-full">
            {displayPreview && (
              <video src={displayPreview} className="max-h-40 max-w-full rounded-lg border" controls />
            )}
            {uploading && uploadProgress > 0 && (
              <div className="max-w-md">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Uploading…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[#D4AA25] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={openPicker}
              className="flex items-center gap-2 text-sm text-[#af8a10] hover:underline disabled:opacity-60 cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading
                ? "Uploading…"
                : displayPreview
                  ? "Replace video"
                  : "Click to upload video"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
