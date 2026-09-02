/**
 * Optimise an image for the app.
 *
 * Usage:
 *   node scripts/optimize-image.mjs <source> [--out public/assets/images/name] [--width 1600]
 *
 * Writes AVIF, WebP and a JPEG fallback, all stripped of metadata. Next.js resizes from
 * whatever it is given, so the point here is to stop a heavy original becoming the source of
 * every derivative — it costs on first paint, on every PDF export that inlines it, and on the
 * deploy bundle.
 *
 * AVIF is smallest and is what modern browsers take; WebP covers the rest; JPEG is there for
 * anything that renders outside a browser, which includes the PDF export.
 *
 * Reports before/after so it is obvious whether it was worth it.
 */

import sharp from "sharp";
import { statSync, existsSync, mkdirSync } from "node:fs";
import { dirname, basename, extname, join } from "node:path";

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

if (!source) {
  console.error("Usage: node scripts/optimize-image.mjs <source> [--out path/without-extension] [--width 1600]");
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`Not found: ${source}`);
  process.exit(1);
}

const width = Number(flag("width", 1600));
const outBase = flag("out", join("public/assets/images", basename(source, extname(source))));
mkdirSync(dirname(outBase), { recursive: true });

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const before = statSync(source).size;
const meta = await sharp(source).metadata();

// Never upscale: a 900px original stays 900px rather than being blown up and re-compressed.
const targetWidth = Math.min(width, meta.width ?? width);

const pipeline = () =>
  sharp(source).rotate().resize({ width: targetWidth, withoutEnlargement: true });

const avifPath = `${outBase}.avif`;
const webpPath = `${outBase}.webp`;
const jpgPath = `${outBase}.jpg`;

await pipeline().avif({ quality: 55, effort: 6 }).toFile(avifPath);
await pipeline().webp({ quality: 78, effort: 6 }).toFile(webpPath);
await pipeline().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(jpgPath);

const saved = (n) => `${(100 - (n / before) * 100).toFixed(0)}% smaller`;

console.log(`\nsource   ${basename(source)}  ${meta.width}×${meta.height}  ${kb(before)}`);
if ((meta.width ?? 0) < 1000) {
  console.log(`         note: small source — it will look soft anywhere it renders large.`);
}
console.log(`avif     ${avifPath}  ${targetWidth}px  ${kb(statSync(avifPath).size)}   (${saved(statSync(avifPath).size)})`);
console.log(`webp     ${webpPath}  ${targetWidth}px  ${kb(statSync(webpPath).size)}   (${saved(statSync(webpPath).size)})`);
console.log(`jpeg     ${jpgPath}  ${targetWidth}px  ${kb(statSync(jpgPath).size)}   (${saved(statSync(jpgPath).size)})`);
console.log(`\nReference the .avif via next/image, which falls back on its own. The .jpg is for\nthe PDF export, which renders outside the browser.\n`);
