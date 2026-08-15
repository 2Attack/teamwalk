#!/usr/bin/env node
/**
 * App icon generator: favicon, iOS icon, and the web manifest set.
 *
 * The artwork is a citrus slice on a 16×16 pixel grid. The walk sprite from
 * `public/sprites/walk.svg` did not fit this role: a figure frame is 10×27
 * pixels, which shrinks to an unreadable vertical sliver on a 16×16 favicon.
 * The slice stays legible at 16 pixels and matches the app's name.
 *
 * The grid is built in code, not as an ASCII matrix: the circle and segment
 * cuts are a formula — tweaking a radius by number beats redrawing 256 chars.
 *
 * Colors come from the app palette (`app/globals.css`) and the sprite: the
 * background matches `--background` and `themeColor` in layout.tsx, flesh and
 * rind come from the walk sprite's palette, so the icon fits the set.
 *
 * Run: `npm run gen:icons:app` (needs `sharp` — it ships with Next's deps).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const APP = join(ROOT, 'app');

/** Pixel grid side. All raster sizes are multiples of it, except 180 (see below). */
const GRID = 16;

const COLOR = {
  /** `--background` from globals.css; the same color is declared as themeColor. */
  bg: '#17130F',
  /** Rind and cuts between segments — the dark orange from the sprite palette. */
  rind: '#C96C00',
  /** Flesh — the primary orange from the same palette. */
  flesh: '#FF8A00',
};

/**
 * Slice pixels. `null` — transparent.
 *
 * Cuts form a cross rather than six rays: at 16 pixels a 60° ray degrades
 * into a dotted line of separate points and reads as noise.
 */
function slicePixels() {
  const c = GRID / 2;
  const rows = [];
  for (let y = 0; y < GRID; y += 1) {
    const row = [];
    for (let x = 0; x < GRID; x += 1) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);

      if (d > 7.4) row.push(null);
      else if (d > 5.9) row.push(COLOR.rind);
      else if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) row.push(COLOR.rind);
      else row.push(COLOR.flesh);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * SVG from the grid. Adjacent same-color pixels in a row merge into one rect:
 * without this the file would hold 256 rectangles instead of about forty.
 *
 * `padding` is the fraction of the side left empty at the edges. Needed for the
 * Android maskable icon: the system crops it to its own mask, and the artwork
 * must fit the safe zone or the slice gets its edges cut off.
 */
function toSvg({ background = null, padding = 0 } = {}) {
  const rows = slicePixels();
  const inner = GRID * (1 - padding * 2);
  const offset = (GRID - inner) / 2;
  const scale = inner / GRID;

  const parts = [];
  if (background) parts.push(`<rect width="${GRID}" height="${GRID}" fill="${background}"/>`);

  for (let y = 0; y < GRID; y += 1) {
    let run = null;
    for (let x = 0; x <= GRID; x += 1) {
      const color = x < GRID ? rows[y][x] : null;
      if (run && run.color === color) {
        run.width += 1;
        continue;
      }
      if (run) {
        const rx = offset + run.x * scale;
        const ry = offset + y * scale;
        parts.push(
          `<rect x="${+rx.toFixed(4)}" y="${+ry.toFixed(4)}" width="${+(run.width * scale).toFixed(4)}" height="${+scale.toFixed(4)}" fill="${run.color}"/>`,
        );
      }
      run = color ? { color, x, width: 1 } : null;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/**
 * ICO container around a ready PNG.
 *
 * `sharp` cannot write ICO, but a real favicon is needed: browsers fetch
 * `/favicon.ico` on their own, and without it the tab would keep the default
 * Next logo. Since Vista, ICO can store PNG as-is, so a 22-byte header suffices.
 */
function toIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 — icon (2 would be a cursor)
  header.writeUInt16LE(1, 4); // one image in the file

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

const transparent = toSvg();
const opaque = toSvg({ background: COLOR.bg });
// 20% margin on each side — the maskable safe zone per the W3C spec.
const maskable = toSvg({ background: COLOR.bg, padding: 0.2 });

// Vector favicon: the pixel grid scales without blur on any screen.
writeFileSync(join(APP, 'icon.svg'), transparent);
writeFileSync(join(APP, 'favicon.ico'), toIco(await png(transparent, 32), 32));

// iOS applies its own mask and fills transparency with black — ship it opaque.
// 180 is not a multiple of 16, but it is the only off-grid size and invisible to the eye.
writeFileSync(join(APP, 'apple-icon.png'), await png(opaque, 180));

writeFileSync(join(PUBLIC, 'icon-192.png'), await png(opaque, 192));
writeFileSync(join(PUBLIC, 'icon-512.png'), await png(opaque, 512));
writeFileSync(join(PUBLIC, 'icon-maskable-512.png'), await png(maskable, 512));

console.log('Icons built: app/icon.svg, app/favicon.ico, app/apple-icon.png,');
console.log('public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png');
