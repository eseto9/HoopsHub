/**
 * App icons for the PWA, from the same basketball mark as the header logo.
 *
 *   node scripts/make-icons.mjs
 *
 * any:      orange rounded tile (192, 512)
 * maskable: full-bleed orange, mark inside the 80% safe zone (512)
 * apple:    full-bleed 180 (iOS rounds corners itself)
 * badge:    white mark on transparent (Android notification badge, 96)
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");
const ORANGE = "#ff8a1f";
const ball = (stroke) => `
  <circle cx="12" cy="12" r="9.5" fill="none" stroke="${stroke}" stroke-width="2"/>
  <path d="M2.5 12h19M12 2.5v19M5.3 5.3c2.9 3.3 2.9 10.1 0 13.4M18.7 5.3c-2.9 3.3-2.9 10.1 0 13.4" fill="none" stroke="${stroke}" stroke-width="1.8"/>`;

function svg({ size, rounded, scale, bg = ORANGE, stroke = "#ffffff" }) {
  const mark = size * scale;
  const offset = (size - mark) / 2;
  const radius = rounded ? size * 0.225 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ""}
    <g transform="translate(${offset} ${offset}) scale(${mark / 24})">${ball(stroke)}</g>
  </svg>`;
}

const icons = [
  ["icon-192.png", svg({ size: 192, rounded: true, scale: 0.62 })],
  ["icon-512.png", svg({ size: 512, rounded: true, scale: 0.62 })],
  ["maskable-512.png", svg({ size: 512, rounded: false, scale: 0.5 })],
  ["apple-touch-icon.png", svg({ size: 180, rounded: false, scale: 0.6 })],
  ["badge-96.png", svg({ size: 96, rounded: false, scale: 0.8, bg: null })],
];

await mkdir(OUT, { recursive: true });
for (const [name, markup] of icons) {
  await sharp(Buffer.from(markup)).png().toFile(path.join(OUT, name));
  console.log("wrote public/icons/" + name);
}
