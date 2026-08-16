#!/usr/bin/env node
/**
 * Static pixel asset generator for TeamWalk (ASSETS zone).
 *
 * Produces:
 *   1. `public/avatars/pixel-01..24.svg` — 24 DiceBear portraits, `pixel-art` style.
 *   2. `public/sprites/walk.svg` — 256×32 spritesheet: 8 walk-cycle frames, 32×32 each.
 *
 * No network requests at build or runtime: DiceBear runs as a local package at
 * generation time and the result is committed as static assets.
 * The sprite is still described by matrices and palettes right here.
 * Icons live separately — see `scripts/gen-icons.mjs`.
 * Run: `npm run gen:assets`.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pixelArt } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ------------------------------------------------------------------ */
/* Shared pixel-grid utilities                                         */
/* ------------------------------------------------------------------ */

/** A grid is an array of char arrays; '.' means a transparent pixel. */
const gridFromRows = (rows) => rows.map((r) => r.split(''));

const emptyGrid = (w, h) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));

const set = (g, x, y, ch) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
};

const fill = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch);
};

const pxs = (g, list, ch) => list.forEach(([x, y]) => set(g, x, y, ch));

/** Grid integrity check — catches typos in the ASCII matrices. */
function assertGrid(g, w, h, name) {
  if (g.length !== h) throw new Error(`${name}: ${g.length} rows, expected ${h}`);
  g.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${name}: row ${y} has length ${row.length}, expected ${w}`);
  });
}

/* ------------------------------------------------------------------ */
/* SVG serialization                                                   */
/* ------------------------------------------------------------------ */

/** Each pixel is its own <rect width="1" height="1">, grouped by color. */
function gridToSvg(g, palette, { size, viewBox }) {
  const buckets = new Map();
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (!color) throw new Error(`No color for char "${ch}"`);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color).push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const groups = [...buckets].map(([color, rects]) => `<g fill="${color}">${rects.join('')}</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"` +
    ` viewBox="${viewBox}" shape-rendering="crispEdges">${groups.join('')}</svg>\n`
  );
}

/** For the sprite, horizontal runs of one color are merged — the file bloats otherwise. */
function gridToSvgRuns(g, palette, { size, viewBox }) {
  const buckets = new Map();
  for (let y = 0; y < g.length; y++) {
    let x = 0;
    while (x < g[y].length) {
      const ch = g[y][x];
      if (ch === '.') { x++; continue; }
      let end = x;
      while (end + 1 < g[y].length && g[y][end + 1] === ch) end++;
      const color = palette[ch];
      if (!color) throw new Error(`No color for char "${ch}"`);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color).push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1"/>`);
      x = end + 1;
    }
  }
  const groups = [...buckets].map(([color, rects]) => `<g fill="${color}">${rects.join('')}</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"` +
    ` viewBox="${viewBox}" shape-rendering="crispEdges">${groups.join('')}</svg>\n`
  );
}

/* ------------------------------------------------------------------ */
/* Palette (aligned with app/globals.css)                */
/* ------------------------------------------------------------------ */

const OUTLINE = '#17130F';
const CITRUS = '#FF8A00';
const LIME = '#A3E635';

/** Skin tones: base / shadow / mouth. Five tones against the required minimum of four. */
const SKIN = {
  light: { s: '#F2C89A', d: '#D6A275', m: '#A05C4A' },
  fair: { s: '#E8B48A', d: '#C68E62', m: '#94513F' },
  tan: { s: '#C98B5A', d: '#A66B3E', m: '#7E4433' },
  brown: { s: '#9C6239', d: '#7A4728', m: '#5E3420' },
  deep: { s: '#6E4426', d: '#553017', m: '#3E2314' },
};

/** Hair colors: base / shadow. */
const HAIR = {
  ginger: ['#C75B12', '#96430C'],
  copper: ['#D9722A', '#A8511A'],
  auburn: ['#943F22', '#6E2C16'],
  darkbrown: ['#4B3423', '#332215'],
  black: ['#2E251C', '#1B1610'],
  blond: ['#E0BE6C', '#B8964B'],
  platinum: ['#EFE0BE', '#C4B590'],
  grey: ['#B5ADA0', '#8B8375'],
  ash: ['#8B6B45', '#6A5033'],
  lightbrown: ['#A87A4C', '#7F5934'],
};

/** Muted clothing colors + the two UI accents. */
const SHIRT = {
  steel: '#3F5B72',
  navy: '#2F4858',
  slate: '#46586B',
  olive: '#4A6B52',
  moss: '#5C7048',
  brick: '#7A4B3A',
  clay: '#9A5F45',
  sand: '#8A6A45',
  ash: '#5B5147',
  plum: '#6E3B4B',
  citrus: CITRUS,
  lime: LIME,
  cream: '#C9BFA8',
  rust: '#A8552A',
};

/* ------------------------------------------------------------------ */
/* Base 16×16 portrait template                                        */
/* ------------------------------------------------------------------ */
/*
 *  o — outline       s — skin       d — skin shadow  m — mouth
 *  e — eye           h — hair       H — hair shadow  b — beard
 *  g — glasses rim   c — headwear                    C — headwear accent
 *  t — shirt         T — clothing accent
 *
 *  Head: outline at y=3 and y=11, face at x=5..10 / y=4..10 — identical
 *  placement across all 24 portraits so the set reads as one collection.
 */
const BASE = [
  '................', // 0
  '................', // 1
  '................', // 2
  '.....oooooo.....', // 3  top of skull
  '....ohhhhhho....', // 4  hair
  '....ohhhhhho....', // 5  hair / bangs
  '....osssssso....', // 6  forehead
  '....osesseso....', // 7  eyes
  '....osssdsso....', // 8  nose
  '....ossmmsso....', // 9  mouth
  '....osssssso....', // 10 chin
  '.....oooooo.....', // 11 jawline
  '......oddo......', // 12 neck
  '...otttoottto...', // 13 shoulders + collar
  '..otttttttttto..', // 14 torso
  '.otttttttttttto.', // 15 torso
];

const baseGrid = () => gridFromRows(BASE);

/* ---- hairstyles -------------------------------------------------- */

/**
 * Voluminous hair cap: the crown becomes hair, the outline moves up.
 * `top` is the topmost hair row (3 — slicked-back, 1 — voluminous).
 */
function hairCrown(g, top = 3) {
  fill(g, 4, top, 11, 3, 'h');
  fill(g, 4, top - 1, 11, top - 1, 'o');
  set(g, 3, 3, 'o');
  set(g, 12, 3, 'o');
}

/**
 * Below the jawline the head silhouette narrows, leaving a one-pixel hole
 * under side elements (hair, hood). This function closes it.
 */
function fillNeckGap(g, yEnd, ch) {
  if (yEnd < 11) return;
  pxs(g, [[4, 11], [11, 11]], ch);
  if (yEnd >= 12) pxs(g, [[4, 12], [5, 12], [10, 12], [11, 12]], ch);
  else pxs(g, [[4, 12], [11, 12]], 'o');
}

/** Side strands: hair covers the face outline, with a new outline outside it. */
function hairSides(g, yEnd, yStart = 3) {
  for (let y = yStart; y <= yEnd; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, yStart - 1, 3, yStart - 1, 'o');
  fill(g, 12, yStart - 1, 13, yStart - 1, 'o');
  fill(g, 2, yEnd + 1, 3, yEnd + 1, 'o');
  fill(g, 12, yEnd + 1, 13, yEnd + 1, 'o');
  fillNeckGap(g, yEnd, 'h');
}

/** Bangs: row 5 fully covered by hair, with strands reaching the temple. */
function bangs(g) {
  fill(g, 5, 5, 10, 5, 'h');
  set(g, 5, 6, 'h');
  set(g, 10, 6, 'H');
}

/** Buzz cut — almost no hair, only a thin ridge shows. */
function crop(g) {
  fill(g, 5, 4, 10, 4, 'h');
  fill(g, 5, 5, 10, 5, 'H');
}

/** Bald: hair rows become skin, ears are added. */
function bald(g) {
  fill(g, 5, 4, 10, 4, 's');
  fill(g, 5, 5, 10, 5, 's');
  ears(g);
}

function ears(g) {
  set(g, 4, 8, 'd');
  set(g, 11, 8, 'd');
}

/** Hair peeking out from under headwear — hair color is unreadable otherwise. */
function sideburns(g, y0 = 6, y1 = 8) {
  for (let y = y0; y <= y1; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, y1 + 1, 3, y1 + 1, 'o');
  fill(g, 12, y1 + 1, 13, y1 + 1, 'o');
}

/** Ponytail: a strand behind the right shoulder. */
function ponytail(g) {
  hairCrown(g);
  for (let y = 3; y <= 5; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
  }
  fill(g, 2, 2, 3, 2, 'o');
  fill(g, 2, 6, 3, 6, 'o');
  fill(g, 12, 2, 14, 2, 'o');
  for (let y = 3; y <= 10; y++) {
    set(g, 12, y, 'h');
    set(g, 13, y, y % 2 ? 'H' : 'h');
    set(g, 14, y, 'o');
  }
  fill(g, 12, 11, 14, 11, 'o');
}

/** Two braids along the shoulders with a hair-tie band. */
function braids(g) {
  hairCrown(g);
  hairSides(g, 9);
  for (let y = 10; y <= 13; y++) {
    const ch = y === 12 ? 'C' : y % 2 ? 'H' : 'h';
    set(g, 3, y, ch);
    set(g, 2, y, 'o');
    set(g, 12, y, ch);
    set(g, 13, y, 'o');
  }
  pxs(g, [[2, 14], [3, 14], [12, 14], [13, 14]], 'o');
}

/** Dreads: strands with alternating tones, hanging below the shoulders. */
function dreads(g) {
  hairCrown(g, 1);
  for (let y = 1; y <= 13; y++) {
    set(g, 3, y, y % 3 === 0 ? 'H' : 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, y % 3 === 1 ? 'H' : 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 0, 3, 0, 'o');
  fill(g, 12, 0, 13, 0, 'o');
  pxs(g, [[2, 14], [3, 14], [12, 14], [13, 14]], 'o');
  fillNeckGap(g, 13, 'h');
}

/** Afro: wide volume around the head. */
function afro(g) {
  hairCrown(g, 1);
  fill(g, 3, 2, 12, 5, 'h');
  for (let y = 2; y <= 5; y++) {
    set(g, 2, y, 'o');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 1, 3, 1, 'o');
  fill(g, 12, 1, 13, 1, 'o');
  fill(g, 2, 6, 3, 6, 'o');
  fill(g, 12, 6, 13, 6, 'o');
  // shadow "speckles" for texture
  pxs(g, [[4, 2], [7, 1], [10, 2], [3, 4], [12, 3], [6, 3], [9, 4]], 'H');
}

/** Curls: a bumpy crown and ringlets at the temples. */
function curly(g) {
  hairCrown(g, 1);
  pxs(g, [[4, 0], [5, 0], [8, 0], [9, 0], [10, 0], [11, 0]], 'o');
  pxs(g, [[6, 0], [7, 0]], 'h');
  pxs(g, [[5, 1], [8, 1], [11, 1], [5, 2], [9, 2], [6, 3], [10, 3]], 'H');
  for (let y = 2; y <= 6; y++) {
    set(g, 3, y, y % 2 ? 'H' : 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, y % 2 ? 'h' : 'H');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 1, 3, 1, 'o');
  fill(g, 12, 1, 13, 1, 'o');
  fill(g, 2, 7, 3, 7, 'o');
  fill(g, 12, 7, 13, 7, 'o');
}

/* ---- headwear ---------------------------------------------------- */

/** Baseball cap with a visor. */
function cap(g) {
  fill(g, 5, 2, 10, 2, 'o');
  fill(g, 4, 3, 11, 3, 'c');
  pxs(g, [[3, 3], [12, 3]], 'o');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 3, 5, 12, 5, 'C'); // visor
  pxs(g, [[2, 5], [13, 5], [3, 6], [12, 6]], 'o');
  set(g, 7, 2, 'C');
}

/** Backwards baseball cap: visor points back, snapback in front. */
function capBack(g) {
  fill(g, 5, 2, 10, 2, 'o');
  fill(g, 4, 3, 11, 3, 'c');
  pxs(g, [[3, 3], [12, 3]], 'o');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 5, 5, 10, 5, 'C');
  pxs(g, [[3, 4], [4, 4], [11, 4], [12, 4]], 'C'); // visor tails on the sides
  pxs(g, [[2, 4], [13, 4], [3, 5], [4, 5], [11, 5], [12, 5]], 'o');
  pxs(g, [[7, 5], [8, 5]], 'c'); // snapback
}

/** Knit beanie with a fold. */
function beanie(g) {
  fill(g, 6, 1, 9, 1, 'c');
  fill(g, 5, 2, 10, 2, 'c');
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 6, 0, 9, 0, 'o');
  pxs(g, [[5, 1], [10, 1], [4, 2], [11, 2], [3, 3], [12, 3]], 'o');
  fill(g, 4, 5, 11, 5, 'C'); // fold
  pxs(g, [[3, 5], [12, 5], [4, 6], [11, 6]], 'o');
}

/** Bandana with a side knot. */
function bandana(g) {
  fill(g, 5, 3, 10, 3, 'c');
  fill(g, 4, 4, 11, 4, 'c');
  fill(g, 5, 5, 10, 5, 'C');
  pxs(g, [[3, 4], [12, 4]], 'o');
  pxs(g, [[12, 5], [13, 5], [13, 6]], 'c'); // knot
  pxs(g, [[11, 5], [14, 5], [12, 6], [14, 6], [12, 7], [13, 7]], 'o');
  // hair peeking out from under the bandana
  pxs(g, [[3, 6], [3, 7], [3, 8]], 'h');
  pxs(g, [[2, 6], [2, 7], [2, 8], [2, 9], [3, 9]], 'o');
}

/** Beret with a "stalk", tilted to one side. */
function beret(g) {
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 2, 11, 2, 'c');
  fill(g, 5, 4, 10, 4, 'c');
  pxs(g, [[12, 3], [12, 4]], 'c');
  fill(g, 5, 1, 10, 1, 'o');
  pxs(g, [[4, 2], [12, 2], [3, 3], [13, 3], [13, 4], [12, 5], [4, 5]], 'o');
  set(g, 8, 1, 'C');
  set(g, 8, 0, 'o');
}

/** Wide-brim bucket hat. */
function bucketHat(g) {
  fill(g, 5, 2, 10, 2, 'c');
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 1, 10, 1, 'o');
  pxs(g, [[4, 2], [11, 2], [3, 3], [12, 3]], 'o');
  fill(g, 2, 4, 13, 4, 'C'); // brim
  fill(g, 3, 5, 12, 5, 'C');
  pxs(g, [[1, 4], [14, 4], [2, 5], [13, 5], [3, 6], [12, 6]], 'o');
}

/** Sports headband. */
function headband(g) {
  fill(g, 5, 4, 10, 4, 'h');
  fill(g, 4, 5, 11, 5, 'c');
  fill(g, 5, 6, 10, 6, 'C');
  pxs(g, [[3, 5], [12, 5], [3, 6], [12, 6]], 'o');
  pxs(g, [[3, 7], [3, 8]], 'c'); // tie end
  pxs(g, [[2, 7], [2, 8], [2, 9], [3, 9]], 'o');
}

/** Headphones: an arc over the head, arms along the temples, ear cups at the ears. */
function headphones(g) {
  fill(g, 4, 1, 11, 1, 'c'); // arc
  fill(g, 4, 0, 11, 0, 'o');
  pxs(g, [[3, 1], [12, 1]], 'c');
  pxs(g, [[3, 0], [12, 0]], 'o');
  for (let y = 2; y <= 5; y++) {
    set(g, 3, y, 'c'); // arm
    set(g, 2, y, 'o');
    set(g, 12, y, 'c');
    set(g, 13, y, 'o');
  }
  for (let y = 6; y <= 8; y++) {
    set(g, 3, y, 'C'); // ear cup
    set(g, 2, y, 'o');
    set(g, 12, y, 'C');
    set(g, 13, y, 'o');
  }
  pxs(g, [[2, 9], [3, 9], [12, 9], [13, 9]], 'o');
}

/* ---- face -------------------------------------------------------- */

/**
 * Glasses: the top rim with the bridge sits on the brow row, side rims below.
 * The eye row is intentionally untouched — at 16 px glasses would merge into
 * a black bar otherwise.
 */
function glasses(g) {
  fill(g, 5, 6, 10, 6, 'g');
  pxs(g, [[5, 8], [6, 8], [9, 8], [10, 8]], 'g');
}

/** Moustache: the mouth drops one row. */
function moustache(g) {
  fill(g, 6, 9, 9, 9, 'b');
  pxs(g, [[7, 10], [8, 10]], 'm');
}

/** Beard: sideburns, cheekbones, and chin; `long` adds a wedge onto the neck. */
function beard(g, { long = false } = {}) {
  pxs(g, [[5, 7], [10, 7], [5, 8], [10, 8], [5, 9], [10, 9], [6, 9], [9, 9]], 'b');
  fill(g, 5, 10, 10, 10, 'b');
  pxs(g, [[7, 9], [8, 9]], 'm');
  if (long) {
    fill(g, 6, 11, 9, 11, 'b');
    fill(g, 7, 12, 8, 12, 'b');
  }
}

/* ---- clothing ---------------------------------------------------- */

function collarPolo(g) {
  pxs(g, [[5, 13], [6, 13], [9, 13], [10, 13]], 'T');
  pxs(g, [[7, 14], [8, 15]], 'T');
}

function collarSweater(g) {
  fill(g, 4, 13, 6, 13, 'T');
  fill(g, 9, 13, 11, 13, 'T');
  pxs(g, [[3, 14], [12, 14], [2, 15], [13, 15]], 'T');
}

function collarV(g) {
  pxs(g, [[7, 13], [8, 13], [7, 14], [8, 14]], 'd');
  pxs(g, [[6, 13], [9, 13], [6, 14], [9, 14], [7, 15], [8, 15]], 'T');
}

function cardigan(g) {
  fill(g, 7, 13, 8, 15, 'T'); // zipper placket
  pxs(g, [[4, 13], [11, 13], [3, 14], [12, 14]], 'T');
}

function stripe(g) {
  for (let x = 0; x < 16; x++) if (g[14][x] === 't') g[14][x] = 'T';
}

function hoodie(g) {
  for (let y = 5; y <= 12; y++) {
    set(g, 3, y, 'T');
    set(g, 2, y, 'o');
    set(g, 12, y, 'T');
    set(g, 13, y, 'o');
  }
  fillNeckGap(g, 12, 'T');
  fill(g, 2, 13, 4, 13, 'T');
  fill(g, 11, 13, 13, 13, 'T');
  pxs(g, [[6, 14], [9, 14], [6, 15], [9, 15]], 'T');
}

/* ------------------------------------------------------------------ */
/* 24 characters — labels describe the drawn portrait (generator-internal; */
/* the user-facing call signs live in the i18n dictionaries)               */
/* ------------------------------------------------------------------ */

const AVATARS = [
  {
    id: 'pixel-01', label: 'Redhead in a cap',
    skin: 'fair', hair: 'ginger', shirt: 'steel', accent: 'navy',
    hat: CITRUS, hatAccent: '#C26A00',
    draw: (g) => { crop(g); cap(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-02', label: 'Woman with a bob cut',
    skin: 'light', hair: 'darkbrown', shirt: 'plum', accent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-03', label: 'Bearded man in glasses',
    skin: 'tan', hair: 'darkbrown', shirt: 'olive', accent: '#3A5541',
    beard: '#332215',
    draw: (g) => { crop(g); beard(g, { long: true }); glasses(g); collarSweater(g); },
  },
  {
    id: 'pixel-04', label: 'Curly-haired woman in headphones',
    skin: 'brown', hair: 'black', shirt: 'moss', accent: LIME,
    hat: '#2F4858', hatAccent: CITRUS,
    draw: (g) => { curly(g); headphones(g); stripe(g); },
  },
  {
    id: 'pixel-05', label: 'Blond man in a hoodie',
    skin: 'light', hair: 'blond', shirt: 'ash', accent: '#7A6A55',
    draw: (g) => { hairCrown(g); bangs(g); hoodie(g); },
  },
  {
    id: 'pixel-06', label: 'Brunette with a ponytail',
    skin: 'fair', hair: 'black', shirt: 'navy', accent: '#4A6E8A',
    draw: (g) => { ponytail(g); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-07', label: 'Gray-haired man in a sweater',
    skin: 'light', hair: 'grey', shirt: 'brick', accent: '#9C6350',
    draw: (g) => { crop(g); ears(g); collarSweater(g); },
  },
  {
    id: 'pixel-08', label: 'Woman in a bandana',
    skin: 'tan', hair: 'darkbrown', shirt: 'olive', accent: '#6E8A56',
    hat: '#C1442E', hatAccent: '#94301F',
    draw: (g) => { bandana(g); stripe(g); },
  },
  {
    id: 'pixel-09', label: 'Man with a mustache',
    skin: 'fair', hair: 'ash', shirt: 'slate', accent: '#6B7E92',
    beard: '#6A5033',
    draw: (g) => { crop(g); ears(g); moustache(g); collarPolo(g); },
  },
  {
    id: 'pixel-10', label: 'Redhead with braids',
    skin: 'light', hair: 'ginger', shirt: 'plum', accent: '#8C5064',
    hatAccent: CITRUS,
    draw: (g) => { braids(g); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-11', label: 'Bald man in glasses',
    skin: 'tan', hair: 'darkbrown', shirt: 'ash', accent: '#7D7264',
    draw: (g) => { bald(g); glasses(g); collarPolo(g); },
  },
  {
    id: 'pixel-12', label: 'Woman in a beret',
    skin: 'light', hair: 'auburn', shirt: 'sand', accent: '#B08E5F',
    hat: '#6E3B4B', hatAccent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 11); beret(g); collarV(g); },
  },
  {
    id: 'pixel-13', label: 'Athlete with a headband',
    skin: 'fair', hair: 'darkbrown', shirt: 'navy', accent: LIME,
    hat: LIME, hatAccent: '#7FB425',
    draw: (g) => { crop(g); headband(g); stripe(g); },
  },
  {
    id: 'pixel-14', label: 'Dark-haired woman in a cardigan',
    skin: 'deep', hair: 'black', shirt: 'brick', accent: '#A8664B',
    draw: (g) => { hairCrown(g); hairSides(g, 9); bangs(g); cardigan(g); },
  },
  {
    id: 'pixel-15', label: 'Man with dreadlocks',
    skin: 'brown', hair: 'black', shirt: 'olive', accent: '#6E8A56',
    draw: (g) => { dreads(g); collarV(g); },
  },
  {
    id: 'pixel-16', label: 'Woman in a bucket hat',
    skin: 'light', hair: 'blond', shirt: 'moss', accent: LIME,
    hat: '#7A6A55', hatAccent: '#94826A',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bucketHat(g); stripe(g); },
  },
  {
    id: 'pixel-17', label: 'Hipster with a beard',
    skin: 'fair', hair: 'darkbrown', shirt: 'rust', accent: '#C97A44',
    beard: '#3D2A1B',
    draw: (g) => { hairCrown(g); bangs(g); beard(g, { long: true }); collarSweater(g); },
  },
  {
    id: 'pixel-18', label: 'Short-cropped hair',
    skin: 'brown', hair: 'black', shirt: 'slate', accent: '#6B7E92',
    draw: (g) => { crop(g); ears(g); collarPolo(g); },
  },
  {
    id: 'pixel-19', label: 'Man in a backwards cap',
    skin: 'fair', hair: 'ash', shirt: 'ash', accent: '#7D7264',
    hat: '#3F5B72', hatAccent: CITRUS,
    draw: (g) => { crop(g); capBack(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-20', label: 'Woman in glasses',
    skin: 'light', hair: 'ash', shirt: 'plum', accent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bangs(g); glasses(g); collarV(g); },
  },
  {
    id: 'pixel-21', label: 'Fair-haired man in a polo',
    skin: 'fair', hair: 'lightbrown', shirt: 'olive', accent: 'cream',
    draw: (g) => { crop(g); ears(g); collarPolo(g); },
  },
  {
    id: 'pixel-22', label: 'Afro hairstyle',
    skin: 'deep', hair: 'black', shirt: 'citrus', accent: '#C26A00',
    draw: (g) => { afro(g); collarV(g); },
  },
  {
    id: 'pixel-23', label: 'Man in a beanie',
    skin: 'tan', hair: 'darkbrown', shirt: 'ash', accent: '#7D7264',
    hat: '#2F4858', hatAccent: LIME,
    draw: (g) => { crop(g); beanie(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-24', label: 'Woman with bangs',
    skin: 'light', hair: 'copper', shirt: 'steel', accent: '#5C7E9A',
    draw: (g) => { hairCrown(g); hairSides(g, 12); bangs(g); collarV(g); },
  },
];

function avatarPalette(spec) {
  const skin = SKIN[spec.skin];
  const [hair, hairShadow] = HAIR[spec.hair];
  const shirt = SHIRT[spec.shirt] ?? spec.shirt;
  const accent = SHIRT[spec.accent] ?? spec.accent ?? hairShadow;
  return {
    o: OUTLINE,
    s: skin.s,
    d: skin.d,
    m: skin.m,
    e: OUTLINE,
    h: hair,
    H: hairShadow,
    b: spec.beard ?? hairShadow,
    g: OUTLINE,
    c: spec.hat ?? hair,
    C: spec.hatAccent ?? hairShadow,
    t: shirt,
    T: accent,
  };
}

/**
 * Portraits come from DiceBear (`pixel-art` style), not from the matrices above.
 *
 * Files are still static assets in the repo, not requests to api.dicebear.com:
 * the leaderboard renders up to a dozen avatars at once, and a remote host here
 * would mean that many third-party requests per render plus an app that breaks
 * offline. Assets are committed to git exactly as before.
 *
 * `seed` is the preset id itself, so generation is deterministic: rerunning the
 * script yields the same 24 portraits and `avatar_id` values in the DB stay valid.
 */
function buildAvatars() {
  const dir = join(PUBLIC, 'avatars');
  mkdirSync(dir, { recursive: true });
  for (const spec of AVATARS) {
    const svg = createAvatar(pixelArt, {
      seed: spec.id,
      // Citrus backdrop — the same one the avatar wrapper used to provide.
      backgroundColor: ['ff8a00'],
      // The avatar component applies the round mask itself, so no corner clipping here.
      radius: 0,
      // DiceBear's default framing: head centered, shoulders at the bottom — exactly
      // what the round mask needs. No frame around the avatar, no reason to shrink it.
      scale: 100,
    }).toString();
    writeFileSync(join(dir, `${spec.id}.svg`), svg, 'utf8');
  }
  return AVATARS.length;
}

/* ------------------------------------------------------------------ */
/* Walk spritesheet: 8 frames of 32×32 → 256×32                        */
/* ------------------------------------------------------------------ */

const FRAMES = 8;
const FRAME = 32;

const WALK_PALETTE = {
  O: OUTLINE,
  K: '#E8B48A', // skin
  D: '#C68E62', // skin shadow
  M: '#94513F', // mouth
  H: '#4B3423', // hair
  S: CITRUS, // shirt
  s: '#C96C00', // shirt, shaded side and near arm
  a: '#8F4B00', // far arm
  P: '#3F5B72', // pants, near leg
  p: '#2A3E4F', // pants, far leg
  B: '#241C16', // shoe
  b: '#171210', // far shoe
};

/** Thick Bresenham line — a limb "bone" of width t. */
function limb(g, ox, x0, y0, x1, y1, ch, t = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let k = 0; k < t; k++) set(g, ox + x + k, y, ch);
  }
}

/**
 * Limb parameters for phase p.
 * A cosine component is added on top of the sine — without it frames 1 and 3
 * (and 5 and 7) would share a position and the cycle would look four-frame.
 */
function limbPhase(p) {
  const swing = Math.max(0, Math.cos(p)); // leg swings forward — knee bent, foot lifted
  return {
    dx: Math.round(4 * Math.sin(p)),
    knee: Math.round(2 * Math.sin(p) + 1.5 * swing),
    lift: Math.round(1.4 * swing),
  };
}

function drawLeg(g, ox, prm, dy, chLeg, chShoe) {
  const hipX = 16;
  const hipY = 23 + dy;
  const kneeX = 16 + prm.knee;
  const kneeY = 26 + dy;
  // the foot ignores the torso bob: the ground line must stay put, otherwise
  // the character "sinks" through the floor on crouching frames
  const ankleX = 16 + prm.dx;
  const ankleY = 29 - prm.lift;
  limb(g, ox, hipX, hipY, kneeX, kneeY, chLeg, 2);
  limb(g, ox, kneeX, kneeY, ankleX, ankleY, chLeg, 2);
  fill(g, ox + ankleX - 1, ankleY + 1, ox + ankleX + 2, ankleY + 1, chShoe);
}

function drawArm(g, ox, prm, dy, ch, chHand) {
  const shX = 16;
  const shY = 15 + dy;
  const elX = 16 + Math.round(prm.knee * 0.8);
  const elY = 18 + dy;
  const haX = 16 + Math.round(prm.dx * 0.9);
  const haY = 21 + dy;
  limb(g, ox, shX, shY, elX, elY, ch, 2);
  limb(g, ox, elX, elY, haX, haY, ch, 2);
  fill(g, ox + haX, haY + 1, ox + haX + 1, haY + 1, chHand); // hand
}

function drawWalkFrame(g, index) {
  const ox = index * FRAME;
  const p = (index / FRAMES) * Math.PI * 2;
  const near = limbPhase(p);
  const far = limbPhase(p + Math.PI);
  const dy = Math.abs(near.dx) >= 4 ? 1 : 0; // torso dips at full stride

  // far leg and far arm sit under the torso, so they are drawn first
  drawLeg(g, ox, far, dy, 'p', 'b');
  drawArm(g, ox, far, dy, 'a', 'D');

  // torso
  fill(g, ox + 13, 14 + dy, ox + 19, 21 + dy, 'S');
  fill(g, ox + 13, 14 + dy, ox + 13, 21 + dy, 's'); // shaded side of the back
  fill(g, ox + 13, 22 + dy, ox + 19, 23 + dy, 'P');
  for (let y = 14 + dy; y <= 23 + dy; y++) {
    set(g, ox + 12, y, 'O');
    set(g, ox + 20, y, 'O');
  }

  // head, side view, facing right
  fill(g, ox + 13, 5 + dy, ox + 20, 12 + dy, 'K');
  fill(g, ox + 13, 5 + dy, ox + 20, 6 + dy, 'H');
  fill(g, ox + 13, 7 + dy, ox + 15, 10 + dy, 'H'); // back of the head
  for (let x = 13; x <= 20; x++) {
    set(g, ox + x, 4 + dy, 'O');
    set(g, ox + x, 13 + dy, 'O');
  }
  for (let y = 5 + dy; y <= 12 + dy; y++) {
    set(g, ox + 12, y, 'O');
    set(g, ox + 21, y, 'O');
  }
  set(g, ox + 18, 9 + dy, 'O'); // eye
  set(g, ox + 20, 11 + dy, 'M'); // mouth
  set(g, ox + 16, 10 + dy, 'D'); // ear
  fill(g, ox + 19, 12 + dy, ox + 20, 12 + dy, 'D'); // chin

  // near leg and near arm (the arm swings in antiphase to the leg)
  drawLeg(g, ox, near, dy, 'P', 'B');
  drawArm(g, ox, near, dy, 's', 'K');
}

function buildWalkSprite() {
  const dir = join(PUBLIC, 'sprites');
  mkdirSync(dir, { recursive: true });
  const g = emptyGrid(FRAME * FRAMES, FRAME);
  for (let i = 0; i < FRAMES; i++) drawWalkFrame(g, i);
  assertGrid(g, 256, 32, 'walk');
  const svg = gridToSvgRuns(g, WALK_PALETTE, { size: [256, 32], viewBox: '0 0 256 32' });
  writeFileSync(join(dir, 'walk.svg'), svg, 'utf8');
  return 1;
}

/* ------------------------------------------------------------------ */
/* Cleanup of default Next assets                                      */
/* ------------------------------------------------------------------ */

function cleanDefaults() {
  const defaults = ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg'];
  let removed = 0;
  for (const f of defaults) {
    const p = join(PUBLIC, f);
    if (existsSync(p)) {
      rmSync(p);
      removed++;
    }
  }
  return removed;
}

/* ------------------------------------------------------------------ */

const avatars = buildAvatars();
const sprites = buildWalkSprite();
const removed = cleanDefaults();

console.log(`Avatars: ${avatars} · sprites: ${sprites} · defaults removed: ${removed}`);
