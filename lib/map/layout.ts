import {
  MAP_BENDS_PER_SEGMENT_MAX,
  MAP_DECOR_MAX,
  MAP_GRID_H,
  MAP_GRID_W,
} from '@/lib/config';
import type { MapDecorKind, MapLayoutDto, RouteCityDto } from '@/lib/types';

/**
 * Pixel-map layouts (spec § 6.12.5).
 *
 * Two producers, one contract: the LLM layout is normalized by
 * `normalizeLayout`, and when there is none, `fallbackLayout` builds a
 * deterministic serpentine — seeded from the route itself, because the render
 * must be stable between SSR and the client (no runtime randomness).
 */

/** Margin that keeps cities, labels and decor away from the parchment frame. */
const MARGIN = 8;

/** FNV-1a: a stable numeric seed from the route contents. */
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny deterministic PRNG; quality is irrelevant, stability is. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECOR_KINDS: MapDecorKind[] = [
  'tree',
  'tree',
  'mountain',
  'tree',
  'lake',
  'house',
  'mountain',
  'anchor',
];

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Deterministic serpentine layout: cities evenly along an S-shaped trail,
 * decor scattered by the seeded PRNG away from the trail. Looks game-y without
 * any geographic plausibility — that part is the LLM's job (spec § 6.12.5).
 */
export function fallbackLayout(points: RouteCityDto[], seedText?: string): MapLayoutDto {
  const seed = hashSeed(seedText ?? points.map((p) => `${p.city}:${p.km}`).join('|'));
  const random = mulberry32(seed);

  const n = Math.max(points.length, 2);
  const rows = n <= 5 ? 1 : n <= 12 ? 2 : 3;
  const perRow = Math.ceil(n / rows);

  const xMin = MARGIN;
  const xMax = MAP_GRID_W - MARGIN;
  const yMin = MARGIN;
  const yMax = MAP_GRID_H - MARGIN;
  const rowY = (row: number) =>
    rows === 1 ? Math.round((yMin + yMax) / 2) : Math.round(yMin + (row * (yMax - yMin)) / (rows - 1));

  const cities = points.map((point, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    // Serpentine: odd rows run right-to-left.
    const along = row % 2 === 0 ? col : perRow - 1 - col;
    const denominator = Math.max(perRow - 1, 1);
    const x = Math.round(xMin + (along * (xMax - xMin)) / denominator);
    return { city: point.city, x, y: rowY(row) };
  });

  // A bend at each row turn keeps the trail from cutting diagonally across.
  const bends: MapLayoutDto['bends'] = [];
  for (let index = perRow - 1; index < points.length - 1; index += perRow) {
    const from = cities[index];
    const to = cities[index + 1];
    if (!to) break;
    const edgeX = from.x >= to.x ? Math.min(xMax + 2, from.x + 4) : Math.max(xMin - 2, from.x - 4);
    bends.push({
      after: from.city,
      x: Math.max(0, Math.min(MAP_GRID_W, edgeX)),
      y: Math.round((from.y + to.y) / 2),
    });
  }

  // Decor: seeded positions rejected near cities, bends and other decor.
  const decor: MapLayoutDto['decor'] = [];
  const obstacles = [...cities, ...bends];
  const wanted = Math.min(MAP_DECOR_MAX, 8 + n);
  for (let attempt = 0; attempt < wanted * 8 && decor.length < wanted; attempt += 1) {
    const x = Math.round(2 + random() * (MAP_GRID_W - 8));
    const y = Math.round(2 + random() * (MAP_GRID_H - 8));
    const nearObstacle = obstacles.some((o) => distance(o.x, o.y, x, y) < 7);
    const nearDecor = decor.some((d) => distance(d.x, d.y, x, y) < 6);
    if (nearObstacle || nearDecor) continue;
    decor.push({ kind: DECOR_KINDS[decor.length % DECOR_KINDS.length], x, y });
  }

  return { cities, bends, decor };
}

const cityKey = (name: string): string => name.trim().toLocaleLowerCase('ru-RU');

/**
 * Post-filter for an LLM layout (spec § 6.12.5): every route city exactly
 * once, coordinates clamped into the grid, overlapping cities nudged apart,
 * junk bends and excess decor dropped. Returns null when the layout cannot be
 * reconciled with the route — the caller falls back to `fallbackLayout`.
 */
export function normalizeLayout(
  raw: MapLayoutDto,
  points: RouteCityDto[],
): MapLayoutDto | null {
  const byCity = new Map<string, { x: number; y: number }>();
  for (const entry of raw.cities) {
    const key = cityKey(entry.city);
    if (!byCity.has(key)) byCity.set(key, { x: entry.x, y: entry.y });
  }

  const clampX = (x: number) => Math.max(4, Math.min(MAP_GRID_W - 4, Math.round(x)));
  const clampY = (y: number) => Math.max(4, Math.min(MAP_GRID_H - 4, Math.round(y)));

  const cities: MapLayoutDto['cities'] = [];
  for (const point of points) {
    const position = byCity.get(cityKey(point.city));
    // A missing city is unrecoverable: inventing a position would defeat the
    // whole "geographically plausible" purpose of the LLM layout.
    if (!position) return null;
    let x = clampX(position.x);
    let y = clampY(position.y);
    // Nudge collisions apart so two cities never share a dot: try offset
    // rings of growing radius; clamping near the frame can void an offset,
    // so candidates are checked, not blindly applied.
    if (cities.some((c) => distance(c.x, c.y, x, y) < 4)) {
      outer: for (const r of [4, 6, 9, 12, 18, 24]) {
        for (const [dx, dy] of [
          [r, 0],
          [0, r],
          [-r, 0],
          [0, -r],
          [r, r],
          [-r, r],
          [r, -r],
          [-r, -r],
        ]) {
          const cx = clampX(x + dx);
          const cy = clampY(y + dy);
          if (cities.every((c) => distance(c.x, c.y, cx, cy) >= 4)) {
            x = cx;
            y = cy;
            break outer;
          }
        }
      }
    }
    cities.push({ city: point.city, x, y });
  }

  const validAfter = new Set(points.slice(0, -1).map((p) => cityKey(p.city)));
  const bendCount = new Map<string, number>();
  const bends: MapLayoutDto['bends'] = [];
  for (const bend of raw.bends) {
    const key = cityKey(bend.after);
    if (!validAfter.has(key)) continue;
    const used = bendCount.get(key) ?? 0;
    if (used >= MAP_BENDS_PER_SEGMENT_MAX) continue;
    bendCount.set(key, used + 1);
    // Keep the original route-order city name so the renderer can match it.
    const cityName = points.find((p) => cityKey(p.city) === key)?.city ?? bend.after;
    bends.push({ after: cityName, x: clampX(bend.x), y: clampY(bend.y) });
  }

  const decor = raw.decor
    .slice(0, MAP_DECOR_MAX)
    .map((d) => ({ kind: d.kind, x: clampX(d.x), y: clampY(d.y) }))
    // Decor sitting on a city dot hides it — drop such pieces.
    .filter((d) => cities.every((c) => distance(c.x, c.y, d.x, d.y) >= 4));

  return { cities, bends, decor };
}
