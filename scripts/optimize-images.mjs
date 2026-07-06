#!/usr/bin/env node
/**
 * Optimize the website's PNG screenshots and generate WebP twins.
 *
 *   node scripts/optimize-images.mjs
 *
 * For every `*.png` in apps/website/public/images:
 *   - if a matching `*.webp` already exists, it's left untouched (skipped);
 *   - otherwise the PNG is recompressed losslessly in place and an optimized
 *     `*.webp` twin is written next to it.
 *
 * Uses `sharp` (already a dependency via Astro) — no extra installs.
 */
import sharp from 'sharp';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolve the images folder relative to this file, so it runs from any cwd.
const IMAGES_DIR = fileURLToPath(
  new URL('../apps/website/public/images', import.meta.url)
);

// WebP quality for screenshots (lossy). 80 is a good size/clarity balance;
// bump toward 90 (or switch to `nearLossless: true`) if UI text looks soft.
const WEBP_QUALITY = 80;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

const files = (await readdir(IMAGES_DIR))
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();

let converted = 0;
let skipped = 0;
let pngSaved = 0;
let webpTotal = 0;

for (const file of files) {
  const pngPath = `${IMAGES_DIR}/${file}`;
  const webpPath = pngPath.replace(/\.png$/i, '.webp');

  // Skip PNGs that already have a WebP twin.
  if (existsSync(webpPath)) {
    skipped++;
    console.log(`↷ skip   ${file} (webp exists)`);
    continue;
  }

  const before = (await stat(pngPath)).size;

  // Optimize the PNG losslessly in place (buffer first, then overwrite).
  const optimizedPng = await sharp(pngPath)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  if (optimizedPng.length < before) {
    await writeFile(pngPath, optimizedPng);
  }
  const afterPng = Math.min(optimizedPng.length, before);
  pngSaved += before - afterPng;

  // Write the optimized WebP twin.
  await sharp(pngPath).webp({ quality: WEBP_QUALITY }).toFile(webpPath);
  const webpSize = (await stat(webpPath)).size;
  webpTotal += webpSize;
  converted++;

  console.log(
    `✓ ${file}  png ${kb(before)}→${kb(afterPng)}  ·  webp ${kb(webpSize)}`
  );
}

console.log(
  `\nDone. Converted ${converted}, skipped ${skipped}. ` +
    `PNG saved ${kb(pngSaved)}; WebP twins total ${kb(webpTotal)}.`
);
