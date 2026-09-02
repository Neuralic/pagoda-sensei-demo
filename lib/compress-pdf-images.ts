/**
 * Downscale/compress photos inside the PDF print root before react-to-print.
 * Keeps all images and text; only reduces embedded pixel data so email stays viable.
 *
 * Print layouts show photos ~200px tall, but browsers otherwise embed full-resolution
 * originals (often multi‑MB each). We replace those with print-sized JPEGs.
 */

/** Longest edge for activity / cover photos (≈ print size @ 2×). */
const PHOTO_MAX_EDGE_PX = 720;
const PHOTO_JPEG_QUALITY = 0.52;

/** Guide avatars / small portraits. */
const AVATAR_MAX_EDGE_PX = 280;
const AVATAR_JPEG_QUALITY = 0.55;

function isUiChromeSrc(src: string): boolean {
  if (!src) return true;
  if (src.includes("/assets/icons/")) return true;
  if (src.includes("pdf_logo")) return true;
  if (src.includes("/assets/images/location")) return true;
  if (src.includes("/assets/images/clock")) return true;
  if (src.includes("/assets/images/calender")) return true;
  if (src.includes("/assets/images/large_calender")) return true;
  if (src.includes("placeholder.svg") || src.includes(".svg")) return true;
  return false;
}

function isCompressibleSrc(src: string): boolean {
  if (!src || isUiChromeSrc(src)) return false;
  // Already our compressed payload
  if (src.startsWith("data:image/jpeg") && src.length < 180_000) return false;
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("blob:") ||
    src.startsWith("data:image/") ||
    src.startsWith("/")
  );
}

function looksLikeAvatar(el: HTMLImageElement, src: string): boolean {
  if (el.dataset.pdfPhoto === "avatar") return true;
  const w = el.clientWidth || el.width || 0;
  const h = el.clientHeight || el.height || 0;
  if (w > 0 && h > 0 && w <= 120 && h <= 120) return true;
  if (src.includes("avatar") || src.includes("profile_picture")) return true;
  return false;
}

function toCompressedDataUrl(
  img: CanvasImageSource & { naturalWidth?: number; width?: number; naturalHeight?: number; height?: number },
  maxEdge: number,
  quality: number
): string | null {
  const w = Number(img.naturalWidth || img.width || 0);
  const h = Number(img.naturalHeight || img.height || 0);
  if (!w || !h) return null;

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tw, th);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Tainted canvas (CORS) — leave original
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

async function compressOne(el: HTMLImageElement): Promise<void> {
  const src = el.currentSrc || el.getAttribute("src") || "";
  if (!isCompressibleSrc(src)) return;
  if (el.dataset.pdfCompressed === "1") return;

  const avatar = looksLikeAvatar(el, src);
  const maxEdge = avatar ? AVATAR_MAX_EDGE_PX : PHOTO_MAX_EDGE_PX;
  const quality = avatar ? AVATAR_JPEG_QUALITY : PHOTO_JPEG_QUALITY;

  // Prefer the already-decoded DOM bitmap (faster; same CORS rules).
  let dataUrl: string | null = null;
  if (el.complete && (el.naturalWidth || 0) > 0) {
    dataUrl = toCompressedDataUrl(el, maxEdge, quality);
  }
  if (!dataUrl) {
    try {
      const image = await loadImage(src);
      dataUrl = toCompressedDataUrl(image, maxEdge, quality);
    } catch {
      return;
    }
  }
  if (!dataUrl) return;

  el.setAttribute("src", dataUrl);
  el.dataset.pdfCompressed = "1";
}

/**
 * Compress large photos under `root` in place for print/export.
 * Does not remove images or text — only shrinks pixel payloads.
 */
export async function compressPdfImagesForPrint(
  root: HTMLElement | null | undefined
): Promise<void> {
  if (!root || typeof document === "undefined") return;

  const imgs = Array.from(root.querySelectorAll("img"));
  // Limit concurrency so we don't spike memory on long itineraries
  const concurrency = 4;
  for (let i = 0; i < imgs.length; i += concurrency) {
    const slice = imgs.slice(i, i + concurrency);
    await Promise.all(slice.map((el) => compressOne(el)));
  }
}
